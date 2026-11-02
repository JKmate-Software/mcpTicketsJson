import type { EjecutarSql } from '../db/firebird.js';
import { ErrorTool } from '../errores.js';
import type { ArchivoFunciones, EntradaDatos } from './esquema.js';
import { leerMetadataProcedure, parametrosInexistentes } from './procedure.js';
import { leerMetodo, traducirSsql } from './webservice.js';

export interface Reporte {
  /** Errores: la tool fallaría al invocarse. */
  problemas: string[];
  /** Riesgos: la tool funciona, pero conviene revisarla. */
  advertencias: string[];
}

export const SQL_ESCRIBE_USER_SESSION =
  "SELECT 1 AS SI FROM RDB$PROCEDURES WHERE RDB$PROCEDURE_NAME = ? AND RDB$PROCEDURE_SOURCE CONTAINING 'RDB$SET_CONTEXT' AND RDB$PROCEDURE_SOURCE CONTAINING 'USER_SESSION'";

/** Procedures que invoca un SSQL (SELECT ... FROM P(...) / EXECUTE PROCEDURE P). */
export function proceduresDeSsql(ssql: string): string[] {
  const { sql } = traducirSsql(ssql);
  const nombres = [...sql.matchAll(/\b(?:FROM|JOIN|EXECUTE\s+PROCEDURE)\s+([A-Za-z][A-Za-z0-9_$]*)\s*(?:\(|$|\s)/gi)].map((m) => m[1]!.toUpperCase());
  return [...new Set(nombres)];
}

const mensaje = (error: unknown) => (error instanceof ErrorTool || error instanceof Error ? error.message : String(error));

/**
 * Verifica contra la base las tools procedure/webservice de un archivo (incluidas las variantes):
 * que existan el procedure o el método y sus parámetros, y advierte si un procedure escribe en
 * USER_SESSION sin `conexionExclusiva`. No ejecuta ninguna tool.
 */
export async function validarContraBase(archivo: ArchivoFunciones, ejecutarSql: EjecutarSql): Promise<Reporte> {
  const reporte: Reporte = { problemas: [], advertencias: [] };
  const declarados = (e: EntradaDatos) => [...(e.parametros ?? []).map((p) => p.nombre), ...(e.campoUsuario ? [e.campoUsuario] : [])];

  async function revisarContexto(e: EntradaDatos, procedures: string[]) {
    if (e.conexionExclusiva) return;
    for (const p of procedures) {
      if ((await ejecutarSql(SQL_ESCRIBE_USER_SESSION, [p])).length) {
        reporte.advertencias.push(
          `Tool '${e.nombre}': el procedure ${p} escribe en USER_SESSION; con el pool, esas claves quedarían para la próxima invocación. Usar "conexionExclusiva": true.`,
        );
      }
    }
  }

  for (const e of archivo.tools) {
    if (e.tipo === 'compleja' || e.tipo === 'agrupadora') continue;
    try {
      if (e.tipo === 'procedure') {
        const metadata = await leerMetadataProcedure(ejecutarSql, e.procedure);
        const sobrantes = parametrosInexistentes(metadata, declarados(e));
        if (sobrantes.length) {
          reporte.problemas.push(`Tool '${e.nombre}': el procedure ${metadata.nombre} no tiene ${sobrantes.join(', ')} (entradas: ${metadata.entradas.join(', ') || 'ninguna'}).`);
        }
        await revisarContexto(e, [metadata.nombre]);
      } else {
        const metodo = await leerMetodo(ejecutarSql, e.metodo);
        const sobrantes = declarados(e).filter((d) => !metodo.parametros.has(d.toUpperCase()));
        if (sobrantes.length) {
          reporte.problemas.push(`Tool '${e.nombre}': el método ${e.metodo} no tiene ${sobrantes.join(', ')} (acepta: ${[...metodo.parametros.keys()].join(', ') || 'ninguno'}).`);
        }
        if (!['DATASET_SQL', 'DATASET_PROCEDURE', 'EXECUTE_SQL', 'EXECUTE_PROCEDURE'].includes(metodo.tipo)) {
          reporte.problemas.push(`Tool '${e.nombre}': el método ${e.metodo} tiene un tipo desconocido (${metodo.tipo}).`);
        }
        if (metodo.tipo.startsWith('EXECUTE') && !e.escritura) {
          reporte.advertencias.push(`Tool '${e.nombre}': el método ${e.metodo} es ${metodo.tipo} y la tool no declara "escritura": true (corre en una transacción de solo lectura).`);
        }
        await revisarContexto(e, proceduresDeSsql(metodo.ssql));
      }
    } catch (error) {
      reporte.problemas.push(`Tool '${e.nombre}': ${mensaje(error)}`);
    }
  }
  return reporte;
}
