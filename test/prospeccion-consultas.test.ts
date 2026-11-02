import { describe, expect, it } from 'vitest';
import { accesoSimulado, conectarCliente, toolsDe } from './apoyo.js';
import { CacheCatalogos } from '../src/busqueda/catalogo.js';
import { ZONA, SESION, invocar } from './datos/prospeccion-consultas.js';

describe('siempre sobre el vendedor de la sesión', () => {
  it('ningún inputSchema declara vendedor ni usuario', async () => {
    const { acceso } = accesoSimulado({}, null, { contratoResultado: false });
    const { cliente } = await conectarCliente(await toolsDe('prospeccion', { acceso, zonaHoraria: ZONA, cache: new CacheCatalogos() }), SESION);
    const { tools } = await cliente.listTools();
    for (const t of tools) {
      for (const propiedad of Object.keys(t.inputSchema.properties ?? {})) expect(propiedad, t.name).not.toMatch(/vendedor|usuario/i);
    }
  });

  it('dos vendedores, misma instancia: cada uno ve su cartera', async () => {
    const propio = await invocar('buscar_prospectos_vendedor');
    expect(propio.datos.prospectos.map((p: { codProspecto: number }) => p.codProspecto)).toEqual([3]);
    const otro = await invocar('buscar_prospectos_vendedor', {}, { ...SESION, codVendedor: 77 });
    expect(otro.datos.prospectos.map((p: { codProspecto: number }) => p.codProspecto)).toEqual([8]);
  });
});

describe('anotaciones de lectura', () => {
  it('las cinco consultas son readOnly', async () => {
    const { acceso } = accesoSimulado({}, null, { contratoResultado: false });
    const { cliente } = await conectarCliente(await toolsDe('prospeccion', { acceso, zonaHoraria: ZONA, cache: new CacheCatalogos() }), SESION);
    const { tools } = await cliente.listTools();
    const consultas = ['resumen_prospeccion', 'totales_resultado_prospeccion', 'buscar_prospectos_vendedor', 'agendas_prospectos_vendedor', 'historial_mensajes_prospecto'];
    for (const nombre of consultas) {
      expect(tools.find((t) => t.name === nombre)?.annotations).toEqual({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
    }
  });
});
