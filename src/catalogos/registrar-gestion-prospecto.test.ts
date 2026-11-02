import { describe, expect, it } from 'vitest';
import { CODIGOS, invocar, P } from '../../test/datos/prospeccion-registro.js';

describe('registrar_gestion_prospecto', () => {
  it('registra a nombre del vendedor y el usuario de la sesión, en una transacción de escritura confirmada', async () => {
    const { datos, parametros, llamadas, transacciones } = await invocar('registrar_gestion_prospecto', {
      codCliente: 100,
      codProspecto: 3,
      ...CODIGOS,
      mensaje: '[TEST MCP] llamado',
      fechaHoraAgenda: '2026-11-02T10:30',
    });
    expect(datos).toEqual({ codProspectacionMovil: 991, mensaje: 'Gestión registrada sobre el prospecto 3 (registro 991).' });
    expect(llamadas[0]?.escritura).toBe(true);
    expect(transacciones).toEqual({ confirmadas: 1, deshechas: 0 });
    expect(parametros[P.COD_USUARIO]).toBe(874);
    expect(parametros[P.COD_VENDEDOR]).toBe(12);
    expect(parametros[P.COD_CLIENTE_FIREBIRD]).toBe(100);
    expect(parametros[P.COD_RESULTADO_RECLAMO]).toBe(40);
    expect(parametros[P.FECHA_HORA_AGENDA]).toBe('2026-11-02 10:30:00');
    expect(parametros[P.FECHA_HORA]).toBeNull();
  });

  it('una hora con offset se pasa en la hora de la base', async () => {
    const { parametros } = await invocar('registrar_gestion_prospecto', { codCliente: 100, codProspecto: 3, ...CODIGOS, fechaHora: '2026-11-02T15:00:00Z' });
    expect(parametros[P.FECHA_HORA]).toBe('2026-11-02 12:00:00');
  });

  it('no acepta vendedor ni usuario como parámetro', async () => {
    const { datos, llamadas } = await invocar('registrar_gestion_prospecto', { codCliente: 100, codProspecto: 3, ...CODIGOS, codVendedor: 99 });
    expect(datos.error?.codigo).toBe('PARAMETRO_INVALIDO');
    expect(llamadas).toHaveLength(0);
  });

  it('rechazo del procedure: OPERACION_RECHAZADA con su mensaje y rollback', async () => {
    const { datos, transacciones } = await invocar(
      'registrar_gestion_prospecto',
      { codCliente: 100, codProspecto: 3, ...CODIGOS },
      { COD_PROSPECTACION_MOVIL: 992, SALIDA: -1, MENSAJE_SALIDA: 'El resultado no corresponde a la categoría' },
    );
    expect(datos.error).toEqual({ codigo: 'OPERACION_RECHAZADA', mensaje: 'El resultado no corresponde a la categoría' });
    expect(transacciones).toEqual({ confirmadas: 0, deshechas: 1 });
  });
});
