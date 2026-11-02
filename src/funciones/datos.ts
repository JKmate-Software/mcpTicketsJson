import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import { CLAVES_IDENTIDAD } from '../auth/jwt.js';
import { claimsDeSesion, CLAVES_CONTEXTO, type Sesion } from '../auth/sesion.js';
import { aplicarBusqueda, claveCache, type CampoBusqueda } from '../busqueda/catalogo.js';
import type { EjecutarSql, Fila, ValorParametro } from '../db/firebird.js';
import { ErrorTool } from '../errores.js';
import type { Medidor } from '../nucleo/definicion.js';
import { ANOTACIONES_LECTURA } from '../nucleo/esquema-json.js';
import type { ConfigRechazo, EntradaDatos } from './esquema.js';
import { esquemaEntradaDatos, nombreExpuesto, PARAMETRO_BUSCAR, resolverParametros } from './parametros.js';
import { ejecutarProcedure, leerMetadataProcedure, parametrosInexistentes, type MetadataProcedure } from './procedure.js';
import { campoDeReferencia, componerFilas, esquemaSalidaDatos, normalizarSalida, type Campo, type TiposColumna } from './salida.js';
import { ErrorFunciones, tituloDesdeNombre } from './textos.js';
import type { DependenciasFunciones, ToolDatosConstruida } from './tipos.js';
import { crearEjecutorWebservice } from './webservice.js';

/** Cómo corre una tool según su tipo: devuelve las filas crudas y los tipos de columna que conozca. */
export type Ejecutor = (ejecutarSql: EjecutarSql, valores: Record<string, ValorParametro>) => Promise<{ filas: Fila[]; tipos: TiposColumna }>;

/** gdscode de una excepción de usuario de Firebird (EXCEPTION en un procedure o trigger). */
const GDS_EXCEPCION_USUARIO = 335544517;

/** Texto de una excepción de usuario, sin el encabezado "exception N", el nombre ni la traza "At procedure". */
export function mensajeExcepcion(mensaje: string): string {
  const sinTraza = mensaje.replace(/\s*-?At (procedure|trigger|block|function)\b[\s\S]*$/i, '');
  const lineas = sinTraza
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^exception \d+$/i.test(l) && !/^[A-Z][A-Z0-9_$]*$/.test(l));
  return lineas.join(' ').trim() || 'La base rechazó la operación.';
}

/** Excepción de usuario de Firebird → OPERACION_RECHAZADA con su texto; el resto sigue igual. */
export function traducirErrorBase(error: unknown): unknown {
  if (error instanceof ErrorTool) return error;
  const e = error as { gdscode?: unknown; message?: unknown } | null;
  if (e && e.gdscode === GDS_EXCEPCION_USUARIO) {
    return new ErrorTool('OPERACION_RECHAZADA', mensajeExcepcion(typeof e.message === 'string' ? e.message : ''));
  }
  return error;
}

/** Valor de una columna sin distinguir mayúsculas. */
function valorColumna(fila: Fila | undefined, columna: string): unknown {
  if (!fila) return undefined;
  const clave = Object.keys(fila).find((c) => c.toUpperCase() === columna.toUpperCase());
  return clave === undefined ? undefined : fila[clave];
}

/** Rechazo de negocio informado en la primera fila: OPERACION_RECHAZADA (y, al lanzar, rollback). */
function verificarRechazo(rechazo: ConfigRechazo | undefined, filas: readonly Fila[], tool: string) {
  if (!rechazo) return;
  const valor = valorColumna(filas[0], rechazo.columna);
  if (rechazo.valoresExito.some((exito) => String(exito) === String(valor ?? '').trim())) return;
  const mensaje = rechazo.columnaMensaje ? String(valorColumna(filas[0], rechazo.columnaMensaje) ?? '').trim() : '';
  throw new ErrorTool('OPERACION_RECHAZADA', mensaje || `La base rechazó la operación de ${tool} (${rechazo.columna} = ${String(valor ?? 'sin valor')}).`);
}

/** Contexto USER_SESSION de la invocación: todas las claves, NULL las vacías (borra lo que dejó otra sesión). */
export function contextoDeSesion(sesion: Sesion): Record<string, string | null> {
  const claims = claimsDeSesion(sesion);
  return Object.fromEntries(CLAVES_CONTEXTO.map((c) => [c, claims[c] === '' ? null : claims[c]]));
}

/** Identidad para la clave de caché de búsqueda con alcance "usuario". */
const identidad = (sesion: Sesion) => {
  const claims = claimsDeSesion(sesion);
  return CLAVES_IDENTIDAD.map((c) => claims[c]).join('|');
};

function ordenar(elementos: Record<string, unknown>[], orden: EntradaDatos['orden']): Record<string, unknown>[] {
  if (!orden) return elementos;
  const comparar = (a: unknown, b: unknown) => {
    if (a === b) return 0;
    if (a === null || a === undefined) return 1;
    if (b === null || b === undefined) return -1;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b), 'es');
  };
  return [...elementos].sort((x, y) => {
    for (const { campo, desc } of orden) {
      const r = comparar(x[campo], y[campo]);
      // Los nulos van al final en los dos sentidos.
      if (r !== 0) return desc && x[campo] !== null && x[campo] !== undefined && y[campo] !== null && y[campo] !== undefined ? -r : r;
    }
    return 0;
  });
}

function anotaciones(entrada: EntradaDatos): ToolAnnotations {
  if (!entrada.escritura) return ANOTACIONES_LECTURA;
  return { readOnlyHint: false, destructiveHint: entrada.destructiva ?? false, idempotentHint: false, openWorldHint: false };
}

function ejecutorProcedure(entrada: EntradaDatos & { tipo: 'procedure' }): Ejecutor {
  // La metadata se lee una vez por tool construida: una recarga del archivo crea la tool de nuevo.
  let metadata: Promise<MetadataProcedure> | undefined;
  const declarados = (entrada.parametros ?? []).map((p) => p.nombre);
  return async (ejecutarSql, valores) => {
    metadata ??= leerMetadataProcedure(ejecutarSql, entrada.procedure).catch((error: unknown) => {
      metadata = undefined;
      throw error;
    });
    const m = await metadata;
    const sobrantes = parametrosInexistentes(m, [...declarados, ...(entrada.campoUsuario ? [entrada.campoUsuario] : [])]);
    if (sobrantes.length) {
      throw new ErrorTool(
        'ERROR_INTERNO',
        `La tool ${entrada.nombre} declara ${sobrantes.join(', ')}, que el procedure ${m.nombre} no tiene (entradas: ${m.entradas.join(', ') || 'ninguna'}).`,
      );
    }
    return { filas: await ejecutarProcedure(ejecutarSql, m, valores), tipos: m.salidas };
  };
}

/** Construye una tool `procedure` o `webservice` (y las variantes de un grupo). */
export function construirToolDatos(entrada: EntradaDatos, deps: DependenciasFunciones): ToolDatosConstruida {
  const { entrada: validador, inputSchema } = esquemaEntradaDatos(entrada);
  const campos: Campo[] | undefined = entrada.salida ? normalizarSalida(entrada.salida) : undefined;
  const ejecutor = entrada.tipo === 'procedure' ? ejecutorProcedure(entrada) : crearEjecutorWebservice(entrada, deps);
  const noSanitizar = (entrada.parametros ?? []).filter((p) => p.sanitizar === false).map(nombreExpuesto);

  for (const ref of entrada.orden?.map((o) => o.campo) ?? []) {
    if (campos && !campos.some((c) => c.nombre === ref)) {
      throw new ErrorFunciones(`Tool '${entrada.nombre}': 'orden' usa '${ref}', que no es un campo de su 'salida'.`);
    }
  }
  for (const ref of entrada.busqueda?.campos ?? []) {
    const nombre = campoDeReferencia(ref, campos);
    if (campos && !campos.some((c) => c.nombre === nombre)) {
      throw new ErrorFunciones(`Tool '${entrada.nombre}': 'busqueda.campos' usa '${ref}', que no está en su 'salida'.`);
    }
  }

  async function leerFilas(args: Record<string, unknown>, sesion: Sesion, medidor: Medidor) {
    const valores = resolverParametros(entrada, args, sesion, deps.zonaHoraria);
    try {
      const elementos = await deps.acceso.enTransaccionConContexto(
        { contexto: contextoDeSesion(sesion), escritura: entrada.escritura ?? false, exclusiva: entrada.conexionExclusiva ?? false },
        async (ejecutarSql) => {
          const { filas, tipos } = await ejecutor(ejecutarSql, valores);
          verificarRechazo(entrada.rechazo, filas, entrada.nombre);
          return componerFilas(filas, campos, tipos, deps.zonaHoraria, entrada.nombre);
        },
        medidor,
      );
      return ordenar(elementos, entrada.orden);
    } catch (error) {
      throw traducirErrorBase(error);
    }
  }

  const proyectar = (elementos: Record<string, unknown>[]) => {
    const columnas = entrada.busqueda?.columnas?.map((c) => campoDeReferencia(c, campos));
    if (!columnas) return elementos;
    return elementos.map((e) => Object.fromEntries([...columnas, 'similitud'].filter((c) => c in e).map((c) => [c, e[c]])));
  };

  const tool: ToolDatosConstruida['tool'] = {
    nombre: entrada.nombre,
    titulo: entrada.titulo ?? tituloDesdeNombre(entrada.nombre),
    descripcion: entrada.descripcion,
    inputSchema,
    outputSchema: esquemaSalidaDatos(campos, entrada.busqueda, entrada.maxFilas),
    annotations: anotaciones(entrada),
    entrada: validador,
    ...(noSanitizar.length ? { noSanitizar } : {}),
    ...(entrada.tipo === 'webservice' ? { sanitizacionPropia: true } : {}),
    async ejecutar(args: Record<string, unknown>, ctx) {
      const { [PARAMETRO_BUSCAR]: buscar, ...resto } = args;
      const busqueda = entrada.busqueda;
      if (!busqueda) {
        const filas = await leerFilas(resto, ctx.sesion, ctx.medidor);
        const max = entrada.maxFilas;
        const hayMas = max !== undefined && filas.length > max;
        const resultado = proyectar(max !== undefined ? filas.slice(0, max) : filas);
        const datos = { resultado, ...(max !== undefined ? { hayMas } : {}) };
        return { datos, resumen: `${entrada.nombre}: ${resultado.length} ${resultado.length === 1 ? 'fila' : 'filas'}${hayMas ? ' (hay más)' : ''}.` };
      }

      const valores = resolverParametros(entrada, resto, ctx.sesion, deps.zonaHoraria);
      const alcance = busqueda.cacheAlcance === 'global' ? 'global' : `usuario:${identidad(ctx.sesion)}`;
      const clave = claveCache(entrada.nombre, Object.keys(valores).sort().map((k) => valores[k] ?? null), alcance);
      const catalogo = await deps.cache.obtener(clave, busqueda.cacheMinutos ?? 0, () => leerFilas(resto, ctx.sesion, ctx.medidor));
      const camposBusqueda: CampoBusqueda<Record<string, unknown>>[] = busqueda.campos.map((ref) => {
        const nombre = campoDeReferencia(ref, campos);
        return { nombre, texto: (e) => (e[nombre] === null || e[nombre] === undefined ? null : String(e[nombre])) };
      });
      const { elementos, busqueda: meta } = aplicarBusqueda(catalogo, camposBusqueda, typeof buscar === 'string' ? buscar : undefined, {
        ...(busqueda.umbral !== undefined ? { umbral: busqueda.umbral } : {}),
        ...(busqueda.maxResultados !== undefined ? { maxResultados: busqueda.maxResultados } : {}),
        ...(busqueda.maxSinBusqueda !== undefined ? { maxSinBusqueda: busqueda.maxSinBusqueda } : {}),
        parametro: PARAMETRO_BUSCAR,
      });
      const resultado = proyectar(elementos);
      return { datos: { resultado, busqueda: meta }, resumen: meta.mensaje ?? `${entrada.nombre}: ${resultado.length} ${resultado.length === 1 ? 'fila' : 'filas'}.` };
    },
  };

  return { entrada, tool, leerFilas };
}
