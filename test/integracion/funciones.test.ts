import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearCredenciales } from '../../src/auth/credenciales.js';
import { crearServicioJwt } from '../../src/auth/jwt.js';
import { CacheCatalogos } from '../../src/busqueda/catalogo.js';
import { cargarCatalogo, rutaCatalogo } from '../../src/funciones/catalogo.js';
import { crearAccesoFirebird } from '../../src/db/firebird.js';
import { leerArchivoFunciones } from '../../src/funciones/cargar.js';
import { validarContraBase } from '../../src/funciones/validar.js';
import { crearAppHttp, escuchar } from '../../src/http.js';
import { loggerEnMemoria } from '../apoyo.js';
import { accesoDesdeEntorno, hayBase } from './base.js';

/**
 * Archivo de funciones de punta a punta contra la base de pruebas (SANTAROSA64_IA; nunca CREAR_JK3,
 * que es producción): catálogo funciones/demo-functions.json con tools procedure, webservice y el
 * listar_catalogo genérico, login real por /token y contexto de sesión en la base.
 * Usa FIREBIRD_* y PROSPECCION_PRUEBA_APIKEY (+ _APISECRET, vacía para tlfvendedor).
 */
const env = process.env;
const TIPO = env.PROSPECCION_PRUEBA_TIPO || 'tlfvendedor';
const hayCredencial = hayBase && Boolean(env.PROSPECCION_PRUEBA_APIKEY);
const ZONA = env.ZONA_HORARIA_BASE ?? 'America/Argentina/Buenos_Aires';

const configBase = () => ({
  FIREBIRD_HOST: env.FIREBIRD_HOST ?? '127.0.0.1',
  FIREBIRD_PORT: Number(env.FIREBIRD_PORT ?? 3050),
  FIREBIRD_DATABASE: env.FIREBIRD_DATABASE ?? '',
  FIREBIRD_USER: env.FIREBIRD_USER ?? 'SYSDBA',
  FIREBIRD_PASSWORD: env.FIREBIRD_PASSWORD,
});

describe.skipIf(!hayBase)('archivo de funciones contra la base de pruebas', { timeout: 120_000 }, () => {
  it('validar-funciones: los catálogos demo y prospección no tienen errores', async () => {
    const acceso = accesoDesdeEntorno();
    try {
      for (const catalogo of ['demo', 'prospeccion']) {
        const archivo = leerArchivoFunciones(rutaCatalogo(catalogo));
        const reporte = await acceso.enTransaccionConContexto({ contexto: {}, escritura: false }, (sql) => validarContraBase(archivo, sql));
        expect(reporte.problemas, catalogo).toEqual([]);
      }
    } finally {
      await acceso.cerrar();
    }
  });

  it('el contexto de sesión llega a RDB$GET_CONTEXT y no se filtra en una conexión reutilizada', async () => {
    // Pool de una sola conexión: la segunda invocación reusa la misma.
    const acceso = crearAccesoFirebird({ ...configBase(), FIREBIRD_POOL_MAX: 1 });
    const leer = (vendedor: string | null) =>
      acceso.enTransaccionConContexto({ contexto: { COD_VENDEDOR: vendedor }, escritura: false }, async (sql) => {
        const [fila] = await sql("SELECT RDB$GET_CONTEXT('USER_SESSION', 'COD_VENDEDOR') AS V FROM RDB$DATABASE", []);
        return fila?.V ?? null;
      });
    try {
      expect(await leer('12')).toBe('12');
      expect(await leer(null)).toBeNull();
    } finally {
      await acceso.cerrar();
    }
  });

  it('latencia: contexto en el pool frente a conexión exclusiva', async () => {
    const acceso = crearAccesoFirebird({ ...configBase(), FIREBIRD_POOL_MAX: 2 });
    const medir = async (exclusiva: boolean) => {
      await acceso.enTransaccionConContexto({ contexto: { COD_VENDEDOR: '1' }, escritura: false, exclusiva }, (sql) => sql('SELECT 1 AS X FROM RDB$DATABASE', []));
      const inicio = performance.now();
      for (let i = 0; i < 20; i++) {
        await acceso.enTransaccionConContexto({ contexto: { COD_VENDEDOR: String(i) }, escritura: false, exclusiva }, (sql) => sql('SELECT 1 AS X FROM RDB$DATABASE', []));
      }
      return (performance.now() - inicio) / 20;
    };
    try {
      const pool = await medir(false);
      const exclusiva = await medir(true);
      console.log(`Promedio por invocación: pool + contexto ${pool.toFixed(1)} ms; conexión exclusiva ${exclusiva.toFixed(1)} ms`);
      expect(pool).toBeGreaterThan(0);
    } finally {
      await acceso.cerrar();
    }
  });
});

describe.skipIf(!hayCredencial)('catálogo demo por HTTP con login real', { timeout: 120_000 }, () => {
  let acceso: ReturnType<typeof accesoDesdeEntorno>;
  let servidor: Server;
  let base: string;

  beforeAll(async () => {
    acceso = accesoDesdeEntorno();
    const catalogo = await cargarCatalogo(rutaCatalogo('demo'), { acceso, zonaHoraria: ZONA, cache: new CacheCatalogos() });
    const app = crearAppHttp({
      config: {
        MCP_URL_PUBLICA: undefined,
        MCP_AUTH_TIPO: TIPO,
        MCP_AUTH_TITULO_AUTORIZACION: 'Demo (prueba)',
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

  async function token() {
    const r = await fetch(`${base}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: env.PROSPECCION_PRUEBA_APIKEY!, client_secret: env.PROSPECCION_PRUEBA_APISECRET ?? '' }).toString(),
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

  it('procedure, webservice y listar_catalogo genérico con datos reales', async () => {
    const t = await token();
    expect((await tool(t, 'user_info')).codVendedor).toBeGreaterThan(0);

    const barrios = await tool(t, 'listar_catalogo', { catalogo: 'barrios', buscar: 'centro' });
    expect(barrios.busqueda.totalCatalogo).toBeGreaterThan(0);
    expect(barrios.elementos[0]).toMatchObject({ codigo: expect.any(Number), nombre: expect.any(String) });

    const categorias = await tool(t, 'listar_catalogo', { catalogo: 'categorias' });
    expect(categorias.elementos.length, 'categorías (método getCategoriasMensEncProsp)').toBeGreaterThan(0);
    const resultados = await tool(t, 'listar_catalogo', { catalogo: 'resultados', codPadre: categorias.elementos[0].codigo });
    for (const e of resultados.elementos) expect(typeof e.exigeAgendamiento).toBe('boolean');

    const historial = await tool(t, 'historial_mensajes', { codCliente: 0, codProspecto: 0 });
    expect(Array.isArray(historial.resultado)).toBe(true);
    console.log(`barrios: ${barrios.elementos.length}, categorías: ${categorias.elementos.length}, resultados: ${resultados.elementos.length}`);
  });
});
