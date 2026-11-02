import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DIR_CATALOGOS, importarCompletarSesion, importarHandler, resolverHandlers, rutaModulo } from './handlers.js';
import { esquemaArchivoFunciones } from './esquema.js';

/** Carpeta temporal con módulos .ts de prueba (vitest los importa igual que a los de src/catalogos/). */
function carpetaCon(modulos: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'catalogos-'));
  for (const [nombre, codigo] of Object.entries(modulos)) writeFileSync(join(dir, `${nombre}.ts`), codigo);
  return dir;
}

describe('carga automática de handlers', () => {
  it('importa el handler del archivo con su nombre', async () => {
    const handler = await importarHandler('listar-tickets');
    expect(typeof handler.crear).toBe('function');
  });

  it.each(['../db/firebird', 'catalogos/listar-tickets', 'Listar-Tickets', 'listar_tickets', 'listar.tickets', ''])(
    'un nombre que no es un archivo de la carpeta (%s) falla sin importar nada',
    (nombre) => {
      expect(() => rutaModulo(DIR_CATALOGOS, nombre, 'Prueba')).toThrow(/no es un nombre válido/);
    },
  );

  it('un handler que no existe nombra la ruta buscada', async () => {
    await expect(importarHandler('no-existe', "Tool 'x'")).rejects.toThrow(/Tool 'x': no existe 'no-existe' \(se buscó .*no-existe\.ts\)/);
  });

  it('un archivo sin export handler (o sin crear) falla', async () => {
    const dir = carpetaCon({ 'sin-export': 'export const otra = 1;', 'sin-crear': 'export const handler = { nombre: 1 };' });
    await expect(importarHandler('sin-export', 'P', dir)).rejects.toThrow(/no exporta un 'handler' con 'crear'/);
    await expect(importarHandler('sin-crear', 'P', dir)).rejects.toThrow(/no exporta un 'handler' con 'crear'/);
  });

  it('completarSesion se busca en src/comunes/ y tiene que exportar la función', async () => {
    expect(typeof (await importarCompletarSesion('completar-sesion-tickets'))).toBe('function');
    const dir = carpetaCon({ 'sin-funcion': 'export const completarSesion = 1;' });
    await expect(importarCompletarSesion('sin-funcion', dir)).rejects.toThrow(/no exporta una función 'completarSesion'/);
  });

  it('resolverHandlers carga solo lo que el archivo declara, una vez por handler', async () => {
    const archivo = esquemaArchivoFunciones.parse({
      servidor: { nombre: 's', claimRequerida: 'COD_USUARIO', completarSesion: 'completar-sesion-tickets' },
      tools: [
        { tipo: 'compleja', nombre: 'a', handler: 'user-info', descripcion: 'x' },
        { tipo: 'compleja', nombre: 'b', handler: 'user-info', descripcion: 'x' },
      ],
    });
    const registro = await resolverHandlers(archivo);
    expect(Object.keys(registro.handlers)).toEqual(['user-info']);
    expect(Object.keys(registro.completarSesion)).toEqual(['completar-sesion-tickets']);
  });
});
