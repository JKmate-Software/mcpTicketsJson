import { describe, expect, it } from 'vitest';
import { invocar } from '../../test/datos/prospeccion-consultas.js';

describe('agendas_prospectos_vendedor', () => {
  it('citas del rango', async () => {
    const { datos, llamadas } = await invocar('agendas_prospectos_vendedor', { fechaDesde: '2026-11-01', fechaHasta: '2026-11-07' });
    expect(datos.citas).toEqual([
      { fechaHoraCita: '2026-11-02T10:00:00-03:00', fechaHoraFin: '2026-11-02T10:30:00-03:00', codCliente: 100, codProspecto: 3, cliente: 'PEREZ, ANA', telefonoMovil: '3515550000', titulo: 'Cita' },
    ]);
    expect(llamadas[0]?.parametros).toEqual([12, '2026-11-01', '2026-11-07']);
  });

  it('falta una fecha: PARAMETRO_INVALIDO sobre fechaHasta', async () => {
    const { datos } = await invocar('agendas_prospectos_vendedor', { fechaDesde: '2026-11-01' });
    expect(datos.error.codigo).toBe('PARAMETRO_INVALIDO');
    expect(JSON.stringify(datos.error)).toContain('fechaHasta');
  });
});
