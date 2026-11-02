import { describe, expect, it } from 'vitest';
import { invocar } from '../../test/datos/prospeccion-consultas.js';

describe('resumen_prospeccion', () => {
  it('tres intervalos con contadores enteros y fechas AAAA-MM-DD; usa vendedor y usuario de la sesión', async () => {
    const { datos, llamadas, texto } = await invocar('resumen_prospeccion');
    expect(datos.intervalos).toHaveLength(3);
    expect(datos.intervalos[0]).toEqual({ intervalo: 'Día', fechaDesde: '2026-10-29', fechaHasta: '2026-10-29', asignados: 3, nuevos: 1, agendados: 2, gestionados: 1 });
    expect(llamadas[0]?.parametros).toEqual([12, 874, null]);
    expect(texto).toContain('Día: 3 asignados');
  });

  it('fechaReferencia se pasa como fecha', async () => {
    const { llamadas } = await invocar('resumen_prospeccion', { fechaReferencia: '2026-10-01' });
    expect(llamadas[0]?.parametros).toEqual([12, 874, '2026-10-01']);
  });
});
