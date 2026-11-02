import { describe, expect, it } from 'vitest';
import { invocar, P } from '../../test/datos/prospeccion-registro.js';

describe('modificar_prospecto', () => {
  it('corrección de email: sin acción, resultado, canal, grupo ni cita', async () => {
    const { datos, parametros } = await invocar(
      'modificar_prospecto',
      { codCliente: 100, codProspecto: 3, email: 'nuevo@ejemplo.com' },
      { COD_PROSPECTACION_MOVIL: null, SALIDA: 0, MENSAJE_SALIDA: 'Datos del prospecto actualizados' },
    );
    expect(datos).toEqual({ codProspectacionMovil: null, mensaje: 'Datos del prospecto 3 actualizados.' });
    expect(parametros[P.EMAIL]).toBe('nuevo@ejemplo.com');
    for (const nulo of [P.COD_CATEGORIA_MENSAJE, P.COD_RESULTADO_RECLAMO, P.COD_COMERCIALIZADORA, P.COD_GRUPO_PROSPECTO, P.FECHA_HORA_AGENDA]) {
      expect(parametros[nulo]).toBeNull();
    }
  });

  it('nada para modificar: PARAMETRO_INVALIDO', async () => {
    const { datos, llamadas } = await invocar('modificar_prospecto', { codCliente: 100, codProspecto: 3 });
    expect(datos.error?.codigo).toBe('PARAMETRO_INVALIDO');
    expect(llamadas).toHaveLength(0);
  });

  it('no pide grupo, canal, acción ni resultado', async () => {
    const { datos } = await invocar('modificar_prospecto', { codCliente: 100, codProspecto: 3, telefono: '1', codResultado: 40 });
    expect(datos.error?.codigo).toBe('PARAMETRO_INVALIDO');
  });
});
