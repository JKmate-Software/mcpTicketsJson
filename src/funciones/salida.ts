import type { Fila } from '../db/firebird.js';
import { ErrorTool } from '../errores.js';
import { aFecha, aFechaHoraIso } from '../mapeo/fecha.js';
import type { EsquemaJson } from '../nucleo/definicion.js';
import type { CampoSalida, ConfigBusqueda, TipoSalida } from './esquema.js';

/** COD_BARRIO → codBarrio; NOMBRE → nombre. */
export function camel(columna: string): string {
  const [primera = '', ...resto] = columna.toLowerCase().split('_').filter(Boolean);
  return primera + resto.map((p) => p[0]!.toUpperCase() + p.slice(1)).join('');
}

/** Un campo de la respuesta: de qué columna sale, cómo se llama y cómo se convierte. */
export interface Campo {
  columna: string;
  nombre: string;
  tipo?: TipoSalida;
}

export function normalizarSalida(salida: readonly CampoSalida[]): Campo[] {
  return salida.map((c) =>
    typeof c === 'string' ? { columna: c, nombre: camel(c) } : { columna: c.columna, nombre: c.nombre ?? camel(c.columna), ...(c.tipo ? { tipo: c.tipo } : {}) },
  );
}

/** Tipos de las columnas conocidos por la base (salidas de un procedure). */
export type TiposColumna = ReadonlyMap<string, TipoSalida>;

function convertir(valor: unknown, tipo: TipoSalida | undefined, zonaHoraria: string): unknown {
  // Un indicador es true o false, nunca null (sin valor = false).
  if (tipo === 'booleano') {
    if (typeof valor === 'boolean') return valor;
    const texto = String(valor ?? '').trim().toUpperCase();
    return texto === '1' || texto === 'S' || texto === 'SI' || texto === 'T' || texto === 'TRUE';
  }
  if (valor === null || valor === undefined) return null;
  if (valor instanceof Date) return tipo === 'fecha' ? aFecha(valor) : aFechaHoraIso(valor, zonaHoraria);
  if (tipo === 'entero' || tipo === 'decimal') return typeof valor === 'number' ? valor : Number(valor);
  // CHAR llega con relleno: se recorta el final (los textos no tienen espacios finales con sentido).
  if (typeof valor === 'string') return valor.trimEnd();
  return valor;
}

/** Columna de la fila sin distinguir mayúsculas. */
function columnaDe(fila: Fila, columna: string): string | undefined {
  if (columna in fila) return columna;
  const buscada = columna.toUpperCase();
  return Object.keys(fila).find((c) => c.toUpperCase() === buscada);
}

/**
 * Filas de la base → elementos de la respuesta. Con `salida`, solo esas columnas, en ese orden, con
 * su nombre y tipo; sin `salida`, todas en camelCase. Una columna de `salida` que la consulta no
 * devuelve es un error de configuración: ERROR_INTERNO con las columnas disponibles en el detalle del log.
 */
export function componerFilas(
  filas: readonly Fila[],
  campos: readonly Campo[] | undefined,
  tipos: TiposColumna,
  zonaHoraria: string,
  tool: string,
): Record<string, unknown>[] {
  return filas.map((fila) => {
    if (!campos) {
      return Object.fromEntries(Object.entries(fila).map(([c, v]) => [camel(c), convertir(v, tipos.get(c.toUpperCase()), zonaHoraria)]));
    }
    const elemento: Record<string, unknown> = {};
    for (const campo of campos) {
      const columna = columnaDe(fila, campo.columna);
      if (columna === undefined) {
        throw new ErrorTool('ERROR_INTERNO', `La tool ${tool} declara en 'salida' la columna ${campo.columna}, que la consulta no devuelve.`, {
          columnasDisponibles: Object.keys(fila),
        });
      }
      elemento[campo.nombre] = convertir(fila[columna], campo.tipo ?? tipos.get(columna.toUpperCase()), zonaHoraria);
    }
    return elemento;
  });
}

/** Nombre del campo de la respuesta que corresponde a una columna (o campo) nombrada en `busqueda`. */
export function campoDeReferencia(referencia: string, campos: readonly Campo[] | undefined): string {
  const porColumna = campos?.find((c) => c.columna.toUpperCase() === referencia.toUpperCase());
  if (porColumna) return porColumna.nombre;
  const porNombre = campos?.find((c) => c.nombre === referencia);
  return porNombre ? porNombre.nombre : camel(referencia);
}

const JSON_DE_TIPO: Record<TipoSalida, EsquemaJson> = {
  entero: { type: ['integer', 'null'] },
  decimal: { type: ['number', 'null'] },
  texto: { type: ['string', 'null'] },
  booleano: { type: 'boolean' },
  fecha: { type: ['string', 'null'], format: 'date' },
  fechaHora: { type: ['string', 'null'], format: 'date-time' },
};

/** Esquema de un elemento: con `salida`, sus campos (tipados si declaran tipo); sin `salida`, un objeto libre. */
export function esquemaElemento(campos: readonly Campo[] | undefined, extra: Record<string, EsquemaJson> = {}): EsquemaJson {
  if (!campos) return { type: 'object' };
  return {
    type: 'object',
    properties: { ...Object.fromEntries(campos.map((c) => [c.nombre, c.tipo ? JSON_DE_TIPO[c.tipo] : {}])), ...extra },
    required: campos.map((c) => c.nombre),
  };
}

export const ESQUEMA_BUSQUEDA: EsquemaJson = {
  type: 'object',
  properties: {
    texto: { type: ['string', 'null'] },
    totalCatalogo: { type: 'integer' },
    devueltos: { type: 'integer' },
    mensaje: { type: ['string', 'null'] },
  },
  required: ['texto', 'totalCatalogo', 'devueltos', 'mensaje'],
};

/** outputSchema de una tool procedure/webservice: `{ resultado, hayMas?, busqueda? }`. */
export function esquemaSalidaDatos(campos: readonly Campo[] | undefined, busqueda: ConfigBusqueda | undefined, maxFilas: number | undefined): EsquemaJson {
  const elemento = esquemaElemento(campos, busqueda ? { similitud: { type: 'integer' } } : {});
  return {
    type: 'object',
    properties: {
      resultado: { type: 'array', items: elemento },
      ...(maxFilas ? { hayMas: { type: 'boolean' } } : {}),
      ...(busqueda ? { busqueda: ESQUEMA_BUSQUEDA } : {}),
    },
    required: ['resultado'],
  };
}
