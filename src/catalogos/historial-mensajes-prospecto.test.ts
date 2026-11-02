import { describe, expect, it } from 'vitest';
import { invocar } from '../../test/datos/prospeccion-consultas.js';

describe('historial_mensajes_prospecto', () => {
  it('gestiones con fechas con offset y texto sin HTML', async () => {
    const { datos, llamadas } = await invocar('historial_mensajes_prospecto', { codCliente: 100, codProspecto: 3 });
    expect(datos.gestiones).toEqual([
      {
        fechaHora: '2026-10-28T15:30:00-03:00',
        fechaHoraAgenda: '2026-11-02T10:00:00-03:00',
        categoria: 'LLAMADO',
        resultado: 'VOLVER A LLAMAR',
        estado: 'ABIERTO',
        mensaje: 'Pidió que lo llamen',
        entidad: 'WEB',
        usuario: 'jgutierrez',
        nroTramite: '9001',
      },
    ]);
    expect(llamadas[0]?.parametros).toEqual([100, 3]);
  });
});
