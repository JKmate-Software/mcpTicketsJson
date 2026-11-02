import type { Server as ServidorHttp } from 'node:http';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import type { Logger } from 'pino';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { crearAlmacenCodigos } from './auth/codigos.js';
import type { Credenciales } from './auth/credenciales.js';
import { claim, type Claims, type ServicioJwt } from './auth/jwt.js';
import { claimsDe, crearMiddlewareBearer } from './auth/middleware-bearer.js';
import { crearRutasOAuth } from './auth/rutas-oauth.js';
import { CLAVES_CONTEXTO, type Sesion } from './auth/sesion.js';
import type { Config } from './config.js';
import { crearServidorMcp, type FuenteTools } from './nucleo/servidor-mcp.js';

type ConfigHttp = Pick<
  Config,
  | 'MCP_URL_PUBLICA'
  | 'MCP_AUTH_TIPO'
  | 'MCP_AUTH_TITULO_AUTORIZACION'
  | 'MCP_AUTH_APIKEY_REQUERIDO'
  | 'MCP_AUTH_APIKEY_TITULO'
  | 'MCP_AUTH_APISECRET_REQUERIDO'
  | 'MCP_AUTH_APISECRET_TITULO'
>;

export interface DependenciasHttp {
  config: ConfigHttp;
  /** Tools del catálogo: fijas o leídas en cada request (recarga en caliente). */
  tools: FuenteTools;
  logger: Logger;
  credenciales: Credenciales;
  jwt: ServicioJwt;
  /** Claim que necesitan las tools del catálogo publicado (default: la de tickets, COD_USUARIO). */
  claimRequerida?: string;
  /** serverInfo.name del catálogo publicado (default: mcp-tickets-json). */
  nombreServidor?: string;
  /** serverInfo.version del catálogo publicado. */
  version?: string;
  /** `instructions` del handshake (solo si el catálogo lo pide). */
  instrucciones?: () => string | undefined;
}

const enteroONull = (valor: string) => (valor === '' ? null : Number(valor));

/** Sesión de una request HTTP: sale de las claims del token, nunca de MCP_COD_USUARIO. */
export function sesionDesdeClaims(claims: Claims): Sesion {
  return {
    codUsuario: enteroONull(claim(claims, 'COD_USUARIO')),
    codDesarrollador: enteroONull(claim(claims, 'COD_DESARROLLADOR')),
    codVendedor: enteroONull(claim(claims, 'COD_VENDEDOR')),
    transporte: 'http',
    claims: Object.fromEntries(CLAVES_CONTEXTO.map((c) => [c, claim(claims, c)])),
  };
}

function errorJsonRpc(res: Response, status: number, mensaje: string) {
  res.status(status).json({ jsonrpc: '2.0', error: { code: -32000, message: mensaje }, id: null });
}

/**
 * App HTTP: endpoints OAuth + /mcp Streamable HTTP sin estado. Cada POST autenticado crea su
 * propio Server con la sesión del token, así una misma instancia atiende a varios usuarios sin
 * mapear sesiones MCP a identidades.
 */
export function crearAppHttp(deps: DependenciasHttp): Express {
  const { config, logger } = deps;
  const urlBase = (req: Request) => config.MCP_URL_PUBLICA ?? `${req.protocol}://${req.get('host') ?? 'localhost'}`;

  const app = express();
  app.disable('x-powered-by');

  app.use(
    crearRutasOAuth({
      tipoAuth: config.MCP_AUTH_TIPO,
      paginaLogin: {
        titulo: config.MCP_AUTH_TITULO_AUTORIZACION,
        apiKeyRequerido: config.MCP_AUTH_APIKEY_REQUERIDO,
        apiKeyTitulo: config.MCP_AUTH_APIKEY_TITULO,
        apiSecretRequerido: config.MCP_AUTH_APISECRET_REQUERIDO,
        apiSecretTitulo: config.MCP_AUTH_APISECRET_TITULO,
      },
      credenciales: deps.credenciales,
      jwt: deps.jwt,
      codigos: crearAlmacenCodigos(),
      logger,
      urlBase,
    }),
  );

  const bearer = crearMiddlewareBearer({
    jwt: deps.jwt,
    credenciales: deps.credenciales,
    claimRequerida: deps.claimRequerida ?? 'COD_USUARIO',
    logger,
    urlBase,
  });

  app.post('/mcp', bearer, express.json({ limit: '1mb' }), async (req, res) => {
    const instrucciones = deps.instrucciones?.();
    const servidor = crearServidorMcp(deps.tools, {
      logger,
      sesion: sesionDesdeClaims(claimsDe(res)),
      ...(deps.nombreServidor ? { nombreServidor: deps.nombreServidor } : {}),
      ...(deps.version ? { version: deps.version } : {}),
      ...(instrucciones ? { instrucciones } : {}),
    });
    const transporte = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => {
      void transporte.close();
      void servidor.close();
    });
    await servidor.connect(transporte);
    await transporte.handleRequest(req, res, req.body);
  });

  // Sin estado: no hay stream de servidor (GET) ni sesión que cerrar (DELETE).
  app.all('/mcp', (_req, res) => errorJsonRpc(res, 405, 'Método no permitido: este servidor es sin estado y solo acepta POST.'));

  // Un error no controlado nunca sale como 500 con body vacío (rompe a los clientes OAuth).
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err: error }, 'Error no controlado en una ruta HTTP');
    if (res.headersSent) return;
    res.status(500).json({ error: 'server_error' });
  });

  return app;
}

/** Levanta la app en el puerto dado. Resuelve cuando ya está escuchando. */
export function escuchar(app: Express, puerto: number): Promise<ServidorHttp> {
  return new Promise((resolver, rechazar) => {
    // Express 5 le pasa al callback el error de listen (puerto ocupado, sin permisos).
    const servidor = app.listen(puerto, (error?: Error) => (error ? rechazar(error) : resolver(servidor)));
  });
}
