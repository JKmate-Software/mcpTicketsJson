import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Logger } from 'pino';
import { crearCredenciales } from './auth/credenciales.js';
import { crearServicioJwt } from './auth/jwt.js';
import { CacheCatalogos } from './busqueda/catalogo.js';
import { baseOAuthSeparada, cargarConfig, configBaseOAuth, rutaArchivoFunciones, sesionStdio, type Config } from './config.js';
import { crearAccesoFirebird } from './db/firebird.js';
import { cargarCatalogo } from './funciones/catalogo.js';
import { crearRegistroTools, type RegistroTools } from './funciones/registro-tools.js';
import { crearAppHttp, escuchar } from './http.js';
import { crearLogger } from './logger.js';
import { crearServidorMcp } from './nucleo/servidor-mcp.js';

type Acceso = ReturnType<typeof crearAccesoFirebird>;

/** Instrucciones del handshake: solo si el catálogo lo pide (por defecto van por obtener_instrucciones). */
const instruccionesHandshake = (registro: RegistroTools) => {
  const { servidor, instrucciones } = registro.actual();
  return servidor.instruccionesEnHandshake && instrucciones ? instrucciones : undefined;
};

/**
 * Stdio (default): Claude Desktop lanza el servidor como proceso hijo. stdout es el canal del
 * protocolo: todo log va a stderr. Un proceso = una identidad, la de la configuración.
 */
async function arrancarStdio(config: Config, registro: RegistroTools, logger: Logger, acceso: Acceso) {
  const catalogo = registro.actual();
  const base = sesionStdio(config);
  const sesion = catalogo.completarSesion ? await catalogo.completarSesion(base, acceso, logger) : base;
  const instrucciones = instruccionesHandshake(registro);
  const servidor = crearServidorMcp(() => registro.actual().tools, {
    logger,
    sesion,
    nombreServidor: catalogo.servidor.nombre,
    ...(catalogo.servidor.version ? { version: catalogo.servidor.version } : {}),
    ...(instrucciones ? { instrucciones } : {}),
  });

  async function apagar() {
    registro.cerrar();
    await servidor.close().catch(() => undefined);
    await acceso.cerrar().catch(() => undefined);
    logger.flush();
    process.exit(0);
  }
  process.stdin.on('close', () => void apagar());
  process.on('SIGINT', () => void apagar());
  process.on('SIGTERM', () => void apagar());

  await servidor.connect(new StdioServerTransport());
  logger.info(
    { catalogo: catalogo.ruta, codUsuario: sesion.codUsuario, codDesarrollador: sesion.codDesarrollador, codVendedor: sesion.codVendedor },
    `${catalogo.servidor.nombre} listo (stdio)`,
  );
}

/** HTTP: un servicio para varios usuarios, cada uno identificado por su token OAuth. */
async function arrancarHttp(config: Config, registro: RegistroTools, logger: Logger, acceso: Acceso) {
  const catalogo = registro.actual();
  const accesoOAuth = baseOAuthSeparada(config) ? crearAccesoFirebird(configBaseOAuth(config)) : acceso;
  const app = crearAppHttp({
    config,
    tools: () => registro.actual().tools,
    logger,
    credenciales: crearCredenciales(accesoOAuth),
    jwt: crearServicioJwt(config.MCP_JWT_SIGNING_KEY ?? '', config.MCP_JWT_EXPIRACION_SOBRE_DIAS),
    claimRequerida: catalogo.servidor.claimRequerida,
    nombreServidor: catalogo.servidor.nombre,
    ...(catalogo.servidor.version ? { version: catalogo.servidor.version } : {}),
    instrucciones: () => instruccionesHandshake(registro),
  });
  const servidorHttp = await escuchar(app, config.MCP_HTTP_PUERTO);

  async function apagar() {
    registro.cerrar();
    servidorHttp.close();
    await acceso.cerrar().catch(() => undefined);
    if (accesoOAuth !== acceso) await accesoOAuth.cerrar().catch(() => undefined);
    logger.flush();
    process.exit(0);
  }
  process.on('SIGINT', () => void apagar());
  process.on('SIGTERM', () => void apagar());

  logger.info(
    { catalogo: catalogo.ruta, puerto: config.MCP_HTTP_PUERTO, tipoAuth: config.MCP_AUTH_TIPO },
    `${catalogo.servidor.nombre} listo (http)`,
  );
}

async function principal() {
  const config = cargarConfig();
  const logger = crearLogger(config);
  const acceso = crearAccesoFirebird(config);
  const deps = {
    acceso,
    zonaHoraria: config.ZONA_HORARIA_BASE,
    cache: new CacheCatalogos(config.MCP_BUSQUEDA_CACHE_MAX_FILAS),
    cacheWebserviceSegundos: config.MCP_WEBSERVICE_CACHE_SEGUNDOS,
  };
  const registro = await crearRegistroTools(rutaArchivoFunciones(config), (ruta) => cargarCatalogo(ruta, deps), logger);
  if (config.MCP_TRANSPORTE === 'http') await arrancarHttp(config, registro, logger, acceso);
  else await arrancarStdio(config, registro, logger, acceso);
}

principal().catch((error: unknown) => {
  process.stderr.write(`mcp-tickets-json no pudo arrancar: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
