import { resolve } from 'node:path';
import { construirCatalogo, leerArchivoFunciones } from './cargar.js';
import { DIR_FUNCIONES } from './esquema-publicado.js';
import { resolverHandlers } from './handlers.js';
import type { CatalogoCargado, DependenciasFunciones } from './tipos.js';

export { catalogosDisponibles } from '../config.js';

/** Archivo de funciones de un catálogo de la carpeta funciones/. */
export function rutaCatalogo(nombre: string): string {
  return resolve(DIR_FUNCIONES, `${nombre}-functions.json`);
}

/**
 * Lee el archivo, carga el código de las tools complejas que declara (src/catalogos/<handler>.ts) y
 * construye el catálogo. Sin registros manuales: el archivo nombra los handlers.
 */
export async function cargarCatalogo(ruta: string, deps: DependenciasFunciones): Promise<CatalogoCargado> {
  const archivo = leerArchivoFunciones(ruta);
  return construirCatalogo(archivo, ruta, await resolverHandlers(archivo), deps);
}
