import type { Sesion } from '../../src/auth/sesion.js';
import type { Fila, ValorParametro } from '../../src/db/firebird.js';
import { relojDesdeTexto as r } from '../../src/mapeo/fecha.js';
import { accesoSimulado, type ManejadorSp } from '../apoyo.js';
import { metadataSimulada, T, type ProcedureSimulado } from '../funciones-apoyo.js';

/** Sesión de un vendedor (prospección por http). */
export const SESION_CATALOGO: Sesion = { codUsuario: 874, codDesarrollador: null, codVendedor: 12, transporte: 'http' };

/**
 * Filas simuladas de los procedures de los 8 catálogos de prospección, con las columnas reales
 * (verificadas en SANTAROSA64_IA) más columnas que no se publican, textos CHAR con relleno y
 * órdenes distintos del esperado, para que la captura ejercite proyección, recorte y orden.
 */
export const FILAS_CATALOGOS: Record<string, (p: ValorParametro[]) => Fila[]> = {
  PROC_GET_GRUPOS_PROSP_X_VEND: () => [
    { COD_GRUPO_PROSPECTO: 4, NOMBRE: 'CARTERA PROPIA   ', COD_CAMPANIA: 9, ESTADO_GRUPO_PROSPECTO: 1 },
    { COD_GRUPO_PROSPECTO: 5, NOMBRE: 'REFERIDOS', COD_CAMPANIA: null, ESTADO_GRUPO_PROSPECTO: null },
  ],
  PROC_GET_ENTIDADES_X_MCCATEG: () => [
    { NOMBRE: 'FACEBOOK', COD_ENTIDAD: 31 },
    { NOMBRE: 'INSTAGRAM', COD_ENTIDAD: 32 },
    { NOMBRE: 'REFERIDO DE CLIENTE', COD_ENTIDAD: 33 },
  ],
  PROC_GET_CAT_MENS_ENC_PROSP: (p) => [
    { COD_CATEGORIA_MENSAJE: 100 + Number(p[1] ?? 0), CATEGORIA: 'LLAMADA' },
    { COD_CATEGORIA_MENSAJE: 200, CATEGORIA: 'VISITA' },
  ],
  PROC_GET_RESULTADOS_RECL_X_CAT: (p) => [
    { COD_RESULTADO_RECLAMO: Number(p[0]) * 10 + 1, COD_CATEGORIA: p[0], DESCRIPCION: 'VOLVER A LLAMAR', EXIGE_AGENDAMIENTO: 1 },
    { COD_RESULTADO_RECLAMO: Number(p[0]) * 10 + 2, COD_CATEGORIA: p[0], DESCRIPCION: 'NO LE INTERESA', EXIGE_AGENDAMIENTO: 0 },
  ],
  PROC_GET_CAT_MENSAJES_PROSP: () => [
    { COD_CATEGORIA_MENSAJE: 100, CATEGORIA: 'LLAMADA' },
    { COD_CATEGORIA_MENSAJE: 300, CATEGORIA: 'WHATSAPP' },
  ],
  PROC_GET_CAMPANIAS: () => [
    { FECHA_INICIO: r('2026-01-01'), FECHA_FIN: r('2026-03-31'), COD_CAMPANIA: 1, CAMPANIA: 'VERANO 2026' },
    { FECHA_INICIO: r('2026-09-01'), FECHA_FIN: r('2026-12-31'), COD_CAMPANIA: 3, CAMPANIA: 'PRIMAVERA 2026' },
    { FECHA_INICIO: r('2026-04-01'), FECHA_FIN: null, COD_CAMPANIA: 2, CAMPANIA: 'OTOÑO 2026' },
  ],
  PROC_GET_LOCALIDADES: () => [
    { COD_LOCALIDAD: 1, COD_PROVINCIA: 5, NOMBRE: 'CORDOBA', CODIGO_POSTAL: '5000', COEFICIENTE_DESC: 0, COEFICIENTE_RECARGO: 0, ES_DESTINO_TRASLADO: 0, COD_ZONA_GEOGRAFICA: 1 },
    { COD_LOCALIDAD: 2, COD_PROVINCIA: 5, NOMBRE: 'VILLA CARLOS PAZ', CODIGO_POSTAL: '5152', COEFICIENTE_DESC: 0, COEFICIENTE_RECARGO: 0, ES_DESTINO_TRASLADO: 0, COD_ZONA_GEOGRAFICA: 2 },
    { COD_LOCALIDAD: 3, COD_PROVINCIA: 4, NOMBRE: 'ROSARIO', CODIGO_POSTAL: null, COEFICIENTE_DESC: 0, COEFICIENTE_RECARGO: 0, ES_DESTINO_TRASLADO: 0, COD_ZONA_GEOGRAFICA: 3 },
  ],
  PROC_GET_BARRIOS: () => [
    { COD_BARRIO: 11, COD_LOCALIDAD: 1, NOMBRE: 'NUEVA CORDOBA', CODIGO_POSTAL: '5000', COD_ZONA_GEOGRAFICA: 1 },
    { COD_BARRIO: 12, COD_LOCALIDAD: 1, NOMBRE: 'ALBERDI', CODIGO_POSTAL: '5000', COD_ZONA_GEOGRAFICA: 1 },
    { COD_BARRIO: 13, COD_LOCALIDAD: 1, NOMBRE: 'CENTRO', CODIGO_POSTAL: null, COD_ZONA_GEOGRAFICA: 1 },
    { COD_BARRIO: 14, COD_LOCALIDAD: 2, NOMBRE: 'ALTO ALBERDI', CODIGO_POSTAL: '5003', COD_ZONA_GEOGRAFICA: 2 },
  ],
};

/** Llamadas a listar_catalogo que cubren todas las variantes, padre, búsqueda y avisos. */
export const LLAMADAS_CATALOGO: Record<string, unknown>[] = [
  { catalogo: 'grupos' },
  { catalogo: 'canales' },
  { catalogo: 'canales', buscar: 'instagran' },
  { catalogo: 'categorias' },
  { catalogo: 'categorias', codPadre: 7 },
  { catalogo: 'resultados', codPadre: 5 },
  { catalogo: 'resultados' },
  { catalogo: 'acciones', buscar: 'x' },
  { catalogo: 'campanias' },
  { catalogo: 'campanias', buscar: 'primavera' },
  { catalogo: 'localidades', buscar: 'carlos paz' },
  { catalogo: 'barrios' },
  { catalogo: 'barrios', buscar: 'alberdi', codPadre: 1 },
  { catalogo: 'provincias' },
];

/** Firma de los procedures de los catálogos (verificada en SANTAROSA64_IA), para la metadata simulada. */
export const PROCEDURES_CATALOGOS: Record<string, ProcedureSimulado> = {
  PROC_GET_GRUPOS_PROSP_X_VEND: { entradas: ['COD_VENDEDOR_IN'], salidas: { COD_GRUPO_PROSPECTO: T.INTEGER, NOMBRE: T.VARCHAR, COD_CAMPANIA: T.INTEGER, ESTADO_GRUPO_PROSPECTO: T.SMALLINT } },
  PROC_GET_ENTIDADES_X_MCCATEG: { entradas: ['MACRO'], salidas: { NOMBRE: T.VARCHAR, COD_ENTIDAD: T.INTEGER } },
  PROC_GET_CAT_MENS_ENC_PROSP: { entradas: ['SEGUIMIENTO', 'COD_RESULT_RECL_ORIGEN'], salidas: { COD_CATEGORIA_MENSAJE: T.INTEGER, CATEGORIA: T.VARCHAR } },
  PROC_GET_RESULTADOS_RECL_X_CAT: { entradas: ['COD_CATEGORIA_MENSAJE'], salidas: { COD_RESULTADO_RECLAMO: T.INTEGER, DESCRIPCION: T.VARCHAR, EXIGE_AGENDAMIENTO: T.SMALLINT } },
  PROC_GET_CAT_MENSAJES_PROSP: { entradas: ['SEGUIMIENTO'], salidas: { COD_CATEGORIA_MENSAJE: T.INTEGER, CATEGORIA: T.VARCHAR } },
  PROC_GET_CAMPANIAS: { salidas: { FECHA_INICIO: T.DATE, FECHA_FIN: T.DATE, COD_CAMPANIA: T.INTEGER, CAMPANIA: T.VARCHAR } },
  PROC_GET_LOCALIDADES: { salidas: { COD_LOCALIDAD: T.INTEGER, COD_PROVINCIA: T.INTEGER, NOMBRE: T.VARCHAR, CODIGO_POSTAL: T.VARCHAR } },
  PROC_GET_BARRIOS: { salidas: { COD_BARRIO: T.INTEGER, COD_LOCALIDAD: T.INTEGER, NOMBRE: T.VARCHAR, CODIGO_POSTAL: T.VARCHAR } },
};

/** Base simulada de prospección: los manejadores dados más la metadata de los procedures de catálogo. */
export function accesoProspeccion(manejadores: Record<string, ManejadorSp>) {
  return accesoSimulado(manejadores, null, { contratoResultado: false, sql: metadataSimulada(PROCEDURES_CATALOGOS) });
}
