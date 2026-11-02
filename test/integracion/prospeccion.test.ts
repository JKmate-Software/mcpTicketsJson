import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearCredenciales } from '../../src/auth/credenciales.js';
import { crearServicioJwt } from '../../src/auth/jwt.js';
import { CacheCatalogos } from '../../src/busqueda/catalogo.js';
import { cargarCatalogo, rutaCatalogo } from '../../src/funciones/catalogo.js';
import { crearAppHttp, escuchar } from '../../src/http.js';
import { loggerEnMemoria } from '../apoyo.js';
import { accesoDesdeEntorno, hayBase } from './base.js';

/**
 * MCP de prospección de punta a punta contra la base de pruebas (SANTAROSA64_IA; nunca CREAR_JK3,
 * que es producción): login real por /token, Bearer en /mcp y tools reales.
 *
 * Lectura: PROSPECCION_PRUEBA_APIKEY (y PROSPECCION_PRUEBA_APISECRET, vacía para tlfvendedor) con
 * PROSPECCION_PRUEBA_TIPO (default tlfvendedor). Opcional, un segundo vendedor:
 * PROSPECCION_PRUEBA_APIKEY_2 / _APISECRET_2.
 * Escritura: además PRUEBAS_ESCRITURA=1. Crea registros reales marcados TEST-MCP / [TEST MCP].
 */
const env = process.env;
const TIPO = env.PROSPECCION_PRUEBA_TIPO || 'tlfvendedor';
const hayCredencial = hayBase && Boolean(env.PROSPECCION_PRUEBA_APIKEY);
const ESCRIBIR = env.PRUEBAS_ESCRITURA === '1';

describe.skipIf(!hayCredencial)('prospección contra la base de pruebas', { timeout: 120_000 }, () => {
  let acceso: ReturnType<typeof accesoDesdeEntorno>;
  let servidor: Server;
  let base: string;

  beforeAll(async () => {
    acceso = accesoDesdeEntorno();
    const catalogo = await cargarCatalogo(rutaCatalogo('prospeccion'), {
      acceso,
      zonaHoraria: env.ZONA_HORARIA_BASE ?? 'America/Argentina/Buenos_Aires',
      cache: new CacheCatalogos(),
    });
    const app = crearAppHttp({
      config: {
        MCP_URL_PUBLICA: undefined,
        MCP_AUTH_TIPO: TIPO,
        MCP_AUTH_TITULO_AUTORIZACION: 'Prospección (prueba)',
        MCP_AUTH_APIKEY_REQUERIDO: true,
        MCP_AUTH_APIKEY_TITULO: 'Teléfono',
        MCP_AUTH_APISECRET_REQUERIDO: Boolean(env.PROSPECCION_PRUEBA_APISECRET),
        MCP_AUTH_APISECRET_TITULO: 'Clave',
      },
      tools: catalogo.tools,
      logger: loggerEnMemoria().logger,
      credenciales: crearCredenciales(acceso),
      jwt: crearServicioJwt('secreto-de-integracion-de-al-menos-32-bytes', 15),
      claimRequerida: catalogo.servidor.claimRequerida,
      nombreServidor: catalogo.servidor.nombre,
    });
    servidor = await escuchar(app, 0);
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    servidor?.close();
    await acceso?.cerrar();
  });

  async function token(apikey = env.PROSPECCION_PRUEBA_APIKEY!, apisecret = env.PROSPECCION_PRUEBA_APISECRET ?? '') {
    const r = await fetch(`${base}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: apikey, client_secret: apisecret }).toString(),
    });
    expect(r.status, 'login de prueba').toBe(200);
    return ((await r.json()) as { access_token: string }).access_token;
  }

  let id = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function tool(t: string, nombre: string, args: Record<string, unknown> = {}): Promise<any> {
    const r = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name: nombre, arguments: args } }),
    });
    expect(r.status).toBe(200);
    const { result } = (await r.json()) as { result: { structuredContent: unknown; isError?: boolean } };
    expect(result.isError, `${nombre}: ${JSON.stringify(result.structuredContent)}`).toBeFalsy();
    return result.structuredContent;
  }

  it(`login ${TIPO} → resumen, búsqueda y catálogo con búsqueda aproximada`, async () => {
    const t = await token();
    const quien = await tool(t, 'user_info');
    expect(quien.codVendedor).toBeGreaterThan(0);
    console.log(`Vendedor de prueba: ${quien.codVendedor} (usuario ${quien.codUsuario ?? '-'})`);

    const resumen = await tool(t, 'resumen_prospeccion');
    expect(resumen.intervalos.length).toBeGreaterThan(0);

    const busqueda = await tool(t, 'buscar_prospectos_vendedor', { maxFilas: 5 });
    console.log(`buscar_prospectos_vendedor: ${busqueda.prospectos.length} (hayMas=${busqueda.hayMas})`);

    const barrios = await tool(t, 'listar_catalogo', { catalogo: 'barrios', buscar: 'centro' });
    expect(barrios.busqueda.totalCatalogo).toBeGreaterThan(0);
    const inicio = performance.now();
    await tool(t, 'listar_catalogo', { catalogo: 'barrios', buscar: 'alberdi' });
    console.log(`Segunda búsqueda de barrios (caché): ${Math.round(performance.now() - inicio)} ms`);
  });

  it.skipIf(!env.PROSPECCION_PRUEBA_APIKEY_2)('dos vendedores, misma instancia: cada uno ve su cartera', async () => {
    const [t1, t2] = [await token(), await token(env.PROSPECCION_PRUEBA_APIKEY_2!, env.PROSPECCION_PRUEBA_APISECRET_2 ?? '')];
    const [v1, v2] = [(await tool(t1, 'user_info')).codVendedor, (await tool(t2, 'user_info')).codVendedor];
    expect(v1).not.toBe(v2);
    const [p1, p2] = [await tool(t1, 'buscar_prospectos_vendedor'), await tool(t2, 'buscar_prospectos_vendedor')];
    const ids = (p: { prospectos: { codProspectacionMovil: number }[] }) => new Set(p.prospectos.map((x) => x.codProspectacionMovil));
    const comunes = [...ids(p1)].filter((x) => ids(p2).has(x));
    expect(comunes).toEqual([]);
  });

  it.skipIf(!ESCRIBIR)('escritura: alta TEST-MCP → gestión [TEST MCP] → modificación de email', async () => {
    const t = await token();
    const pick = async (catalogo: string, extra: Record<string, unknown> = {}) => {
      const r = await tool(t, 'listar_catalogo', { catalogo, ...extra });
      expect(r.elementos.length, `catálogo ${catalogo} vacío`).toBeGreaterThan(0);
      return r.elementos[0];
    };
    const grupo = await pick('grupos');
    const canal = await pick('canales', { buscar: 'a' }).catch(() => pick('canales'));
    const categoria = await pick('categorias');
    const resultados = await tool(t, 'listar_catalogo', { catalogo: 'resultados', codPadre: categoria.codigo });
    const resultado = resultados.elementos.find((e: { exigeAgendamiento: boolean }) => !e.exigeAgendamiento) ?? resultados.elementos[0];
    const codigos = { codGrupoProspecto: grupo.codigo, codComercializadora: canal.codigo, codCategoriaMensaje: categoria.codigo, codResultado: resultado.codigo };
    const cita = resultado.exigeAgendamiento ? { fechaHoraAgenda: '2026-12-01T10:00' } : {};
    const sello = Date.now().toString(36);

    const alta = await tool(t, 'registrar_prospecto', {
      apellido: 'TEST-MCP',
      nombre: `Prueba ${sello}`,
      email: `test-mcp-${sello}@ejemplo.invalid`,
      mensaje: `[TEST MCP] alta ${sello}`,
      ...codigos,
      ...cita,
    });
    console.log(`Alta: registro ${alta.codProspectacionMovil}`);

    const encontrados = await tool(t, 'buscar_prospectos_vendedor', { cliente: `Prueba ${sello}` });
    const prospecto = encontrados.prospectos[0];
    expect(prospecto, 'el alta aparece al buscarla por nombre').toBeDefined();
    console.log(`Prospecto creado: codProspecto=${prospecto.codProspecto} codCliente=${prospecto.codCliente}`);

    await tool(t, 'registrar_gestion_prospecto', {
      codCliente: prospecto.codCliente,
      codProspecto: prospecto.codProspecto,
      mensaje: `[TEST MCP] gestión ${sello}`,
      ...codigos,
      ...cita,
    });
    const historial = await tool(t, 'historial_mensajes_prospecto', { codCliente: prospecto.codCliente, codProspecto: prospecto.codProspecto });
    expect(historial.gestiones.some((g: { mensaje: string | null }) => g.mensaje?.includes(`gestión ${sello}`))).toBe(true);

    const nuevoEmail = `test-mcp-${sello}-2@ejemplo.invalid`;
    const mod = await tool(t, 'modificar_prospecto', { codCliente: prospecto.codCliente, codProspecto: prospecto.codProspecto, email: nuevoEmail });
    expect(mod.codProspectacionMovil).toBeNull();
    const fila = await acceso.consultar('SELECT EMAIL FROM PROSPECTOS WHERE COD_PROSPECTO = ?', [prospecto.codProspecto]);
    expect(String(fila[0]?.EMAIL ?? '').trim()).toBe(nuevoEmail);
  });
});
