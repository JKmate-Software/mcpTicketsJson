import { describe, expect, it } from 'vitest';
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { Sesion } from '../src/auth/sesion.js';
import { CacheCatalogos } from '../src/busqueda/catalogo.js';
import { conectarCliente, r, toolsDe } from './apoyo.js';
import { accesoProspeccion } from './datos/catalogos-prospeccion.js';

const SESION: Sesion = { codUsuario: 874, codDesarrollador: null, codVendedor: 12, transporte: 'http' };

/** Una fila mínima por procedure, con columnas de UI incluidas para verificar que no se filtran. */
const MANEJADORES = {
  PROC_MCP_RESUMEN_PROSPECCION: () => [{ INTERVALO: 'Día', FECHA_DESDE: r('2026-10-29'), FECHA_HASTA: r('2026-10-29'), ASIGNADOS: 1, NUEVOS: 0, AGENDADOS: 0, GESTIONADOS: 1 }],
  PROC_GET_EST_PROSP_X_REC: () => [{ RESULTADO_RECLAMO: 'X', COD_RESULTADO_RECLAMO: 1, CANTIDAD: 2 }],
  PROC_MCP_BUSCAR_PROSPECTOS: () => [
    { COD_PROSPECTACION_MOVIL: 1, COD_PROSPECTO: 2, COD_CLIENTE: 3, CLIENTE: 'A', TELEFONOS: null, DOMICILIO: null, EDAD: 30, COD_GRUPO_PROSPECTO: 4, GRUPO: 'G', COD_RECLAMO: null, FECHA_HORA_GESTION: r('2026-10-28 10:00:00'), COD_CATEGORIA_MENSAJE: 5, ACCION: 'L', COD_RESULTADO_RECLAMO: 6, RESULTADO_GESTION: 'R', ULTIMO_MENSAJE: null, FECHA_HORA_CITA: null, COD_ENTIDAD: 7, CANAL: null, COD_CAMPANIA: null, CAMPANIA: null, COD_BARRIO: null, BARRIO: null, LOCALIDAD: null, ARCHIVADO: 0 },
  ],
  PROC_AGENDA_PROSPECTOS: () => [{ TITULO: 'T', CLIENTE: 'A', TELEFONO_MOVIL: null, FECHA_HORA_CITA: r('2026-11-02 10:00:00'), FECHA_HORA_FIN: null, FECHA_ORDEN: null, COD_CLIENTE: 3, COD_PROSPECTO: 2, COD_PROSPECTACION_MOVIL: 1 }],
  PROC_GET_MENSAJES_X_CLIENTEP: () => [{ FECHA_HORA: r('2026-10-28 10:00:00'), FECHA_HORA_AGENDA: null, CATEGORIA_MENSAJE: 'L', RESULTADO_TRAMITE: null, ESTADO_TRAMITE: null, MENSAJE: 'm', ENTIDAD_RELACIONADA: null, USUARIO: 'u', NRO_TRAMITE: null, COLOR: 'red' }],
  MM_PROC_SET_PROSPECCION_MOVILB2: () => [{ COD_PROSPECTACION_MOVIL: 9, SALIDA: 0, MENSAJE_SALIDA: '' }],
  PROC_GET_GRUPOS_PROSP_X_VEND: () => [{ COD_GRUPO_PROSPECTO: 4, NOMBRE: 'G', ESTADO_GRUPO_PROSPECTO: 1 }],
  PROC_GET_RESULTADOS_RECL_X_CAT: () => [{ COD_RESULTADO_RECLAMO: 6, DESCRIPCION: 'R', EXIGE_AGENDAMIENTO: 1 }],
  PROC_GET_BARRIOS: () => [{ COD_BARRIO: 1, COD_LOCALIDAD: 2, NOMBRE: 'CENTRO', CODIGO_POSTAL: '5000', COD_ZONA_GEOGRAFICA: 3 }],
};

const LLAMADAS: [string, Record<string, unknown>][] = [
  ['user_info', {}],
  ['obtener_instrucciones', {}],
  ['resumen_prospeccion', {}],
  ['totales_resultado_prospeccion', { intervalo: 'Mes' }],
  ['buscar_prospectos_vendedor', {}],
  ['agendas_prospectos_vendedor', { fechaDesde: '2026-11-01', fechaHasta: '2026-11-30' }],
  ['historial_mensajes_prospecto', { codCliente: 3, codProspecto: 2 }],
  ['registrar_gestion_prospecto', { codCliente: 3, codProspecto: 2, codGrupoProspecto: 4, codComercializadora: 7, codCategoriaMensaje: 5, codResultado: 6 }],
  ['registrar_prospecto', { apellido: 'A', nombre: 'B', email: 'a@b.c', codGrupoProspecto: 4, codComercializadora: 7, codCategoriaMensaje: 5, codResultado: 6 }],
  ['modificar_prospecto', { codCliente: 3, codProspecto: 2, email: 'a@b.c' }],
  ['listar_catalogo', { catalogo: 'grupos' }],
  ['listar_catalogo', { catalogo: 'resultados', codPadre: 5 }],
  ['listar_catalogo', { catalogo: 'barrios', buscar: 'centro', codPadre: 1 }],
];

async function conectar() {
  const { acceso } = accesoProspeccion(MANEJADORES);
  return conectarCliente(await toolsDe('prospeccion', { acceso, zonaHoraria: 'America/Argentina/Buenos_Aires', cache: new CacheCatalogos() }), SESION, 'mcp-prospeccion-json');
}

/** Todas las claves de objetos anidados. */
function claves(valor: unknown, acumulado: string[] = []): string[] {
  if (Array.isArray(valor)) valor.forEach((v) => claves(v, acumulado));
  else if (valor && typeof valor === 'object') {
    for (const [k, v] of Object.entries(valor)) {
      acumulado.push(k);
      claves(v, acumulado);
    }
  }
  return acumulado;
}

describe('contrato del catálogo de prospección', () => {
  it('publica solo las 11 tools de prospección, user_info y obtener_instrucciones primero', async () => {
    const { cliente } = await conectar();
    expect((await cliente.listTools()).tools.map((t) => t.name)).toEqual([
      'user_info',
      'obtener_instrucciones',
      'resumen_prospeccion',
      'totales_resultado_prospeccion',
      'buscar_prospectos_vendedor',
      'agendas_prospectos_vendedor',
      'historial_mensajes_prospecto',
      'registrar_gestion_prospecto',
      'registrar_prospecto',
      'modificar_prospecto',
      'listar_catalogo',
    ]);
  });

  it('toda respuesta valida contra su outputSchema, en camelCase y sin datos de UI', async () => {
    const { cliente } = await conectar();
    const tools = new Map((await cliente.listTools()).tools.map((t) => [t.name, t]));
    const ajv = new Ajv2020({ strict: false });
    for (const [nombre, args] of LLAMADAS) {
      const resultado = await cliente.callTool({ name: nombre, arguments: args });
      expect(resultado.isError, `${nombre}: ${JSON.stringify(resultado.structuredContent)}`).toBeFalsy();
      const valido = ajv.validate(tools.get(nombre)!.outputSchema!, resultado.structuredContent);
      expect(valido, `${nombre}: ${ajv.errorsText()}`).toBe(true);
      for (const clave of claves(resultado.structuredContent)) {
        expect(clave, nombre).toMatch(/^[a-z][a-zA-Z0-9]*$/);
        expect(clave.toLowerCase(), nombre).not.toBe('color');
      }
    }
  });

  it('todo outputSchema admite la forma de error e inputSchema cerrado', async () => {
    const { cliente } = await conectar();
    for (const t of (await cliente.listTools()).tools) {
      expect(t.outputSchema?.properties?.error, t.name).toBeDefined();
      expect(t.inputSchema, t.name).toMatchObject({ type: 'object', additionalProperties: false });
      expect(t.inputSchema, t.name).not.toHaveProperty('$schema');
    }
  });

  it('annotations: lectura salvo las tres escrituras', async () => {
    const { cliente } = await conectar();
    const escrituras = ['registrar_gestion_prospecto', 'registrar_prospecto', 'modificar_prospecto'];
    for (const t of (await cliente.listTools()).tools) {
      expect(t.annotations?.readOnlyHint, t.name).toBe(!escrituras.includes(t.name));
      expect(t.annotations?.destructiveHint, t.name).toBe(false);
    }
  });
});

describe('sesión e instrucciones', () => {
  it('user_info: vendedor logueado por teléfono', async () => {
    const { cliente } = await conectar();
    const r = await cliente.callTool({ name: 'user_info', arguments: {} });
    expect(r.structuredContent).toEqual({ codUsuario: 874, codVendedor: 12, transporte: 'http' });
  });

  it('obtener_instrucciones: checklist, listar_catalogo y sin nombres de parámetros de la v1', async () => {
    const { cliente } = await conectar();
    const r = await cliente.callTool({ name: 'obtener_instrucciones', arguments: {} });
    const texto = (r.structuredContent as { instrucciones: string }).instrucciones;
    expect(texto).toContain('Checklist antes de registrar');
    expect(texto).toContain('listar_catalogo');
    expect(texto).not.toMatch(/MAX_FILAS_IN|COD_PADRE|ARCHIVADO_IN|EXIGE_AGENDAMIENTO|\bBUSCAR\b|\bCATALOGO\b/);
  });

  it('obtener_instrucciones pide que la llamen primero', async () => {
    const { cliente } = await conectar();
    const t = (await cliente.listTools()).tools.find((x) => x.name === 'obtener_instrucciones');
    expect(t?.description).toContain('ANTES que cualquier otra');
  });

  it('el handshake no trae instructions y se identifica como prospección', async () => {
    const { cliente } = await conectar();
    expect(cliente.getInstructions()).toBeUndefined();
    expect(cliente.getServerVersion()?.name).toBe('mcp-prospeccion-json');
  });
});
