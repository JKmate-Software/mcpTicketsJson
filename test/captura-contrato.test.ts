import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CacheCatalogos } from '../src/busqueda/catalogo.js';
import { accesoSimulado, conectarCliente, toolsDe } from './apoyo.js';
import { accesoProspeccion, FILAS_CATALOGOS, LLAMADAS_CATALOGO, SESION_CATALOGO } from './datos/catalogos-prospeccion.js';

/**
 * Red de seguridad del change agregar-catalogo-funciones-json: el contrato que ven los clientes
 * (tools/list y las respuestas de listar_catalogo) se capturó con el código anterior a la migración
 * (con un script de un solo uso, ya borrado: volver a correrlo pisaría la línea base) y tiene que
 * seguir igual.
 */
const ZONA = 'America/Argentina/Buenos_Aires';
const leer = (nombre: string): unknown => JSON.parse(readFileSync(resolve(import.meta.dirname, 'datos', nombre), 'utf8'));

describe('contrato capturado antes de la migración', () => {
  it('tools/list de tickets', async () => {
    const { cliente } = await conectarCliente(await toolsDe('tickets', { acceso: accesoSimulado({}).acceso, zonaHoraria: ZONA }));
    expect((await cliente.listTools()).tools).toEqual(leer('tools-list-tickets.json'));
  });

  it('tools/list de prospección', async () => {
    const { acceso } = accesoProspeccion(FILAS_CATALOGOS);
    const { cliente } = await conectarCliente(await toolsDe('prospeccion', { acceso, zonaHoraria: ZONA, cache: new CacheCatalogos() }), SESION_CATALOGO);
    expect((await cliente.listTools()).tools).toEqual(leer('tools-list-prospeccion.json'));
  });

  it('respuestas de listar_catalogo de prospección', async () => {
    const { acceso } = accesoProspeccion(FILAS_CATALOGOS);
    const { cliente } = await conectarCliente(await toolsDe('prospeccion', { acceso, zonaHoraria: ZONA, cache: new CacheCatalogos() }), SESION_CATALOGO);
    const respuestas = [];
    for (const args of LLAMADAS_CATALOGO) {
      const r = await cliente.callTool({ name: 'listar_catalogo', arguments: args });
      respuestas.push({ args, isError: r.isError ?? false, structuredContent: r.structuredContent, content: r.content });
    }
    expect(respuestas).toEqual(leer('listar-catalogo-prospeccion.json'));
  });
});
