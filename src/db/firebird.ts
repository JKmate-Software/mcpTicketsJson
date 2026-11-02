import Firebird from 'node-firebird';
import type { Config } from '../config.js';
import { ErrorTool } from '../errores.js';
import type { Medidor } from '../nucleo/definicion.js';

/** Fila de un SP: columnas en mayúsculas, como las devuelve Firebird. */
export type Fila = Record<string, unknown>;

/** Valor aceptado como parámetro de SP. Las fechas se pasan como texto 'AAAA-MM-DD'. */
export type ValorParametro = string | number | null;

export type EjecutarSp = (nombre: string, parametros: ValorParametro[]) => Promise<Fila[]>;

/** SQL parametrizado (`?` posicionales) dentro de la transacción de una tool del archivo de funciones. */
export type EjecutarSql = (sql: string, parametros: ValorParametro[]) => Promise<Fila[]>;

export interface OpcionesContexto {
  /**
   * Claves de identidad a escribir en RDB$SET_CONTEXT('USER_SESSION', ...). Se escriben TODAS en cada
   * invocación: con valor o con NULL (que borra la variable), así una conexión reutilizada del pool
   * nunca conserva la identidad de otra sesión.
   */
  contexto: Record<string, string | null>;
  escritura: boolean;
  /** Conexión propia fuera del pool, que se cierra al terminar (procedures con contexto propio). */
  exclusiva?: boolean;
}

export interface AccesoDatos {
  /**
   * Ejecuta `trabajo` dentro de una única transacción de solo lectura (snapshot consistente).
   * Cada llamada a `ejecutarSp` suma 1 en `medidor.llamadasBase`.
   */
  enTransaccion<T>(trabajo: (ejecutarSp: EjecutarSp) => Promise<T>, medidor?: Medidor): Promise<T>;
  /**
   * Igual que `enTransaccion`, pero de lectura-escritura (READ COMMITTED). Confirma si `trabajo`
   * termina bien; si lanza (incluido un rechazo de negocio), deshace todo.
   */
  enTransaccionEscritura<T>(trabajo: (ejecutarSp: EjecutarSp) => Promise<T>, medidor?: Medidor): Promise<T>;
  /**
   * Transacción READ COMMITTED (de solo lectura salvo `escritura`) para las tools `procedure` y
   * `webservice`: primero carga el contexto de sesión en la misma conexión y después corre `trabajo`.
   * La sentencia del contexto no cuenta en `medidor`.
   */
  enTransaccionConContexto<T>(opciones: OpcionesContexto, trabajo: (ejecutarSql: EjecutarSql) => Promise<T>, medidor?: Medidor): Promise<T>;
  /** USUARIOS.COD_DESARROLLADOR del usuario, o null. */
  codDesarrolladorDeUsuario(codUsuario: number): Promise<number | null>;
  cerrar(): Promise<void>;
}

/** Consulta SQL parametrizada fuera de las tools (login OAuth, revocación). */
export interface ConsultaSql {
  consultar(sql: string, parametros: ValorParametro[]): Promise<Fila[]>;
  cerrar(): Promise<void>;
}

const NOMBRE_SP = /^[A-Z][A-Z0-9_$]{0,30}$/;
const NOMBRE_CONTEXTO = /^[A-Z][A-Z0-9_]{0,79}$/;

/** Una sola sentencia que escribe todas las claves de contexto (los nombres van literales: son fijos y validados). */
export function sqlContexto(claves: string[]): string {
  for (const clave of claves) if (!NOMBRE_CONTEXTO.test(clave)) throw new Error(`Clave de contexto inválida: ${clave}`);
  const columnas = claves.map((clave, i) => `RDB$SET_CONTEXT('USER_SESSION', '${clave}', ?) AS C${i}`);
  return `SELECT ${columnas.join(', ')} FROM RDB$DATABASE`;
}

/**
 * node-firebird arma TIMESTAMP/DATE como hora de reloj en la zona del proceso, pero usando el
 * offset de 1970. Deshace exactamente esa cuenta y devuelve un "reloj" (campos UTC = hora de la
 * base), que es lo que espera mapeo/fecha.ts. No depende de la zona del proceso ni de DST.
 */
export function relojDesdeDriver(valor: Date): Date {
  return new Date(valor.getTime() - new Date(0).getTimezoneOffset() * 60_000);
}

function normalizarFila(fila: Fila): Fila {
  for (const [clave, valor] of Object.entries(fila)) {
    if (valor instanceof Date) fila[clave] = relojDesdeDriver(valor);
    else if (Buffer.isBuffer(valor)) fila[clave] = valor.toString('utf8');
  }
  return fila;
}

const CODIGOS_RED = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH', 'ENOTFOUND', 'EPIPE']);
/** gdscodes de Firebird que significan "la base no está disponible" (red, conexión perdida, shutdown, login). */
const GDS_NO_DISPONIBLE = new Set([
  335544721, // network_error
  335544726, // net_read_err
  335544727, // net_write_err
  335544741, // lost_db_connection
  335544375, // unavailable
  335544528, // shutdown
  335544472, // login (credenciales del MCP mal configuradas)
  335544344, // io_error
]);

export function esBaseNoDisponible(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: unknown; gdscode?: unknown; message?: unknown };
  if (typeof e.code === 'string' && CODIGOS_RED.has(e.code)) return true;
  if (typeof e.gdscode === 'number' && GDS_NO_DISPONIBLE.has(e.gdscode)) return true;
  const mensaje = typeof e.message === 'string' ? e.message : '';
  return /connection (is )?(lost|closed|shutdown)|socket|timeout/i.test(mensaje);
}

function errorBaseNoDisponible(): ErrorTool {
  return new ErrorTool('BASE_NO_DISPONIBLE', 'La base de datos de tickets no está disponible en este momento. Reintentá en unos minutos.');
}

/** Convierte errores de conexión en BASE_NO_DISPONIBLE; el resto sigue igual (sale como ERROR_INTERNO). */
function traducir(error: unknown): unknown {
  return esBaseNoDisponible(error) ? errorBaseNoDisponible() : error;
}

type ConfigFirebird = Pick<
  Config,
  'FIREBIRD_HOST' | 'FIREBIRD_PORT' | 'FIREBIRD_DATABASE' | 'FIREBIRD_USER' | 'FIREBIRD_PASSWORD' | 'FIREBIRD_POOL_MAX'
>;

export function crearAccesoFirebird(
  config: ConfigFirebird,
  opcionesExtra: { connectTimeout?: number } = {},
): AccesoDatos & ConsultaSql {
  if (!config.FIREBIRD_DATABASE) throw new Error('Falta FIREBIRD_DATABASE');
  const opciones: Firebird.Options = {
    host: config.FIREBIRD_HOST,
    port: config.FIREBIRD_PORT,
    database: config.FIREBIRD_DATABASE,
    user: config.FIREBIRD_USER,
    password: config.FIREBIRD_PASSWORD ?? '',
    encoding: 'UTF8',
    blobAsText: true,
    numericMode: 'lossy',
    connectTimeout: opcionesExtra.connectTimeout ?? 10_000,
  };
  const pool = Firebird.pool(config.FIREBIRD_POOL_MAX, { ...opciones, idleTimeoutMillis: 60_000 });
  // Los errores del pool se propagan en cada operación; sin listener, node los trataría como no manejados.
  pool.on('error', () => undefined);

  async function conConexion<T>(trabajo: (db: Firebird.Database) => Promise<T>): Promise<T> {
    let db: Firebird.Database;
    try {
      db = await pool.getAsync();
    } catch (error) {
      throw traducir(error);
    }
    try {
      return await trabajo(db);
    } finally {
      db.detach(() => undefined); // en un pool, detach devuelve la conexión
    }
  }

  /** Conexión propia, fuera del pool: el contexto de sesión muere con ella. */
  async function conConexionExclusiva<T>(trabajo: (db: Firebird.Database) => Promise<T>): Promise<T> {
    let db: Firebird.Database;
    try {
      db = await Firebird.attachAsync(opciones);
    } catch (error) {
      throw traducir(error);
    }
    try {
      return await trabajo(db);
    } finally {
      db.detach(() => undefined);
    }
  }

  /** Confirma (o deshace si `trabajo` lanza). En escritura, un commit fallido es un error real. */
  async function cerrarTransaccion<T>(tx: Firebird.Transaction, escritura: boolean, trabajo: () => Promise<T>): Promise<T> {
    let resultado: T;
    try {
      resultado = await trabajo();
    } catch (error) {
      await tx.rollbackAsync().catch(() => undefined);
      throw error;
    }
    if (escritura) {
      try {
        await tx.commitAsync();
      } catch (error) {
        await tx.rollbackAsync().catch(() => undefined);
        throw traducir(error);
      }
    } else {
      await tx.commitAsync().catch(() => undefined);
    }
    return resultado;
  }

  /**
   * Lectura: REPEATABLE READ de solo lectura (snapshot consistente). Escritura: READ COMMITTED de
   * lectura-escritura, donde un commit fallido es un error real (no se puede informar éxito).
   */
  async function transaccion<T>(escritura: boolean, trabajo: (ejecutarSp: EjecutarSp) => Promise<T>, medidor?: Medidor): Promise<T> {
    return conConexion(async (db) => {
      let tx: Firebird.Transaction;
      try {
        tx = await db.transactionAsync(
          escritura
            ? { isolation: Firebird.ISOLATION_READ_COMMITTED, readOnly: false, wait: false }
            : { isolation: Firebird.ISOLATION_REPEATABLE_READ, readOnly: true, wait: false },
        );
      } catch (error) {
        throw traducir(error);
      }
      const ejecutarSp: EjecutarSp = async (nombre, parametros) => {
        if (!NOMBRE_SP.test(nombre)) throw new Error(`Nombre de SP inválido: ${nombre}`);
        if (medidor) medidor.llamadasBase += 1;
        const marcadores = parametros.map(() => '?').join(', ');
        const sql = `SELECT * FROM ${nombre}${parametros.length ? `(${marcadores})` : ''}`;
        try {
          const filas = await tx.queryAsync<Fila>(sql, parametros);
          return filas.map(normalizarFila);
        } catch (error) {
          throw traducir(error);
        }
      };
      return cerrarTransaccion(tx, escritura, () => trabajo(ejecutarSp));
    });
  }

  async function transaccionConContexto<T>(
    { contexto, escritura, exclusiva }: OpcionesContexto,
    trabajo: (ejecutarSql: EjecutarSql) => Promise<T>,
    medidor?: Medidor,
  ): Promise<T> {
    const conectar = exclusiva ? conConexionExclusiva : conConexion;
    return conectar(async (db) => {
      let tx: Firebird.Transaction;
      try {
        tx = await db.transactionAsync({ isolation: Firebird.ISOLATION_READ_COMMITTED, readOnly: !escritura, wait: false });
        const claves = Object.keys(contexto);
        if (claves.length) await tx.queryAsync(sqlContexto(claves), claves.map((c) => contexto[c] ?? null));
      } catch (error) {
        throw traducir(error);
      }
      const ejecutarSql: EjecutarSql = async (sql, parametros) => {
        if (medidor) medidor.llamadasBase += 1;
        try {
          // EXECUTE PROCEDURE devuelve un objeto (la fila de salida) o nada; un SELECT, un array.
          const resultado: unknown = await tx.queryAsync<Fila>(sql, parametros);
          const filas = Array.isArray(resultado) ? (resultado as Fila[]) : resultado && typeof resultado === 'object' ? [resultado as Fila] : [];
          return filas.map(normalizarFila);
        } catch (error) {
          throw traducir(error);
        }
      };
      return cerrarTransaccion(tx, escritura, () => trabajo(ejecutarSql));
    });
  }

  return {
    async enTransaccion(trabajo, medidor) {
      return transaccion(false, trabajo, medidor);
    },

    async enTransaccionEscritura(trabajo, medidor) {
      return transaccion(true, trabajo, medidor);
    },

    async enTransaccionConContexto(opcionesContexto, trabajo, medidor) {
      return transaccionConContexto(opcionesContexto, trabajo, medidor);
    },

    async codDesarrolladorDeUsuario(codUsuario) {
      return conConexion(async (db) => {
        try {
          const filas = await db.queryAsync<{ COD_DESARROLLADOR: number | null }>(
            'SELECT COD_DESARROLLADOR FROM USUARIOS WHERE COD_USUARIO = ?',
            [codUsuario],
          );
          return filas[0]?.COD_DESARROLLADOR ?? null;
        } catch (error) {
          throw traducir(error);
        }
      });
    },

    async consultar(sql, parametros) {
      return conConexion(async (db) => {
        try {
          const filas = await db.queryAsync<Fila>(sql, parametros);
          return filas.map(normalizarFila);
        } catch (error) {
          throw traducir(error);
        }
      });
    },

    async cerrar() {
      await pool.destroyAsync();
    },
  };
}
