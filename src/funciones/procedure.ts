import type { EjecutarSql, Fila, ValorParametro } from '../db/firebird.js';
import { ErrorTool } from '../errores.js';
import type { TipoSalida } from './esquema.js';

/** Metadata de un procedure leída de RDB$PROCEDURES / RDB$PROCEDURE_PARAMETERS / RDB$FIELDS. */
export interface MetadataProcedure {
  nombre: string;
  /** 1 = seleccionable (SELECT * FROM), 2 = ejecutable (EXECUTE PROCEDURE). */
  seleccionable: boolean;
  /** Entradas en el orden de la firma. */
  entradas: string[];
  /** Tipo de cada salida (en MAYÚSCULAS). */
  salidas: Map<string, TipoSalida>;
}

export const SQL_METADATA_PROCEDURE =
  'SELECT p.RDB$PROCEDURE_TYPE AS TIPO_PROCEDURE, TRIM(pp.RDB$PARAMETER_NAME) AS PARAMETRO, pp.RDB$PARAMETER_TYPE AS ES_SALIDA, ' +
  'f.RDB$FIELD_TYPE AS TIPO_CAMPO, f.RDB$FIELD_SCALE AS ESCALA ' +
  'FROM RDB$PROCEDURES p ' +
  'LEFT JOIN RDB$PROCEDURE_PARAMETERS pp ON pp.RDB$PROCEDURE_NAME = p.RDB$PROCEDURE_NAME ' +
  'LEFT JOIN RDB$FIELDS f ON f.RDB$FIELD_NAME = pp.RDB$FIELD_SOURCE ' +
  'WHERE p.RDB$PROCEDURE_NAME = ? AND p.RDB$PACKAGE_NAME IS NULL ' +
  'ORDER BY pp.RDB$PARAMETER_TYPE, pp.RDB$PARAMETER_NUMBER';

/** Tipo de salida según RDB$FIELD_TYPE (y la escala: un BIGINT/INTEGER con escala es NUMERIC). */
export function tipoDeCampo(tipo: number | null, escala: number | null): TipoSalida {
  switch (tipo) {
    case 7:
    case 8:
    case 16:
      return escala !== null && escala < 0 ? 'decimal' : 'entero';
    case 10:
    case 11:
    case 27:
      return 'decimal';
    case 12:
      return 'fecha';
    case 35:
      return 'fechaHora';
    case 23:
      return 'booleano';
    default:
      // CHAR, VARCHAR, BLOB de texto (261/1) y lo que no se reconoce.
      return 'texto';
  }
}

/** Lee la metadata del procedure. Inexistente → ERROR_INTERNO que lo nombra. */
export async function leerMetadataProcedure(ejecutarSql: EjecutarSql, nombre: string): Promise<MetadataProcedure> {
  const filas = await ejecutarSql(SQL_METADATA_PROCEDURE, [nombre.toUpperCase()]);
  if (filas.length === 0) throw new ErrorTool('ERROR_INTERNO', `El procedure ${nombre} no existe en la base.`);
  const metadata: MetadataProcedure = {
    nombre: nombre.toUpperCase(),
    seleccionable: Number(filas[0]!.TIPO_PROCEDURE) !== 2,
    entradas: [],
    salidas: new Map(),
  };
  for (const f of filas) {
    if (f.PARAMETRO === null || f.PARAMETRO === undefined) continue;
    const parametro = String(f.PARAMETRO).trim().toUpperCase();
    if (Number(f.ES_SALIDA) === 0) metadata.entradas.push(parametro);
    else metadata.salidas.set(parametro, tipoDeCampo(numero(f.TIPO_CAMPO), numero(f.ESCALA)));
  }
  return metadata;
}

const numero = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/**
 * SQL de la llamada con todas las entradas en el orden de la firma (NULL las que no tienen valor).
 * Un procedure sin entradas se invoca sin paréntesis: `SELECT * FROM P()` es un error en Firebird.
 */
export function sqlLlamada(metadata: MetadataProcedure, valores: Record<string, ValorParametro>): { sql: string; parametros: ValorParametro[] } {
  const parametros = metadata.entradas.map((e) => valores[e] ?? null);
  const argumentos = parametros.length ? `(${parametros.map(() => '?').join(', ')})` : '';
  const sql = metadata.seleccionable ? `SELECT * FROM ${metadata.nombre}${argumentos}` : `EXECUTE PROCEDURE ${metadata.nombre}${argumentos}`;
  return { sql, parametros };
}

/** Parámetros declarados en la tool que el procedure no tiene como entrada. */
export function parametrosInexistentes(metadata: MetadataProcedure, declarados: readonly string[]): string[] {
  return declarados.filter((d) => !metadata.entradas.includes(d.toUpperCase()));
}

/** Ejecuta el procedure (la metadata ya verificada) y devuelve sus filas. */
export async function ejecutarProcedure(ejecutarSql: EjecutarSql, metadata: MetadataProcedure, valores: Record<string, ValorParametro>): Promise<Fila[]> {
  const { sql, parametros } = sqlLlamada(metadata, valores);
  return ejecutarSql(sql, parametros);
}
