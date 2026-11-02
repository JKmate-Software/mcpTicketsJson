import { resolve } from 'node:path';
import { jsonSchemaArchivo } from './esquema.js';

/** Carpeta de los archivos de funciones: en la raíz del proyecto, igual desde src/ (tsx) que desde dist/. */
export const DIR_FUNCIONES = resolve(import.meta.dirname, '../../funciones');
export const RUTA_SCHEMA_FUNCIONES = resolve(DIR_FUNCIONES, 'functions.schema.json');

/** Contenido de functions.schema.json (lo que tiene que estar commiteado). */
export function textoSchemaFunciones(): string {
  return `${JSON.stringify({ title: 'Archivo de funciones de un MCP', ...jsonSchemaArchivo() }, null, 2)}\n`;
}
