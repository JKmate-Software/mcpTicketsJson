import { describe, expect, it } from 'vitest';
import { invocar } from '../../../test/datos/prospeccion-consultas.js';

describe('buscar_prospectos_vendedor', () => {
  it('proyección de la v1 en camelCase, booleanos reales, fechas con offset, sin datos de UI', async () => {
    const { datos } = await invocar('buscar_prospectos_vendedor');
    expect(datos.prospectos[0]).toEqual({
      codProspectacionMovil: 501,
      codProspecto: 3,
      codCliente: 100,
      cliente: 'PEREZ, ANA',
      telefonos: '3515550000',
      domicilio: 'Calle 1',
      codGrupoProspecto: 5,
      codReclamo: 9001,
      fechaHoraGestion: '2026-10-28T15:30:00-03:00',
      accion: 'LLAMADO',
      codResultado: 40,
      resultado: 'VOLVER A LLAMAR',
      ultimoMensaje: 'Pidió que lo llamen',
      fechaHoraCita: '2026-11-02T10:00:00-03:00',
      canal: 'WEB',
      campania: 'OTOÑO',
      barrio: 'CENTRO',
      archivado: false,
    });
    expect(JSON.stringify(datos)).not.toMatch(/COLOR|"color"|EDAD/);
  });

  it('archivados: archivado es true (booleano)', async () => {
    const { datos, llamadas } = await invocar('buscar_prospectos_vendedor', { archivado: true });
    expect(datos.prospectos.every((p: { archivado: boolean }) => p.archivado === true)).toBe(true);
    expect(llamadas[0]?.parametros[6]).toBe(1);
  });

  it('tope alcanzado: hayMas', async () => {
    const { datos } = await invocar('buscar_prospectos_vendedor', { maxFilas: 1 });
    expect(datos.prospectos).toHaveLength(1);
    expect(datos.hayMas).toBe(true);
    expect((await invocar('buscar_prospectos_vendedor', { maxFilas: 5 })).datos.hayMas).toBe(false);
  });

  it('filtros en el orden del procedure; filtroFecha cita = 1', async () => {
    const { llamadas } = await invocar('buscar_prospectos_vendedor', {
      codCampania: 2, filtroFecha: 'cita', fechaAgenda: '2026-11-02', cliente: 'perez', codBarrio: 7, codAccion: 30,
    });
    expect(llamadas[0]?.parametros).toEqual([12, 2, '2026-11-02', 1, 'perez', 7, 0, 30, 50]);
  });

  it('filtroFecha y fechaAgenda van juntos', async () => {
    const { datos } = await invocar('buscar_prospectos_vendedor', { fechaAgenda: '2026-11-02' });
    expect(datos.error.codigo).toBe('PARAMETRO_INVALIDO');
  });
});
