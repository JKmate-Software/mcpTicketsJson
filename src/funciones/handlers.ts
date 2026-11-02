import { existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { NOMBRE_HANDLER, type ArchivoFunciones } from './esquema.js';
import { ErrorFunciones } from './textos.js';
import type { CompletarSesion, HandlerCompleja, RegistroHandlers } from './tipos.js';

/** Carpeta de las tools complejas (un archivo por handler) y de lo compartido, igual desde src/ que desde dist/. */
export const DIR_CATALOGOS = resolve(import.meta.dirname, '../catalogos');
export const DIR_COMUNES = resolve(import.meta.dirname, '../comunes');
/** Desde src/ (tsx, vitest) los módulos son .ts; desde dist/, .js. */
const EXTENSION = import.meta.url.endsWith('.ts') ? '.ts' : '.js';

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

async function importar(ruta: string, donde: string, nombre: string): Promise<Record<string, unknown>> {
  if (!existsSync(ruta)) throw new ErrorFunciones(`${donde}: no existe '${nombre}' (se buscó ${ruta}).`);
  return (await import(pathToFileURL(ruta).href)) as Record<string, unknown>;
}

const esHandler = (valor: unknown): valor is HandlerCompleja =>
  typeof valor === 'object' && valor !== null && typeof (valor as { crear?: unknown }).crear === 'function';

/** Importa el handler de una tool compleja: `src/catalogos/<nombre>.ts`, que exporta `handler`. */
export async function importarHandler(nombre: string, donde = `Handler '${nombre}'`, carpeta = DIR_CATALOGOS): Promise<HandlerCompleja> {
  const ruta = rutaModulo(carpeta, nombre, donde);
  const modulo = await importar(ruta, donde, nombre);
  if (!esHandler(modulo.handler)) throw new ErrorFunciones(`${donde}: ${ruta} no exporta un 'handler' con 'crear'.`);
  return modulo.handler;
}

/** Importa un completarSesion: `src/comunes/<nombre>.ts`, que exporta `completarSesion`. */
export async function importarCompletarSesion(nombre: string, carpeta = DIR_COMUNES): Promise<CompletarSesion> {
  const donde = 'servidor.completarSesion';
  const ruta = rutaModulo(carpeta, nombre, donde);
  const modulo = await importar(ruta, donde, nombre);
  if (typeof modulo.completarSesion !== 'function') throw new ErrorFunciones(`${donde}: ${ruta} no exporta una función 'completarSesion'.`);
  return modulo.completarSesion as CompletarSesion;
}

/**
 * Los handlers que usa un archivo de funciones, cargados de sus archivos: solo los que el archivo
 * declara (sin registro manual). Un nombre inválido, inexistente o sin export falla con la tool y la ruta.
 */
export async function resolverHandlers(archivo: ArchivoFunciones): Promise<RegistroHandlers> {
  const registro: RegistroHandlers = { handlers: {}, completarSesion: {} };
  for (const tool of archivo.tools) {
    if (tool.tipo !== 'compleja' || Object.hasOwn(registro.handlers, tool.handler)) continue;
    registro.handlers[tool.handler] = await importarHandler(tool.handler, `Tool '${tool.nombre}', handler '${tool.handler}'`);
  }
  const completar = archivo.servidor.completarSesion;
  if (completar) registro.completarSesion[completar] = await importarCompletarSesion(completar);
  return registro;
}
