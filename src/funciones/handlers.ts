import { existsSync } from 'node:fs';
import { basename, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { NOMBRE_HANDLER, type ArchivoFunciones } from './esquema.js';
import { ErrorFunciones } from './textos.js';
import type { CompletarSesion, HandlerCompleja, RegistroHandlers } from './tipos.js';

/**
 * Carpeta de las tools complejas, igual desde src/ que desde dist/:
 * - `catalogos/<mcp>/<handler>.ts`: las tools de un MCP (su carpeta se llama como su `<mcp>-functions.json`);
 * - `catalogos/<mcp>/comunes/`: lo que comparten las tools de ese MCP, y su `completarSesion`;
 * - `catalogos/compartidas/`: las tools que sirven a cualquier MCP (y `compartidas/comunes/`).
 */
export const DIR_CATALOGOS = resolve(import.meta.dirname, '../catalogos');
export const CARPETA_COMPARTIDAS = 'compartidas';
export const CARPETA_COMUNES = 'comunes';
/** Desde src/ (tsx, vitest) los módulos son .ts; desde dist/, .js. */
const EXTENSION = import.meta.url.endsWith('.ts') ? '.ts' : '.js';

/** El MCP de un archivo de funciones: `tickets-functions.json` → `tickets`. Sin esa forma, ninguno (solo compartidas). */
export function mcpDeArchivo(ruta: string): string | undefined {
  const mcp = basename(ruta).replace(/-functions\.json$/, '');
  return mcp !== basename(ruta) && NOMBRE_HANDLER.test(mcp) && mcp !== CARPETA_COMPARTIDAS ? mcp : undefined;
}

/** Carpetas donde se busca un handler (o, con `comunes`, un completarSesion), en orden: la del MCP y compartidas. */
export function carpetasDe(mcp: string | undefined, comunes = false, raiz = DIR_CATALOGOS): string[] {
  return [mcp, CARPETA_COMPARTIDAS].filter((c): c is string => !!c).map((c) => resolve(raiz, c, ...(comunes ? [CARPETA_COMUNES] : [])));
}

/**
 * Ruta del módulo de un nombre del archivo de funciones. El nombre se valida antes de armar la ruta,
 * y la ruta tiene que quedar dentro de la carpeta: un texto del JSON nunca importa otro módulo.
 */
export function rutaModulo(carpeta: string, nombre: string, donde: string): string {
  if (!NOMBRE_HANDLER.test(nombre)) {
    throw new ErrorFunciones(`${donde}: '${nombre}' no es un nombre válido (minúsculas, dígitos y guiones, como el archivo).`);
  }
  const ruta = resolve(carpeta, `${nombre}${EXTENSION}`);
  if (!ruta.startsWith(carpeta + sep)) throw new ErrorFunciones(`${donde}: '${nombre}' resuelve fuera de ${carpeta}.`);
  return ruta;
}

/** Importa el módulo `nombre` de la primera carpeta que lo tenga. Si lo tienen dos, es ambiguo y falla. */
async function importar(carpetas: string[], nombre: string, donde: string): Promise<{ ruta: string; modulo: Record<string, unknown> }> {
  const rutas = carpetas.map((c) => rutaModulo(c, nombre, donde));
  const existentes = rutas.filter((r) => existsSync(r));
  if (existentes.length === 0) throw new ErrorFunciones(`${donde}: no existe '${nombre}' (se buscó ${rutas.join(' y ')}).`);
  if (existentes.length > 1) throw new ErrorFunciones(`${donde}: '${nombre}' está repetido en ${existentes.join(' y ')}; dejá uno solo.`);
  const ruta = existentes[0]!;
  return { ruta, modulo: (await import(pathToFileURL(ruta).href)) as Record<string, unknown> };
}

const esHandler = (valor: unknown): valor is HandlerCompleja =>
  typeof valor === 'object' && valor !== null && typeof (valor as { crear?: unknown }).crear === 'function';

/** Importa el handler de una tool compleja: `catalogos/<mcp>/<nombre>.ts` o `catalogos/compartidas/<nombre>.ts`, que exporta `handler`. */
export async function importarHandler(nombre: string, mcp: string | undefined, donde = `Handler '${nombre}'`, carpetas = carpetasDe(mcp)): Promise<HandlerCompleja> {
  const { ruta, modulo } = await importar(carpetas, nombre, donde);
  if (!esHandler(modulo.handler)) throw new ErrorFunciones(`${donde}: ${ruta} no exporta un 'handler' con 'crear'.`);
  return modulo.handler;
}

/** Importa un completarSesion: `catalogos/<mcp>/comunes/<nombre>.ts` (o el de compartidas), que exporta `completarSesion`. */
export async function importarCompletarSesion(nombre: string, mcp: string | undefined, carpetas = carpetasDe(mcp, true)): Promise<CompletarSesion> {
  const donde = 'servidor.completarSesion';
  const { ruta, modulo } = await importar(carpetas, nombre, donde);
  if (typeof modulo.completarSesion !== 'function') throw new ErrorFunciones(`${donde}: ${ruta} no exporta una función 'completarSesion'.`);
  return modulo.completarSesion as CompletarSesion;
}

/**
 * Los handlers que usa un archivo de funciones, cargados de sus archivos: solo los que el archivo
 * declara (sin registro manual), de la carpeta de su MCP o de compartidas. Un nombre inválido,
 * inexistente, repetido o sin export falla con la tool y la ruta.
 */
export async function resolverHandlers(archivo: ArchivoFunciones, mcp: string | undefined): Promise<RegistroHandlers> {
  const registro: RegistroHandlers = { handlers: {}, completarSesion: {} };
  for (const tool of archivo.tools) {
    if (tool.tipo !== 'compleja' || Object.hasOwn(registro.handlers, tool.handler)) continue;
    registro.handlers[tool.handler] = await importarHandler(tool.handler, mcp, `Tool '${tool.nombre}', handler '${tool.handler}'`);
  }
  const completar = archivo.servidor.completarSesion;
  if (completar) registro.completarSesion[completar] = await importarCompletarSesion(completar, mcp);
  return registro;
}
