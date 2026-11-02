import type { AccesoDatos, Fila, ValorParametro } from '../src/db/firebird.js';
import { relojDesdeTexto } from '../src/mapeo/fecha.js';
import { Writable } from 'node:stream';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Sesion } from '../src/auth/sesion.js';
import { crearLogger } from '../src/logger.js';
import { crearServidorMcp } from '../src/nucleo/servidor-mcp.js';
import type { DefinicionTool } from '../src/nucleo/definicion.js';
import { CacheCatalogos } from '../src/busqueda/catalogo.js';
import { cargarCatalogo, rutaCatalogo } from '../src/funciones/catalogo.js';
import type { CualquierTool, DependenciasFunciones } from '../src/funciones/tipos.js';

export const SESION_PRUEBA: Sesion = { codUsuario: 15169, codDesarrollador: 100936, codVendedor: null, transporte: 'stdio' };

/** Logger que acumula los eventos en memoria, ya parseados. */
export function loggerEnMemoria() {
  const eventos: Record<string, unknown>[] = [];
  const crudo: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      const linea = chunk.toString();
      crudo.push(linea);
      eventos.push(JSON.parse(linea) as Record<string, unknown>);
      cb();
    },
  });
  const logger = crearLogger({ LOG_LEVEL: 'debug', SEQ_URL: undefined, SEQ_API_KEY: undefined }, stream);
  return { logger, eventos, crudo };
}

/** Conecta un cliente real del SDK a un servidor con las tools dadas, sin HTTP. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function conectarCliente(tools: DefinicionTool<any, any>[], sesion: Sesion = SESION_PRUEBA, nombreServidor?: string) {
  const { logger, eventos, crudo } = loggerEnMemoria();
  const servidor = crearServidorMcp(tools, { logger, sesion, ...(nombreServidor ? { nombreServidor } : {}) });
  const cliente = new Client({ name: 'test', version: '0.0.0' });
  const [lado1, lado2] = InMemoryTransport.createLinkedPair();
  await Promise.all([servidor.connect(lado1), cliente.connect(lado2)]);
  return { cliente, servidor, eventos, crudo };
}

// ---------------------------------------------------------------- base simulada


/** Reloj de la base desde 'AAAA-MM-DD HH:mm:ss.SSS'. */
export const r = relojDesdeTexto;

/** `contexto` = lo que vería RDB$GET_CONTEXT('USER_SESSION', ...) en la conexión de la llamada. */
export type ManejadorSp = (parametros: ValorParametro[], contexto?: Map<string, string>) => Fila[];

/** Procedure invocado por un SQL generado (`SELECT * FROM P(...)`, `EXECUTE PROCEDURE P(...)`) o null. */
export function procedureDeSql(sql: string): string | null {
  const m = /^\s*(?:SELECT\s+\*\s+FROM|EXECUTE\s+PROCEDURE)\s+([A-Z][A-Z0-9_$]*)/i.exec(sql);
  return m ? m[1]!.toUpperCase() : null;
}

/**
 * AccesoDatos en memoria: cada SP responde con su manejador (filas sin RESULTADO; se agrega
 * RESULTADO = 1). Registra las llamadas para verificar parámetros.
 */
export function accesoSimulado(
  manejadores: Record<string, ManejadorSp>,
  codDesarrollador: number | null = 100936,
  opciones: {
    contratoResultado?: boolean;
    /** SQL que no es la llamada a un procedure (metadata, SSQL de webservice): si devuelve filas, se usan. */
    sql?: (sql: string, parametros: ValorParametro[], contexto: Map<string, string>) => Fila[] | undefined;
  } = {},
) {
  const llamadas: { nombre: string; parametros: ValorParametro[]; escritura: boolean; sql?: string }[] = [];
  /** SQL respondido por `opciones.sql` (metadata, definiciones de métodos): no cuentan como llamadas a procedures. */
  const consultas: { sql: string; parametros: ValorParametro[] }[] = [];
  /** Contexto USER_SESSION de la única conexión del "pool" simulado: persiste entre llamadas, como en Firebird. */
  const conexionPool = new Map<string, string>();
  /** Contexto con el que corrió cada llamada con contexto, en orden. */
  const contextos: { exclusiva: boolean; valores: Record<string, string> }[] = [];
  /** Escrituras confirmadas y deshechas (lo que vería la base). */
  const transacciones = { confirmadas: 0, deshechas: 0 };
  // Los SP `_AG` de tickets traen RESULTADO/MENSAJE_ERROR; los de prospección no.
  const contrato = opciones.contratoResultado ?? true;
  const ejecutar = (escritura: boolean, medidor?: { llamadasBase: number }) => async (nombre: string, parametros: ValorParametro[]) => {
    if (medidor) medidor.llamadasBase += 1;
    llamadas.push({ nombre, parametros, escritura });
    const manejador = manejadores[nombre];
    if (!manejador) throw new Error(`SP no simulado: ${nombre}`);
    const filas = manejador(parametros, conexionPool);
    return contrato ? filas.map((f) => ('RESULTADO' in f ? f : { RESULTADO: 1, MENSAJE_ERROR: '', ...f })) : filas;
  };
  const acceso: AccesoDatos = {
    async enTransaccion(trabajo, medidor) {
      return trabajo(ejecutar(false, medidor));
    },
    async enTransaccionEscritura(trabajo, medidor) {
      try {
        const resultado = await trabajo(ejecutar(true, medidor));
        transacciones.confirmadas++;
        return resultado;
      } catch (error) {
        transacciones.deshechas++;
        throw error;
      }
    },
    async enTransaccionConContexto({ contexto, escritura, exclusiva }, trabajo, medidor) {
      const conexion = exclusiva ? new Map<string, string>() : conexionPool;
      for (const [clave, valor] of Object.entries(contexto)) {
        if (valor === null) conexion.delete(clave);
        else conexion.set(clave, valor);
      }
      contextos.push({ exclusiva: exclusiva ?? false, valores: Object.fromEntries(conexion) });
      const ejecutarSql = async (sql: string, parametros: ValorParametro[]) => {
        if (medidor) medidor.llamadasBase += 1;
        const propias = opciones.sql?.(sql, parametros, conexion);
        if (propias) {
          consultas.push({ sql, parametros });
          return propias;
        }
        const nombre = procedureDeSql(sql);
        if (!nombre) throw new Error(`SQL no simulado: ${sql}`);
        llamadas.push({ nombre, parametros, escritura, sql });
        const manejador = manejadores[nombre];
        if (!manejador) throw new Error(`SP no simulado: ${nombre}`);
        return manejador(parametros, conexion);
      };
      if (!escritura) return trabajo(ejecutarSql);
      try {
        const resultado = await trabajo(ejecutarSql);
        transacciones.confirmadas++;
        return resultado;
      } catch (error) {
        transacciones.deshechas++;
        throw error;
      }
    },
    async codDesarrolladorDeUsuario() {
      return codDesarrollador;
    },
    async cerrar() {},
  };
  return { acceso, llamadas, consultas, transacciones, contextos, conexionPool };
}

// ---------------------------------------------------------------- catálogos del archivo de funciones

type DepsTool = Omit<DependenciasFunciones, 'cache'> & { cache?: DependenciasFunciones['cache'] };

/** Todas las tools de un catálogo de funciones/, como las publica el servidor. */
export async function toolsDe(catalogo: string, deps: DepsTool): Promise<CualquierTool[]> {
  return (await cargarCatalogo(rutaCatalogo(catalogo), { ...deps, cache: deps.cache ?? new CacheCatalogos() })).tools;
}

/** Una tool de un catálogo de funciones/, por nombre. */
export async function toolDe(catalogo: string, nombre: string, deps: DepsTool): Promise<CualquierTool> {
  const tool = (await toolsDe(catalogo, deps)).find((t) => t.nombre === nombre);
  if (!tool) throw new Error(`El catálogo ${catalogo} no tiene la tool ${nombre}`);
  return tool;
}
