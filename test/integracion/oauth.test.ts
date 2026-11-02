import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearCredenciales } from '../../src/auth/credenciales.js';
import { crearServicioJwt } from '../../src/auth/jwt.js';
import { crearAppHttp, escuchar } from '../../src/http.js';
import { loggerEnMemoria, toolsDe } from '../apoyo.js';
import { accesoDesdeEntorno, hayBase } from './base.js';

/**
 * Login OAuth real contra la base de pruebas (SANTAROSA64_IA; nunca CREAR_JK3, que es producción):
 * PROC_GET_AUTH_CREDENCIAL, MCP_OAUTH_CREDENCIALES y MCP_OAUTH_TOKENS_REVOCADOS. No invoca tools de
 * tickets porque esa base no tiene los SP _AG.
 *
 * Variables (en .env, fuera de git): OAUTH_PRUEBA_APIKEY, OAUTH_PRUEBA_APISECRET y, opcional,
 * OAUTH_PRUEBA_TIPO (default alias/clave).
 */
const env = process.env;
const TIPO = env.OAUTH_PRUEBA_TIPO || 'alias/clave';
const APIKEY = env.OAUTH_PRUEBA_APIKEY ?? '';
const APISECRET = env.OAUTH_PRUEBA_APISECRET ?? '';
const SIN_CLAVE = APISECRET === '';
const hayCredencial = hayBase && APIKEY !== '';

describe.skipIf(!hayCredencial)('OAuth contra la base de pruebas', { timeout: 60_000 }, () => {
  let acceso: ReturnType<typeof accesoDesdeEntorno>;
  const registro = loggerEnMemoria();
  let servidor: Server;
  let base: string;

  beforeAll(async () => {
    acceso = accesoDesdeEntorno();
    const app = crearAppHttp({
      config: {
        MCP_URL_PUBLICA: undefined,
        MCP_AUTH_TIPO: TIPO,
        MCP_AUTH_TITULO_AUTORIZACION: 'Prueba de integración',
        MCP_AUTH_APIKEY_REQUERIDO: true,
        MCP_AUTH_APIKEY_TITULO: 'Usuario',
        MCP_AUTH_APISECRET_REQUERIDO: !SIN_CLAVE,
        MCP_AUTH_APISECRET_TITULO: 'Clave',
      },
      tools: await toolsDe('tickets', { acceso, zonaHoraria: 'America/Argentina/Buenos_Aires' }),
      logger: registro.logger,
      credenciales: crearCredenciales(acceso),
      jwt: crearServicioJwt('secreto-de-integracion-de-al-menos-32-bytes', 15),
    });
    servidor = await escuchar(app, 0);
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    servidor?.close();
    await acceso?.cerrar();
  });

  const pedirToken = (clave: string) =>
    fetch(`${base}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: APIKEY, client_secret: clave }).toString(),
    });

  const decodificar = (t: string) => JSON.parse(Buffer.from(t.split('.')[1]!, 'base64url').toString()) as Record<string, string>;

  it('client_credentials → token con identidad → renovar → /mcp acepta el Bearer', async () => {
    const r = await pedirToken(APISECRET);
    expect(r.status).toBe(200);
    const token = ((await r.json()) as { access_token: string }).access_token;
    const claims = decodificar(token);
    expect(claims.COD_USUARIO).toMatch(/^\d+$/);
    if (TIPO === 'alias/clave') expect(claims.COD_CREDENCIAL_MCP).toMatch(/^\d+$/);
    console.log(`Login ${TIPO} OK: COD_USUARIO=${claims.COD_USUARIO} COD_VENDEDOR=${claims.COD_VENDEDOR || '-'}`);

    const renovado = await fetch(`${base}/token/renovar`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
    expect(renovado.status).toBe(200);
    const nuevo = ((await renovado.json()) as { access_token: string }).access_token;
    expect(decodificar(nuevo).COD_USUARIO).toBe(claims.COD_USUARIO);

    const mcp = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { authorization: `Bearer ${nuevo}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(mcp.status).toBe(200);
    const tools = ((await mcp.json()) as { result: { tools: { name: string }[] } }).result.tools.map((t) => t.name);
    expect(tools).toContain('listar_tickets');
  });

  it.skipIf(SIN_CLAVE)('clave incorrecta → 401 invalid_client', async () => {
    const r = await pedirToken(`${APISECRET}-incorrecta`);
    expect(r.status).toBe(401);
    expect(registro.crudo.join('')).not.toContain(APISECRET);
  });
});
