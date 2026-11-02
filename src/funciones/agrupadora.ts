import { z } from 'zod';
import { CLAVES_IDENTIDAD } from '../auth/jwt.js';
import { claimsDeSesion, type Sesion } from '../auth/sesion.js';
import { aplicarBusqueda, claveCache, type CampoBusqueda } from '../busqueda/catalogo.js';
import { ErrorTool } from '../errores.js';
import { ANOTACIONES_LECTURA, esquemaJson } from '../nucleo/esquema-json.js';
import type { TipoSalida } from './esquema.js';
import { nombreExpuesto, PARAMETRO_BUSCAR } from './parametros.js';
import { campoDeReferencia, normalizarSalida, type Campo } from './salida.js';
import { ErrorFunciones } from './textos.js';
import type { ContextoHandler, ToolDatosConstruida, ToolSinTextos } from './tipos.js';

type Elemento = Record<string, unknown> & { codigo: number; nombre: string };

/** Campo opcional de un elemento según su tipo (codigo y nombre son siempre obligatorios). */
function zodCampo(tipo: TipoSalida | undefined): z.ZodType {
  switch (tipo) {
    case 'entero':
      return z.number().int().nullable().optional();
    case 'decimal':
      return z.number().nullable().optional();
    case 'booleano':
      return z.boolean().optional();
    default:
      return z.string().nullable().optional();
  }
}

/** Campos de la salida de cada variante, validados: codigo y nombre obligatorios, un mismo campo con un solo tipo. */
function camposDeVariantes(variantes: readonly ToolDatosConstruida[], tool: string): Map<string, Campo[]> {
  const tipos = new Map<string, TipoSalida | undefined>();
  const porVariante = new Map<string, Campo[]>();
  for (const { entrada } of variantes) {
    const campos = entrada.salida ? normalizarSalida(entrada.salida) : [];
    for (const requerido of ['codigo', 'nombre']) {
      if (!campos.some((c) => c.nombre === requerido)) {
        throw new ErrorFunciones(`Variante '${entrada.nombre}' de '${tool}': su 'salida' tiene que definir el campo '${requerido}'.`);
      }
    }
    for (const c of campos) {
      if (c.nombre === 'codigo' || c.nombre === 'nombre') continue;
      if (tipos.has(c.nombre) && tipos.get(c.nombre) !== c.tipo) {
        throw new ErrorFunciones(`Tool '${tool}': el campo '${c.nombre}' tiene tipos distintos en sus variantes.`);
      }
      tipos.set(c.nombre, c.tipo);
    }
    porVariante.set(entrada.nombre, campos);
  }
  return porVariante;
}

/** codigo y nombre nunca nulos; los textos sin espacios en los extremos y vacíos como null. */
function normalizarElemento(fila: Record<string, unknown>): Elemento {
  const elemento: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries(fila)) {
    if (clave === 'codigo') elemento.codigo = valor === null || valor === undefined || valor === '' ? 0 : Number(valor);
    else if (clave === 'nombre') elemento.nombre = valor === null || valor === undefined ? '' : String(valor).trim();
    else if (typeof valor === 'string') elemento[clave] = valor.trim() || null;
    else elemento[clave] = valor ?? null;
  }
  return elemento as Elemento;
}

const identidad = (sesion: Sesion) => {
  const claims = claimsDeSesion(sesion);
  return CLAVES_IDENTIDAD.map((c) => claims[c]).join('|');
};

function resumir(catalogo: string, elementos: readonly Elemento[]): string {
  const muestra = elementos.slice(0, 10).map((e) => `${e.codigo} ${e.nombre}${e.similitud !== undefined ? ` (${String(e.similitud)})` : ''}`);
  const resto = elementos.length > muestra.length ? `; y ${elementos.length - muestra.length} más` : '';
  return `${catalogo}: ${elementos.length} elementos${muestra.length ? `. ${muestra.join('; ')}${resto}` : ''}.`;
}

/**
 * Motor de las tools `"tipo": "agrupadora"` (como `listar_catalogo`): una sola tool para todos los
 * listados simples de opciones. Cada catálogo es una variante (tool procedure o webservice con
 * `"grupo": "<esta tool>"`) declarada en el archivo; este código la elige, la ejecuta y arma una
 * salida uniforme `{ catalogo, elementos, avisos, busqueda? }` con la `salida` de la variante.
 */
export function construirAgrupadora({ nombre: tool, descripcion, variantes, deps }: ContextoHandler): ToolSinTextos {
  const camposPorVariante = camposDeVariantes(variantes, tool);
  const nombres = variantes.map((v) => v.entrada.nombre) as [string, ...string[]];
  const porNombre = new Map(variantes.map((v) => [v.entrada.nombre, v]));
  const conPadre = variantes.some((v) => v.entrada.padre);
  const conBusqueda = variantes.some((v) => v.entrada.busqueda);

  for (const { entrada } of variantes) {
    if (entrada.padre?.catalogo && !porNombre.has(entrada.padre.catalogo)) {
      throw new ErrorFunciones(`Variante '${entrada.nombre}': 'padre.catalogo' = '${entrada.padre.catalogo}' no es una variante de '${tool}'.`);
    }
  }

  const entrada = z
    .object({
      catalogo: z.enum(nombres, { message: `catalogo debe ser uno de: ${nombres.join(', ')}` }),
      ...(conPadre ? { codPadre: z.number().int().positive().optional() } : {}),
      ...(conBusqueda ? { [PARAMETRO_BUSCAR]: z.string().max(200).optional() } : {}),
    })
    .strict();
  type Entrada = { catalogo: string; codPadre?: number; buscar?: string };

  const extras: Record<string, z.ZodType> = {};
  for (const campos of camposPorVariante.values()) {
    for (const c of campos) if (c.nombre !== 'codigo' && c.nombre !== 'nombre') extras[c.nombre] = zodCampo(c.tipo);
  }
  const elemento = z.object({
    codigo: z.number().int(),
    nombre: z.string(),
    ...extras,
    ...(conBusqueda ? { similitud: z.number().int().optional() } : {}),
  });
  const salida = z.object({
    catalogo: z.enum(nombres),
    elementos: z.array(elemento),
    avisos: z.array(z.string()),
    ...(conBusqueda
      ? {
          busqueda: z
            .object({ texto: z.string().nullable(), totalCatalogo: z.number().int(), devueltos: z.number().int(), mensaje: z.string().nullable() })
            .optional(),
        }
      : {}),
  });

  const lineas = variantes.map(({ entrada: v }) => {
    const padre = v.padre
      ? ` — ${(v.padre.requerido ?? true) ? 'requiere' : 'opcional:'} codPadre${v.padre.catalogo ? ` = codigo de '${v.padre.catalogo}'` : ''}`
      : '';
    return `• ${v.nombre}${padre} — ${v.uso ?? v.descripcion}${v.busqueda ? ' [buscar]' : ''}`;
  });

  return {
    descripcion: [descripcion, ...lineas].join('\n'),
    inputSchema: esquemaJson(entrada, 'input'),
    outputSchema: esquemaJson(salida, 'output'),
    annotations: ANOTACIONES_LECTURA,
    entrada,
    async ejecutar(a: Entrada, ctx) {
      const variante = porNombre.get(a.catalogo)!;
      const v = variante.entrada;
      const avisos: string[] = [];

      const args: Record<string, unknown> = {};
      let codPadre: number | null = null;
      if (v.padre) {
        if (a.codPadre === undefined && (v.padre.requerido ?? true)) {
          const origen = v.padre.catalogo ? `: el codigo elegido de '${v.padre.catalogo}'` : '';
          throw new ErrorTool('PARAMETRO_INVALIDO', `${a.catalogo} requiere codPadre${origen}.`);
        }
        codPadre = a.codPadre ?? null;
        const parametro = v.parametros?.find((p) => p.nombre.toUpperCase() === v.padre!.parametro.toUpperCase());
        if (parametro && codPadre !== null) args[nombreExpuesto(parametro)] = codPadre;
      } else if (a.codPadre !== undefined) {
        avisos.push(`codPadre no aplica a ${a.catalogo}: se ignoró.`);
      }
      if (a.buscar !== undefined && !v.busqueda) avisos.push(`buscar no aplica a ${a.catalogo}: se ignoró.`);

      const leer = async () => (await variante.leerFilas(args, ctx.sesion, ctx.medidor)).map(normalizarElemento);

      if (!v.busqueda) {
        const elementos = await leer();
        return { datos: { catalogo: a.catalogo, elementos, avisos }, resumen: resumir(a.catalogo, elementos) };
      }

      const alcance = v.busqueda.cacheAlcance === 'global' ? 'global' : `usuario:${identidad(ctx.sesion)}`;
      const catalogo = await deps.cache.obtener(claveCache(a.catalogo, [codPadre], alcance), v.busqueda.cacheMinutos ?? 0, leer);
      const campos = camposPorVariante.get(v.nombre);
      const camposBusqueda: CampoBusqueda<Elemento>[] = v.busqueda.campos.map((ref) => {
        const nombre = campoDeReferencia(ref, campos);
        return { nombre, texto: (e) => (e[nombre] === null || e[nombre] === undefined ? null : String(e[nombre])) };
      });
      const { elementos, busqueda } = aplicarBusqueda(catalogo, camposBusqueda, a.buscar, {
        ...(v.busqueda.umbral !== undefined ? { umbral: v.busqueda.umbral } : {}),
        ...(v.busqueda.maxResultados !== undefined ? { maxResultados: v.busqueda.maxResultados } : {}),
        ...(v.busqueda.maxSinBusqueda !== undefined ? { maxSinBusqueda: v.busqueda.maxSinBusqueda } : {}),
        parametro: PARAMETRO_BUSCAR,
      });
      return { datos: { catalogo: a.catalogo, elementos, avisos, busqueda }, resumen: busqueda.mensaje ?? resumir(a.catalogo, elementos) };
    },
  };
}
