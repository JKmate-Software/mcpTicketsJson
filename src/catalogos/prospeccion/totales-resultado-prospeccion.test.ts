import { describe, expect, it } from 'vitest';
import { invocar } from '../../../test/datos/prospeccion-consultas.js';

describe('totales_resultado_prospeccion', () => {
  it('por resultado, con el intervalo exacto', async () => {
    const { datos, llamadas, texto } = await invocar('totales_resultado_prospeccion', { intervalo: 'Sem' });
    expect(datos.resultados).toEqual([
      { codResultado: 40, resultado: 'VOLVER A LLAMAR', cantidad: 5 },
      { codResultado: 41, resultado: 'NO INTERESADO', cantidad: 2 },
    ]);
    expect(llamadas[0]?.parametros).toEqual([12, 874, null, 'Sem']);
    expect(texto).toBe('7 gestiones (Sem): VOLVER A LLAMAR: 5, NO INTERESADO: 2.');
  });

  it('intervalo inválido: PARAMETRO_INVALIDO con los valores admitidos, sin ir a la base', async () => {
    const { datos, llamadas } = await invocar('totales_resultado_prospeccion', { intervalo: 'semana' });
    expect(datos.error.codigo).toBe('PARAMETRO_INVALIDO');
    expect(JSON.stringify(datos.error)).toContain('Día, Sem, Mes, Año');
    expect(llamadas).toHaveLength(0);
  });
});
