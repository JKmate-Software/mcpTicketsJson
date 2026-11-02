import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { esquemaArchivoFunciones, esquemaTool } from './esquema.js';
import { RUTA_SCHEMA_FUNCIONES, textoSchemaFunciones } from './esquema-publicado.js';

describe('esquema del archivo de funciones', () => {
  it('functions.schema.json está al día (si falla: npm run schema:funciones)', () => {
    expect(readFileSync(RUTA_SCHEMA_FUNCIONES, 'utf8')).toBe(textoSchemaFunciones());
  });

  it('acepta los tipos de la v1 y los normaliza', () => {
    const tool = esquemaTool.parse({
      tipo: 'webservice',
      nombre: 'listar_tickets',
      metodo: 'PROC_GET_TICKETS_ADMIN_PORTAL',
      descripcion: 'x',
      parametros: [{ nombre: 'P_COD_CLIENTE', tipo: 'Entero' }],
    });
    expect(tool.tipo === 'webservice' && tool.parametros?.[0]?.tipo).toBe('entero');
  });

  it('rechaza nombres que no son snake_case y tipos desconocidos', () => {
    expect(esquemaTool.safeParse({ tipo: 'procedure', nombre: 'ListarBarrios', procedure: 'P', descripcion: 'x' }).success).toBe(false);
    expect(esquemaTool.safeParse({ tipo: 'grupo', nombre: 'listar_catalogo', descripcion: 'x' }).success).toBe(false);
  });

  it('claimRequerida es una de las 7 claves de identidad', () => {
    const archivo = { servidor: { nombre: 's', claimRequerida: 'COD_CLIENTE' }, tools: [{ tipo: 'compleja', nombre: 'user_info', handler: 'user-info', descripcion: 'x' }] };
    expect(esquemaArchivoFunciones.safeParse(archivo).success).toBe(true);
    expect(esquemaArchivoFunciones.safeParse({ ...archivo, servidor: { nombre: 's', claimRequerida: 'COD_X' } }).success).toBe(false);
  });
});
