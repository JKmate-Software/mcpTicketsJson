import type { Logger } from 'pino';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import type { Sesion } from '../auth/sesion.js';
import { conError, type DefinicionTool } from './definicion.js';
import { ejecutarTool } from './ejecutar.js';

export const NOMBRE_SERVIDOR = 'mcp-tickets-json';
export const VERSION_SERVIDOR = '0.1.0';

export interface DependenciasServidorMcp {
  logger: Logger;
  /** Identidad con la que corren todas las invocaciones de este servidor (proceso stdio o request http). */
  sesion: Sesion;
  /** serverInfo.name del handshake: identifica al catálogo publicado. */
  nombreServidor?: string;
  /** serverInfo.version del handshake (servidor.version del archivo de funciones). */
  version?: string;
  /** `instructions` del handshake (solo si el catálogo lo pide con instruccionesEnHandshake). */
  instrucciones?: string;
}

// Cada tool tiene sus propios tipos de entrada y salida; el registro los trata de forma uniforme.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CualquierTool = DefinicionTool<any, any>;

/** Las tools del servidor: fijas, o leídas en cada request (catálogo que se recarga en caliente). */
export type FuenteTools = CualquierTool[] | (() => CualquierTool[]);

function publicar(t: CualquierTool): Tool {
  return {
    name: t.nombre,
    title: t.titulo,
    description: t.descripcion,
    inputSchema: t.inputSchema as Tool['inputSchema'],
    outputSchema: conError(t.outputSchema) as Tool['outputSchema'],
    annotations: t.annotations,
  };
}

/**
 * Server de bajo nivel del SDK: publica los JSON Schema tal cual (con la forma de error agregada)
 * y valida el input en el wrapper común, para responder PARAMETRO_INVALIDO con forma uniforme.
 * Cada `tools/list` y `tools/call` toma las tools vigentes en ese momento; una invocación ya
 * empezada termina con la definición con la que arrancó.
 */
export function crearServidorMcp(fuente: FuenteTools, deps: DependenciasServidorMcp): Server {
  const vigentes = typeof fuente === 'function' ? fuente : () => fuente;

  const servidor = new Server(
    { name: deps.nombreServidor ?? NOMBRE_SERVIDOR, version: deps.version ?? VERSION_SERVIDOR },
    { capabilities: { tools: {} }, ...(deps.instrucciones ? { instructions: deps.instrucciones } : {}) },
  );

  servidor.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: vigentes().map(publicar) }));

  servidor.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = vigentes().find((t) => t.nombre === request.params.name);
    if (!tool) {
      throw new McpError(ErrorCode.InvalidParams, `Tool desconocida: ${request.params.name}`);
    }
    return ejecutarTool(tool, request.params.arguments, deps.sesion, deps.logger);
  });

  return servidor;
}
