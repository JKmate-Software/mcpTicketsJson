import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { CLAVES_IDENTIDAD, crearServicioJwt } from '../src/auth/jwt.js';
import { CacheCatalogos } from '../src/busqueda/catalogo.js';
import { cargarCatalogo, rutaCatalogo } from '../src/funciones/catalogo.js';
import { cargarConfig, rutaArchivoFunciones } from '../src/config.js';
import { crearAppHttp, escuchar } from '../src/http.js';
import { accesoSimulado, conectarCliente, loggerEnMemoria } from './apoyo.js';

const RAIZ = resolve(import.meta.dirname, '..');
const TSX = resolve(RAIZ, 'node_modules/tsx/dist/cli.mjs');
const ENTRADA = resolve(RAIZ, 'src/index.ts');

const deps = () => ({ acceso: accesoSimulado({}).acceso, zonaHoraria: 'America/Argentina/Buenos_Aires', cache: new CacheCatalogos() });
const CATALOGOS = {
  tickets: await cargarCatalogo(rutaCatalogo('tickets'), deps()),
  prospeccion: await cargarCatalogo(rutaCatalogo('prospeccion'), deps()),
};

describe('catálogos', () => {
  it('default tickets: exactamente las 4 tools de antes', async () => {
    const ruta = rutaArchivoFunciones(cargarConfig({ FIREBIRD_DATABASE: 'x', MCP_COD_USUARIO: '1' }));
    expect(ruta).toBe(rutaCatalogo('tickets'));
    const { cliente } = await conectarCliente((await cargarCatalogo(ruta, deps())).tools);
    expect((await cliente.listTools()).tools.map((t) => t.name)).toEqual([
      'obtener_contexto_ticket',
      'listar_tickets',
      'listar_tareas',
      'resumir_tickets',
    ]);
  });

  it.each([
    ['tickets', 'mcp-tickets-json'],
    ['prospeccion', 'mcp-prospeccion-json'],
  ] as const)('serverInfo.name de %s es %s', async (nombre, esperado) => {
    const { cliente } = await conectarCliente([], undefined, CATALOGOS[nombre].servidor.nombre);
    expect(cliente.getServerVersion()?.name).toBe(esperado);
  });

  it('claim requerida por catálogo', () => {
    expect(CATALOGOS.tickets.servidor.claimRequerida).toBe('COD_USUARIO');
    expect(CATALOGOS.prospeccion.servidor.claimRequerida).toBe('COD_VENDEDOR');
  });

  it('prospección por stdio sin vendedor: error en stderr que nombra MCP_COD_VENDEDOR, nada en stdout', () => {
    const { PATH, Path, SystemRoot, TEMP, TMP } = process.env;
    const env = Object.fromEntries(
      Object.entries({ PATH, Path, SystemRoot, TEMP, TMP, MCP_CATALOGO: 'prospeccion', FIREBIRD_DATABASE: 'x' }).filter(([, v]) => v !== undefined),
    ) as Record<string, string>;
    const r = spawnSync(process.execPath, [TSX, ENTRADA], { env, encoding: 'utf8', timeout: 30_000 });
    expect(r.status).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain('MCP_COD_VENDEDOR');
  });

  it('token sin vendedor en prospección → 403 que nombra COD_VENDEDOR', async () => {
    const jwt = crearServicioJwt('secreto-de-prueba-de-al-menos-32-bytes!!', 15);
    const app = crearAppHttp({
      config: {
        MCP_URL_PUBLICA: undefined,
        MCP_AUTH_TIPO: 'alias/clave',
        MCP_AUTH_TITULO_AUTORIZACION: 't',
        MCP_AUTH_APIKEY_REQUERIDO: true,
        MCP_AUTH_APIKEY_TITULO: 'u',
        MCP_AUTH_APISECRET_REQUERIDO: true,
        MCP_AUTH_APISECRET_TITULO: 'c',
      },
      tools: [],
      logger: loggerEnMemoria().logger,
      credenciales: { validar: async () => null, estaRevocado: async () => false, credencialActiva: async () => true },
      jwt,
      claimRequerida: CATALOGOS.prospeccion.servidor.claimRequerida,
      nombreServidor: CATALOGOS.prospeccion.servidor.nombre,
    });
    const servidor = await escuchar(app, 0);
    try {
      const token = await jwt.emitir({ ...Object.fromEntries(CLAVES_IDENTIDAD.map((c) => [c, ''])), COD_USUARIO: '15169' });
      const r = await fetch(`http://127.0.0.1:${(servidor.address() as AddressInfo).port}/mcp`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: '{}',
      });
      expect(r.status).toBe(403);
      expect(((await r.json()) as { error_description: string }).error_description).toContain('COD_VENDEDOR');
    } finally {
      servidor.close();
    }
  });
});
