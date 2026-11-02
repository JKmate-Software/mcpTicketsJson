import { describe, expect, it } from 'vitest';
import { accesoSimulado, conectarCliente, toolDe } from './apoyo.js';
import { CacheCatalogos } from '../src/busqueda/catalogo.js';
import { ZONA, SESION } from './datos/prospeccion-registro.js';

describe('anotaciones y descripción de escritura', () => {
  it('readOnlyHint false y piden confirmar con el usuario', async () => {
    const { acceso } = accesoSimulado({}, null, { contratoResultado: false });
    const deps = { acceso, zonaHoraria: ZONA, cache: new CacheCatalogos() };
    const { cliente } = await conectarCliente([await toolDe('prospeccion', 'registrar_gestion_prospecto', deps), await toolDe('prospeccion', 'registrar_prospecto', deps), await toolDe('prospeccion', 'modificar_prospecto', deps)], SESION);
    const { tools } = await cliente.listTools();
    for (const t of tools) {
      expect(t.annotations).toEqual({ readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false });
      expect(t.description).toContain('confirmá los datos con el usuario');
      expect(JSON.stringify(t.inputSchema)).not.toMatch(/codVendedor|codUsuario/);
    }
  });
});
