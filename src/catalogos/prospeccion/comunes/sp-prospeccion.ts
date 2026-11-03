import type { EjecutarSp, ValorParametro } from '../../../db/firebird.js';

/*
 * Procedures del CRM de prospección (verificados en SANTAROSA64_IA, design D3). Se llaman directo,
 * con el mismo SQL que el SSQL de METODOS_WEBSERVICES que usa la v1. Estos procedures no siguen el
 * contrato RESULTADO/MENSAJE_ERROR de los `_AG` de tickets: devuelven las filas tal cual.
 * Fechas de resultado: "reloj" (Date). Fechas de parámetro: texto 'AAAA-MM-DD[ HH:mm:ss]'.
 */

const opcional = <T extends ValorParametro>(valor: T | undefined): T | null => valor ?? null;

// ---------------------------------------------------------------- consultas

export interface FilaResumen {
  INTERVALO: string;
  FECHA_DESDE: Date | null;
  FECHA_HASTA: Date | null;
  ASIGNADOS: number | null;
  NUEVOS: number | null;
  AGENDADOS: number | null;
  GESTIONADOS: number | null;
}

export async function resumenProspeccion(sp: EjecutarSp, vendedor: number, usuario: number | null, fecha?: string): Promise<FilaResumen[]> {
  return (await sp('PROC_MCP_RESUMEN_PROSPECCION', [vendedor, usuario, opcional(fecha)])) as unknown as FilaResumen[];
}

export interface FilaTotalResultado {
  COD_RESULTADO_RECLAMO: number | null;
  RESULTADO_RECLAMO: string | null;
  CANTIDAD: number | null;
}

export async function totalesPorResultado(
  sp: EjecutarSp,
  vendedor: number,
  usuario: number | null,
  intervalo: string,
  fecha?: string,
): Promise<FilaTotalResultado[]> {
  return (await sp('PROC_GET_EST_PROSP_X_REC', [vendedor, usuario, opcional(fecha), intervalo])) as unknown as FilaTotalResultado[];
}

export interface FiltrosProspectos {
  codCampania?: number;
  fechaAgenda?: string;
  /** 0 = sin filtro de fecha, 1 = por fecha de cita, 2 = por fecha de gestión. */
  filtroFecha: 0 | 1 | 2;
  cliente?: string;
  codBarrio?: number;
  archivado: boolean;
  codAccion?: number;
  maxFilas: number;
}

export interface FilaProspecto {
  COD_PROSPECTACION_MOVIL: number | null;
  COD_PROSPECTO: number | null;
  COD_CLIENTE: number | null;
  CLIENTE: string | null;
  TELEFONOS: string | null;
  DOMICILIO: string | null;
  COD_GRUPO_PROSPECTO: number | null;
  COD_RECLAMO: number | null;
  FECHA_HORA_GESTION: Date | null;
  ACCION: string | null;
  COD_RESULTADO_RECLAMO: number | null;
  RESULTADO_GESTION: string | null;
  ULTIMO_MENSAJE: string | null;
  FECHA_HORA_CITA: Date | null;
  CANAL: string | null;
  CAMPANIA: string | null;
  BARRIO: string | null;
  ARCHIVADO: number | null;
}

export async function buscarProspectos(sp: EjecutarSp, vendedor: number, f: FiltrosProspectos): Promise<FilaProspecto[]> {
  const filas = await sp('PROC_MCP_BUSCAR_PROSPECTOS', [
    vendedor,
    opcional(f.codCampania),
    opcional(f.fechaAgenda),
    f.filtroFecha,
    opcional(f.cliente),
    opcional(f.codBarrio),
    f.archivado ? 1 : 0,
    opcional(f.codAccion),
    f.maxFilas,
  ]);
  return filas as unknown as FilaProspecto[];
}

export interface FilaCita {
  TITULO: string | null;
  CLIENTE: string | null;
  TELEFONO_MOVIL: string | null;
  FECHA_HORA_CITA: Date | null;
  FECHA_HORA_FIN: Date | null;
  COD_CLIENTE: number | null;
  COD_PROSPECTO: number | null;
}

export async function agendaProspectos(sp: EjecutarSp, vendedor: number, desde: string, hasta: string): Promise<FilaCita[]> {
  return (await sp('PROC_AGENDA_PROSPECTOS', [vendedor, desde, hasta])) as unknown as FilaCita[];
}

export interface FilaMensaje {
  FECHA_HORA: Date | null;
  FECHA_HORA_AGENDA: Date | null;
  CATEGORIA_MENSAJE: string | null;
  RESULTADO_TRAMITE: string | null;
  ESTADO_TRAMITE: string | null;
  MENSAJE: string | null;
  ENTIDAD_RELACIONADA: string | null;
  USUARIO: string | null;
  NRO_TRAMITE: number | string | null;
}

export async function mensajesProspecto(sp: EjecutarSp, codCliente: number, codProspecto: number): Promise<FilaMensaje[]> {
  return (await sp('PROC_GET_MENSAJES_X_CLIENTEP', [codCliente, codProspecto])) as unknown as FilaMensaje[];
}

// ---------------------------------------------------------------- escritura

/** Datos de MM_PROC_SET_PROSPECCION_MOVILB2 que exponen las tools (el resto va en NULL, como en la v1). */
export interface DatosProspeccion {
  codCliente?: number;
  codProspecto?: number;
  fechaHora?: string;
  mensaje?: string;
  fechaHoraAgenda?: string;
  codCategoriaMensaje?: number;
  codResultado?: number;
  codComercializadora?: number;
  codReclamo?: number;
  tipoDocumento?: string;
  nroDocumento?: string;
  telefono?: string;
  telefonoMovil?: string;
  email?: string;
  fechaNacimiento?: string;
  apellido?: string;
  nombre?: string;
  domicilio?: string;
  codGrupoProspecto?: number;
  codProvincia?: number;
  codLocalidad?: number;
  codBarrio?: number;
  fechaCierrePosible?: string;
  tipoPlanDisponible?: string;
  codPlanDisponible?: number;
  forecast?: number;
  montoCotizacion?: number;
  cantEmpleados?: number;
}

export interface SalidaProspeccion {
  COD_PROSPECTACION_MOVIL: number | null;
  /** 0 = éxito, -1 = rechazo (motivo en MENSAJE_SALIDA). */
  SALIDA: number | null;
  MENSAJE_SALIDA: string | null;
}

/** Los 36 parámetros de MM_PROC_SET_PROSPECCION_MOVILB2, en el orden de su firma. */
export function parametrosProspeccion(usuario: number | null, vendedor: number, d: DatosProspeccion): ValorParametro[] {
  return [
    usuario, // COD_USUARIO
    vendedor, // COD_VENDEDOR
    null, // COD_CLIENTE_SQLITE (solo la app móvil)
    opcional(d.codCliente), // COD_CLIENTE_FIREBIRD
    opcional(d.codProspecto),
    opcional(d.fechaHora),
    opcional(d.mensaje),
    opcional(d.fechaHoraAgenda),
    opcional(d.codCategoriaMensaje),
    opcional(d.codResultado), // COD_RESULTADO_RECLAMO
    opcional(d.codComercializadora),
    opcional(d.codReclamo),
    null, // COD_RECLAMO_SQLITE
    opcional(d.tipoDocumento),
    opcional(d.nroDocumento),
    opcional(d.telefono),
    opcional(d.telefonoMovil),
    opcional(d.email),
    opcional(d.fechaNacimiento),
    opcional(d.apellido), // APELLIDO_SOLO
    opcional(d.nombre), // NOMBRE_SOLO
    null, // APELLIDO_MATERNO
    opcional(d.domicilio),
    opcional(d.codGrupoProspecto),
    null, // GEO_X
    null, // GEO_Y
    opcional(d.codProvincia),
    opcional(d.codLocalidad),
    opcional(d.codBarrio),
    opcional(d.fechaCierrePosible),
    opcional(d.tipoPlanDisponible),
    opcional(d.codPlanDisponible),
    opcional(d.forecast),
    d.montoCotizacion === undefined ? null : Math.round(d.montoCotizacion), // INTEGER en el procedure
    opcional(d.cantEmpleados),
    null, // CUIT
  ];
}

export async function setProspeccion(sp: EjecutarSp, usuario: number | null, vendedor: number, d: DatosProspeccion): Promise<SalidaProspeccion | undefined> {
  const filas = await sp('MM_PROC_SET_PROSPECCION_MOVILB2', parametrosProspeccion(usuario, vendedor, d));
  return filas[0] as unknown as SalidaProspeccion | undefined;
}
