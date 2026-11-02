import { readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { leerArchivoFunciones } from '../src/funciones/cargar.js';
import { DIR_FUNCIONES } from '../src/funciones/esquema-publicado.js';
import { DIR_CATALOGOS, importarHandler, resolverHandlers } from '../src/funciones/handlers.js';

/**
 * Convención de las tools complejas (change reorganizar-tools-complejas): un archivo por tool en
 * src/catalogos/<handler>.ts que exporta `handler`, cargado por nombre desde los archivos de
 * funciones. Sin registro manual, estos tests son los que detectan un nombre mal escrito o un
 * archivo que quedó sin usar.
 */
const archivosFunciones = readdirSync(DIR_FUNCIONES).filter((f) => f.endsWith('-functions.json'));
const archivosCatalogos = readdirSync(DIR_CATALOGOS)
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  .map((f) => basename(f, '.ts'));

describe('convención de tools complejas', () => {
  it.each(archivosFunciones)('%s: todos sus handlers y su completarSesion resuelven', async (archivo) => {
    await expect(resolverHandlers(leerArchivoFunciones(join(DIR_FUNCIONES, archivo)))).resolves.toBeDefined();
  });

  it.each(archivosCatalogos)('src/catalogos/%s.ts exporta un handler', async (nombre) => {
    expect(typeof (await importarHandler(nombre)).crear).toBe('function');
  });

  it('todo archivo de src/catalogos/ lo usa algún archivo de funciones', () => {
    const usados = new Set(
      archivosFunciones.flatMap((archivo) =>
        leerArchivoFunciones(join(DIR_FUNCIONES, archivo)).tools.flatMap((t) => (t.tipo === 'compleja' ? [t.handler] : [])),
      ),
    );
    expect(archivosCatalogos.filter((nombre) => !usados.has(nombre))).toEqual([]);
  });
});
