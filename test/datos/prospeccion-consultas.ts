import { accesoSimulado, conectarCliente, r, toolsDe } from '../apoyo.js';
import type { Sesion } from '../../src/auth/sesion.js';
import { CacheCatalogos } from '../../src/busqueda/catalogo.js';
import type { Fila, ValorParametro } from '../../src/db/firebird.js';

export const ZONA = 'America/Argentina/Buenos_Aires';
export const SESION: Sesion = { codUsuario: 874, codDesarrollador: null, codVendedor: 12, transporte: 'http' };

/** Cartera simulada: cada vendedor ve solo sus prospectos. */
export const PROSPECTOS: (Fila & { VENDEDOR: number })[] = [
  {
    VENDEDOR: 12,
    COD_PROSPECTACION_MOVIL: 501, COD_PROSPECTO: 3, COD_CLIENTE: 100, CLIENTE: 'PEREZ, ANA', TELEFONOS: '3515550000', DOMICILIO: 'Calle 1',
    COD_GRUPO_PROSPECTO: 5, COD_RECLAMO: 9001, FECHA_HORA_GESTION: r('2026-10-28 15:30:00'), ACCION: 'LLAMADO', COD_RESULTADO_RECLAMO: 40,
    RESULTADO_GESTION: 'VOLVER A LLAMAR', ULTIMO_MENSAJE: '<p>Pidió que lo llamen</p>', FECHA_HORA_CITA: r('2026-11-02 10:00:00'),
    CANAL: 'WEB', CAMPANIA: 'OTOÑO', BARRIO: 'CENTRO', ARCHIVADO: 0, EDAD: 40, COLOR: 'red',
  },
  {
    VENDEDOR: 12,
    COD_PROSPECTACION_MOVIL: 502, COD_PROSPECTO: 4, COD_CLIENTE: 101, CLIENTE: 'GOMEZ, LUIS', TELEFONOS: null, DOMICILIO: null,
    COD_GRUPO_PROSPECTO: 5, COD_RECLAMO: null, FECHA_HORA_GESTION: r('2026-10-27 09:00:00'), ACCION: 'VISITA', COD_RESULTADO_RECLAMO: 41,
    RESULTADO_GESTION: 'NO INTERESADO', ULTIMO_MENSAJE: null, FECHA_HORA_CITA: null, CANAL: null, CAMPANIA: null, BARRIO: null, ARCHIVADO: 1,
  },
  {
    VENDEDOR: 77,
    COD_PROSPECTACION_MOVIL: 601, COD_PROSPECTO: 8, COD_CLIENTE: 200, CLIENTE: 'OTRO VENDEDOR', TELEFONOS: null, DOMICILIO: null,
    COD_GRUPO_PROSPECTO: 6, COD_RECLAMO: null, FECHA_HORA_GESTION: r('2026-10-28 08:00:00'), ACCION: null, COD_RESULTADO_RECLAMO: null,
    RESULTADO_GESTION: null, ULTIMO_MENSAJE: null, FECHA_HORA_CITA: null, CANAL: null, CAMPANIA: null, BARRIO: null, ARCHIVADO: 0,
  },
];

export const MANEJADORES = {
  PROC_MCP_RESUMEN_PROSPECCION: () => [
    { INTERVALO: 'Día', FECHA_DESDE: r('2026-10-29'), FECHA_HASTA: r('2026-10-29'), ASIGNADOS: 3, NUEVOS: 1, AGENDADOS: 2, GESTIONADOS: 1 },
    { INTERVALO: 'Semana', FECHA_DESDE: r('2026-10-26'), FECHA_HASTA: r('2026-11-01'), ASIGNADOS: 10, NUEVOS: 4, AGENDADOS: 5, GESTIONADOS: 7 },
    { INTERVALO: 'Mes', FECHA_DESDE: r('2026-10-01'), FECHA_HASTA: r('2026-10-31'), ASIGNADOS: 40, NUEVOS: 12, AGENDADOS: 9, GESTIONADOS: 30 },
  ],
  PROC_GET_EST_PROSP_X_REC: () => [
    { RESULTADO_RECLAMO: 'VOLVER A LLAMAR', COD_RESULTADO_RECLAMO: 40, CANTIDAD: 5 },
    { RESULTADO_RECLAMO: 'NO INTERESADO', COD_RESULTADO_RECLAMO: 41, CANTIDAD: 2 },
  ],
  PROC_MCP_BUSCAR_PROSPECTOS: (p: ValorParametro[]) => {
    const [vendedor, , , , , , archivado, , maxFilas] = p;
    return PROSPECTOS.filter((x) => x.VENDEDOR === vendedor && x.ARCHIVADO === archivado)
      .slice(0, Number(maxFilas))
      .map(({ VENDEDOR: _v, ...f }) => f);
  },
  PROC_AGENDA_PROSPECTOS: () => [
    { TITULO: 'Cita', CLIENTE: 'PEREZ, ANA', TELEFONO_MOVIL: '3515550000', FECHA_HORA_CITA: r('2026-11-02 10:00:00'), FECHA_HORA_FIN: r('2026-11-02 10:30:00'), FECHA_ORDEN: r('2026-11-02 10:00:00'), COD_CLIENTE: 100, COD_PROSPECTO: 3, COD_PROSPECTACION_MOVIL: 501 },
  ],
  PROC_GET_MENSAJES_X_CLIENTEP: () => [
    { FECHA_HORA: r('2026-10-28 15:30:00'), FECHA_HORA_AGENDA: r('2026-11-02 10:00:00'), CATEGORIA_MENSAJE: 'LLAMADO', RESULTADO_TRAMITE: 'VOLVER A LLAMAR', ESTADO_TRAMITE: 'ABIERTO', MENSAJE: 'Pidió <b>que</b> lo llamen', ENTIDAD_RELACIONADA: 'WEB', USUARIO: 'jgutierrez', NRO_TRAMITE: 9001, COLOR: 'red', LEIDO: 1 },
  ],
};

export async function invocar(tool: string, args: Record<string, unknown> = {}, sesion: Sesion = SESION) {
  const { acceso, llamadas } = accesoSimulado(MANEJADORES, null, { contratoResultado: false });
  const { cliente, eventos } = await conectarCliente(await toolsDe('prospeccion', { acceso, zonaHoraria: ZONA, cache: new CacheCatalogos() }), sesion);
  const resultado = await cliente.callTool({ name: tool, arguments: args });
  return {
    resultado,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    datos: resultado.structuredContent as any,
    llamadas,
    eventos,
    texto: (resultado.content as { text: string }[])[0]?.text ?? '',
  };
}
