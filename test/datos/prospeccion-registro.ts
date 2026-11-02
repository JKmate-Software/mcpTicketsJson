import { accesoSimulado, conectarCliente, toolDe } from '../apoyo.js';
import type { Sesion } from '../../src/auth/sesion.js';
import { CacheCatalogos } from '../../src/busqueda/catalogo.js';
import type { Fila } from '../../src/db/firebird.js';
import type { ResultadoRegistro } from '../../src/comunes/registro-prospeccion.js';

export const ZONA = 'America/Argentina/Buenos_Aires';
export const SESION: Sesion = { codUsuario: 874, codDesarrollador: null, codVendedor: 12, transporte: 'http' };

export const CODIGOS = { codGrupoProspecto: 5, codComercializadora: 7, codCategoriaMensaje: 30, codResultado: 40 };

export async function invocar(tool: string, args: Record<string, unknown>, respuesta: Fila = { COD_PROSPECTACION_MOVIL: 991, SALIDA: 0, MENSAJE_SALIDA: '' }) {
  const { acceso, llamadas, transacciones } = accesoSimulado({ MM_PROC_SET_PROSPECCION_MOVILB2: () => [respuesta] }, null, { contratoResultado: false });
  const deps = { acceso, zonaHoraria: ZONA, cache: new CacheCatalogos() };
  const { cliente } = await conectarCliente([await toolDe('prospeccion', 'registrar_gestion_prospecto', deps), await toolDe('prospeccion', 'registrar_prospecto', deps), await toolDe('prospeccion', 'modificar_prospecto', deps)], SESION);
  const resultado = await cliente.callTool({ name: tool, arguments: args });
  return {
    resultado,
    datos: resultado.structuredContent as unknown as ResultadoRegistro & { error?: { codigo: string; mensaje: string } },
    llamadas,
    transacciones,
    parametros: llamadas[0]?.parametros ?? [],
  };
}

/** Posición (base 0) de cada parámetro de MM_PROC_SET_PROSPECCION_MOVILB2 en su firma. */
export const P = {
  COD_USUARIO: 0, COD_VENDEDOR: 1, COD_CLIENTE_SQLITE: 2, COD_CLIENTE_FIREBIRD: 3, COD_PROSPECTO: 4, FECHA_HORA: 5, MENSAJE: 6,
  FECHA_HORA_AGENDA: 7, COD_CATEGORIA_MENSAJE: 8, COD_RESULTADO_RECLAMO: 9, COD_COMERCIALIZADORA: 10, COD_RECLAMO: 11,
  COD_RECLAMO_SQLITE: 12, TIPO_DOCUMENTO: 13, NRO_DOCUMENTO: 14, TELEFONO: 15, TELEFONO_MOVIL: 16, EMAIL: 17, FECHA_NACIMIENTO: 18,
  APELLIDO_SOLO: 19, NOMBRE_SOLO: 20, APELLIDO_MATERNO: 21, DOMICILIO: 22, COD_GRUPO_PROSPECTO: 23, GEO_X: 24, GEO_Y: 25,
  COD_PROVINCIA: 26, COD_LOCALIDAD: 27, COD_BARRIO: 28, FECHA_CIERRE_POSIBLE: 29, TIPO_PLAN_DISPONIBLE: 30, COD_PLAN_DISPONIBLE: 31,
  FORECAST: 32, MONTO_COTIZACION: 33, CANT_EMPLEADOS: 34, CUIT: 35,
} as const;
