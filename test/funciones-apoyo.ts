import type { Sesion } from '../src/auth/sesion.js';
import { CacheCatalogos } from '../src/busqueda/catalogo.js';
import type { Fila, ValorParametro } from '../src/db/firebird.js';
import { construirCatalogo } from '../src/funciones/cargar.js';
import { resolverHandlers } from '../src/funciones/handlers.js';
import { esquemaArchivoFunciones } from '../src/funciones/esquema.js';
import { SQL_METADATA_PROCEDURE } from '../src/funciones/procedure.js';
import { accesoSimulado, conectarCliente, type ManejadorSp } from './apoyo.js';

export const ZONA = 'America/Argentina/Buenos_Aires';

/** RDB$FIELD_TYPE de Firebird. */
export const T = { SMALLINT: 7, INTEGER: 8, BIGINT: 16, DOUBLE: 27, DATE: 12, TIMESTAMP: 35, CHAR: 14, VARCHAR: 37, BOOLEAN: 23 } as const;

export interface ProcedureSimulado {
  /** 1 = seleccionable, 2 = ejecutable. */
  tipo?: 1 | 2;
  entradas?: string[];
  salidas?: Record<string, number>;
}

/** Filas de SQL_METADATA_PROCEDURE para los procedures simulados. */
export function metadataSimulada(procedures: Record<string, ProcedureSimulado>) {
  return (sql: string, parametros: ValorParametro[]): Fila[] | undefined => {
    if (sql !== SQL_METADATA_PROCEDURE) return undefined;
    const p = procedures[String(parametros[0])];
    if (!p) return [];
    const tipo = p.tipo ?? 1;
    const filas: Fila[] = [
      ...(p.entradas ?? []).map((e) => ({ TIPO_PROCEDURE: tipo, PARAMETRO: e, ES_SALIDA: 0, TIPO_CAMPO: T.INTEGER, ESCALA: 0 })),
      ...Object.entries(p.salidas ?? {}).map(([s, t]) => ({ TIPO_PROCEDURE: tipo, PARAMETRO: s, ES_SALIDA: 1, TIPO_CAMPO: t, ESCALA: 0 })),
    ];
    return filas.length ? filas : [{ TIPO_PROCEDURE: tipo, PARAMETRO: null, ES_SALIDA: null, TIPO_CAMPO: null, ESCALA: null }];
  };
}

export const SESION_VENDEDOR: Sesion = { codUsuario: 874, codDesarrollador: null, codVendedor: 12, transporte: 'http' };

/**
 * Catálogo de prueba a partir de un objeto (sin archivo) sobre una base simulada: procedures con su
 * metadata y manejadores de filas. Devuelve el cliente conectado y lo que registró la base.
 */
export async function catalogoDePrueba(
  tools: unknown[],
  base: { procedures?: Record<string, ProcedureSimulado>; filas?: Record<string, ManejadorSp>; sql?: (sql: string, p: ValorParametro[]) => Fila[] | undefined },
  sesion: Sesion = SESION_VENDEDOR,
  servidor: Record<string, unknown> = { nombre: 'mcp-prueba', claimRequerida: 'COD_VENDEDOR' },
) {
  const metadata = metadataSimulada(base.procedures ?? {});
  const simulado = accesoSimulado(base.filas ?? {}, null, {
    contratoResultado: false,
    sql: (sql, p) => metadata(sql, p) ?? base.sql?.(sql, p),
  });
  const cache = new CacheCatalogos();
  const archivo = esquemaArchivoFunciones.parse({ servidor, tools });
  const catalogo = construirCatalogo(archivo, 'C:/prueba/prueba-functions.json', await resolverHandlers(archivo, undefined), { acceso: simulado.acceso, zonaHoraria: ZONA, cache });
  const conexion = await conectarCliente(catalogo.tools, sesion);
  return { ...simulado, ...conexion, catalogo, cache };
}

/** Llamadas a un procedure (sin las de metadata). */
export const llamadasA = <L extends { nombre: string }>(llamadas: L[], nombre: string) => llamadas.filter((l) => l.nombre === nombre);
