import { existsSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { leerArchivoFunciones } from '../src/funciones/cargar.js';
import { DIR_FUNCIONES } from '../src/funciones/esquema-publicado.js';
import { CARPETA_COMPARTIDAS, DIR_CATALOGOS, importarHandler, mcpDeArchivo, resolverHandlers } from '../src/funciones/handlers.js';

/**
 * Convención de las tools complejas: una carpeta por MCP (src/catalogos/<mcp>/, con el nombre de su
 * <mcp>-functions.json), un archivo por tool que exporta `handler`, lo compartido del MCP en
 * <mcp>/comunes/ y lo que sirve a cualquier MCP en compartidas/. Sin registro manual, estos tests
 * son los que detectan un nombre mal escrito, una tool en la carpeta equivocada o un archivo sin usar.
 */
const archivosFunciones = readdirSync(DIR_FUNCIONES).filter((f) => f.endsWith('-functions.json'));
const usadosPor = new Map(
  archivosFunciones.map((archivo) => [
    mcpDeArchivo(archivo)!,
    new Set(leerArchivoFunciones(join(DIR_FUNCIONES, archivo)).tools.flatMap((t) => (t.tipo === 'compleja' ? [t.handler] : []))),
  ]),
);
const carpetas = readdirSync(DIR_CATALOGOS, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
const toolsDe = (carpeta: string) =>
  readdirSync(join(DIR_CATALOGOS, carpeta))
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => basename(f, '.ts'));
const tools = carpetas.flatMap((carpeta) => toolsDe(carpeta).map((nombre) => [carpeta, nombre] as const));

describe('convención de tools complejas', () => {
  it('src/catalogos/ solo tiene carpetas: una por MCP más compartidas', () => {
    expect(readdirSync(DIR_CATALOGOS, { withFileTypes: true }).filter((d) => !d.isDirectory()).map((d) => d.name)).toEqual([]);
  });

  it.each(carpetas.filter((c) => c !== CARPETA_COMPARTIDAS))('src/catalogos/%s/ corresponde a un archivo de funciones', (carpeta) => {
    expect(existsSync(join(DIR_FUNCIONES, `${carpeta}-functions.json`))).toBe(true);
  });

  it.each(archivosFunciones)('%s: todos sus handlers y su completarSesion resuelven', async (archivo) => {
    await expect(resolverHandlers(leerArchivoFunciones(join(DIR_FUNCIONES, archivo)), mcpDeArchivo(archivo))).resolves.toBeDefined();
  });

  it.each(tools)('src/catalogos/%s/%s.ts exporta un handler', async (carpeta, nombre) => {
    const mcp = carpeta === CARPETA_COMPARTIDAS ? undefined : carpeta;
    expect(typeof (await importarHandler(nombre, mcp)).crear).toBe('function');
  });

  it('cada tool de una carpeta de MCP la usa ese MCP, y cada compartida algún MCP', () => {
    const sinUsar = tools.filter(([carpeta, nombre]) =>
      carpeta === CARPETA_COMPARTIDAS ? ![...usadosPor.values()].some((u) => u.has(nombre)) : !usadosPor.get(carpeta)?.has(nombre),
    );
    expect(sinUsar.map(([carpeta, nombre]) => `${carpeta}/${nombre}`)).toEqual([]);
  });
});
