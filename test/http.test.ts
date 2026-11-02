import { createHash, randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Credenciales } from '../src/auth/credenciales.js';
import { CLAVES_IDENTIDAD, crearServicioJwt, type Claims } from '../src/auth/jwt.js';
import { crearAppHttp, escuchar } from '../src/http.js';
import { accesoSimulado, loggerEnMemoria, toolDe } from './apoyo.js';
import { listarTicketsSimulado, TICKETS } from './datos/tickets-simulados.js';

const SECRETO = 'secreto-de-prueba-de-al-menos-32-bytes!!';
const CLAVE_BUENA = 'clave-super-secreta-123';
const jwt = crearServicioJwt(SECRETO, 15);

const identidad = (parcial: Record<string, string>): Claims => ({
  ...Object.fromEntries(CLAVES_IDENTIDAD.map((c) => [c, ''])),
  ...parcial,
});

/** Usuarios de prueba: apikey → claims. Solo CLAVE_BUENA es válida. */
const USUARIOS: Record<string, Claims> = {
  jgutierrez: identidad({ COD_USUARIO: '15169', COD_DESARROLLADOR: '100936' }),
  otro: identidad({ COD_USUARIO: '20001' }),
  vendedor: identidad({ COD_VENDEDOR: '12' }),
};

const revocados = new Set<string>();
const credencialesInactivas = new Set<number>();
const credenciales: Credenciales = {
  async validar(_tipo, apikey, apisecret) {
    return apisecret === CLAVE_BUENA ? (USUARIOS[apikey] ?? null) : null;
  },
  async estaRevocado(jti) {
    return revocados.has(jti);
  },
  async credencialActiva(cod) {
    return !credencialesInactivas.has(cod);
  },
};

const CONFIG = {
  MCP_URL_PUBLICA: undefined as string | undefined,
  MCP_AUTH_TIPO: 'alias/clave',
  MCP_AUTH_TITULO_AUTORIZACION: 'Autorizar acceso al MCP',
  MCP_AUTH_APIKEY_REQUERIDO: true,
  MCP_AUTH_APIKEY_TITULO: 'Usuario',
  MCP_AUTH_APISECRET_REQUERIDO: true,
  MCP_AUTH_APISECRET_TITULO: 'Clave',
};

const { acceso, llamadas } = accesoSimulado({ PROC_LIST_TICKETS_AG: listarTicketsSimulado(TICKETS) });
const registro = loggerEnMemoria();
let servidor: Server;
let base: string;

async function levantar(config = CONFIG): Promise<{ servidor: Server; base: string }> {
  const app = crearAppHttp({
    config,
    tools: [await toolDe('tickets', 'listar_tickets', { acceso, zonaHoraria: 'America/Argentina/Buenos_Aires' })],
    logger: registro.logger,
    credenciales,
    jwt,
  });
  const s = await escuchar(app, 0);
  return { servidor: s, base: `http://127.0.0.1:${(s.address() as AddressInfo).port}` };
}

beforeAll(async () => {
  ({ servidor, base } = await levantar());
});
afterAll(() => servidor.close());

const formulario = (campos: Record<string, string>) => ({
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(campos).toString(),
});

async function tokenPorCredenciales(apikey: string, clave = CLAVE_BUENA) {
  return fetch(`${base}/token`, formulario({ grant_type: 'client_credentials', client_id: apikey, client_secret: clave }));
}

async function token(apikey: string): Promise<string> {
  const r = await tokenPorCredenciales(apikey);
  return ((await r.json()) as { access_token: string }).access_token;
}

const decodificar = (t: string) => JSON.parse(Buffer.from(t.split('.')[1]!, 'base64url').toString()) as Record<string, unknown>;

function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

const REDIRECT = 'http://localhost:5555/callback';

function urlAutorizar(challenge: string, extra: Record<string, string> = {}) {
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: 'mcp-tickets-client',
    redirect_uri: REDIRECT,
    state: 'st-1',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    ...extra,
  });
  return `${base}/authorize?${q}`;
}

/** Login por el formulario; devuelve el code de la redirección. */
async function loginFormulario(challenge: string, apikey = 'jgutierrez', clave = CLAVE_BUENA) {
  const r = await fetch(
    `${base}/authorize`,
    {
      ...formulario({ client_id: 'mcp-tickets-client', redirect_uri: REDIRECT, state: 'st-1', code_challenge: challenge, apikey, apisecret: clave }),
      redirect: 'manual',
    },
  );
  return r;
}

describe('descubrimiento y registro', () => {
  it('metadata del authorization server', async () => {
    const m = (await (await fetch(`${base}/.well-known/oauth-authorization-server`)).json()) as Record<string, unknown>;
    expect(m.authorization_endpoint).toBe(`${base}/authorize`);
    expect(m.token_endpoint).toBe(`${base}/token`);
    expect(m.registration_endpoint).toBe(`${base}/register`);
    expect(m.code_challenge_methods_supported).toEqual(['S256']);
    expect(m.grant_types_supported).toEqual(['authorization_code', 'client_credentials']);
  });

  it('metadata del recurso protegido', async () => {
    const m = (await (await fetch(`${base}/.well-known/oauth-protected-resource`)).json()) as Record<string, unknown>;
    expect(m).toEqual({ resource: `${base}/mcp`, authorization_servers: [base], bearer_methods_supported: ['header'] });
  });

  it('registro de Claude Code', async () => {
    const r = await fetch(`${base}/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ redirect_uris: [REDIRECT] }),
    });
    expect(r.status).toBe(201);
    expect(await r.json()).toMatchObject({ client_id: 'mcp-tickets-client', redirect_uris: [REDIRECT], token_endpoint_auth_method: 'none' });
  });

  it('URL pública detrás de un proxy', async () => {
    const proxy = await levantar({ ...CONFIG, MCP_URL_PUBLICA: 'https://mcp.jkmate.com.ar/tickets-v2' });
    try {
      const m = (await (await fetch(`${proxy.base}/.well-known/oauth-authorization-server`)).json()) as Record<string, unknown>;
      expect(m.token_endpoint).toBe('https://mcp.jkmate.com.ar/tickets-v2/token');
      const r = await fetch(`${proxy.base}/mcp`, { method: 'POST' });
      expect(r.headers.get('www-authenticate')).toContain('https://mcp.jkmate.com.ar/tickets-v2/.well-known/oauth-protected-resource');
    } finally {
      proxy.servidor.close();
    }
  });
});

describe('página de login y authorization code', () => {
  it('GET /authorize muestra el formulario configurado', async () => {
    const r = await fetch(urlAutorizar(pkce().challenge));
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain('<h2>Autorizar acceso al MCP</h2>');
    expect(html).toContain('name="apikey"');
    expect(html).toContain('type="password" name="apisecret"');
  });

  it('PKCE plain rechazado', async () => {
    const r = await fetch(urlAutorizar('x', { code_challenge_method: 'plain' }));
    expect(r.status).toBe(400);
    expect(((await r.json()) as { error: string }).error).toBe('invalid_request');
  });

  it('response_type distinto de code rechazado', async () => {
    const r = await fetch(urlAutorizar('x', { response_type: 'token' }));
    expect(r.status).toBe(400);
  });

  it('login fallido vuelve a mostrar el formulario con el mensaje', async () => {
    const r = await loginFormulario(pkce().challenge, 'jgutierrez', 'mala');
    expect(r.status).toBe(200);
    expect(await r.text()).toContain('Credenciales incorrectas, o no tenés acceso habilitado al MCP.');
  });

  it('login exitoso redirige con code y state, y el code se canjea una sola vez', async () => {
    const { verifier, challenge } = pkce();
    const r = await loginFormulario(challenge);
    expect(r.status).toBe(302);
    const destino = new URL(r.headers.get('location')!);
    expect(`${destino.origin}${destino.pathname}`).toBe(REDIRECT);
    expect(destino.searchParams.get('state')).toBe('st-1');
    const code = destino.searchParams.get('code')!;

    const canje = { grant_type: 'authorization_code', code, redirect_uri: REDIRECT, code_verifier: verifier };
    const t = await fetch(`${base}/token`, formulario(canje));
    expect(t.status).toBe(200);
    const cuerpo = (await t.json()) as { access_token: string; token_type: string; expires_in: number };
    expect(cuerpo.token_type).toBe('Bearer');
    expect(cuerpo.expires_in).toBe(15 * 86_400);
    expect(decodificar(cuerpo.access_token)).toMatchObject({ COD_USUARIO: '15169', COD_VENDEDOR: '' });

    const otraVez = await fetch(`${base}/token`, formulario(canje));
    expect(otraVez.status).toBe(400);
    expect(((await otraVez.json()) as { error: string }).error).toBe('invalid_grant');
  });

  it('code_verifier incorrecto o redirect_uri distinto → invalid_grant', async () => {
    const { challenge } = pkce();
    const code = new URL((await loginFormulario(challenge)).headers.get('location')!).searchParams.get('code')!;
    const r = await fetch(`${base}/token`, formulario({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, code_verifier: 'otro' }));
    expect(((await r.json()) as { error: string }).error).toBe('invalid_grant');

    const p2 = pkce();
    const code2 = new URL((await loginFormulario(p2.challenge)).headers.get('location')!).searchParams.get('code')!;
    const r2 = await fetch(`${base}/token`, formulario({ grant_type: 'authorization_code', code: code2, redirect_uri: 'http://otro/cb', code_verifier: p2.verifier }));
    expect(((await r2.json()) as { error: string }).error).toBe('invalid_grant');
  });
});

describe('/token con client_credentials', () => {
  it('integración sin navegador', async () => {
    const r = await tokenPorCredenciales('jgutierrez');
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    const claims = decodificar(((await r.json()) as { access_token: string }).access_token);
    expect(claims).toMatchObject({ COD_USUARIO: '15169', COD_DESARROLLADOR: '100936' });
    expect(claims.jti).toMatch(/^[0-9a-f]{32}$/);
  });

  it('credenciales inválidas → 401 invalid_client', async () => {
    const r = await tokenPorCredenciales('jgutierrez', 'mala');
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: 'invalid_client' });
  });

  it('falta la clave requerida → 400 invalid_request', async () => {
    const r = await fetch(`${base}/token`, formulario({ grant_type: 'client_credentials', client_id: 'jgutierrez' }));
    expect(r.status).toBe(400);
    expect(((await r.json()) as { error: string }).error).toBe('invalid_request');
  });

  it('grant desconocido → unsupported_grant_type', async () => {
    const r = await fetch(`${base}/token`, formulario({ grant_type: 'password' }));
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'unsupported_grant_type' });
  });

  it('body que no es formulario → invalid_request', async () => {
    const r = await fetch(`${base}/token`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect(r.status).toBe(400);
    expect(((await r.json()) as { error: string }).error).toBe('invalid_request');
  });
});

describe('/token/renovar', () => {
  const renovar = (t?: string) => fetch(`${base}/token/renovar`, { method: 'POST', headers: t ? { authorization: `Bearer ${t}` } : {} });

  it('renovación exitosa: token distinto, mismas claims', async () => {
    const original = await token('jgutierrez');
    const r = await renovar(original);
    expect(r.status).toBe(200);
    const nuevo = ((await r.json()) as { access_token: string }).access_token;
    expect(nuevo).not.toBe(original);
    const [a, b] = [decodificar(original), decodificar(nuevo)];
    expect(b.jti).not.toBe(a.jti);
    for (const c of CLAVES_IDENTIDAD) expect(b[c]).toBe(a[c]);
  });

  it('sin header → 400; token inválido o revocado → 401 invalid_token', async () => {
    expect((await renovar()).status).toBe(400);
    const invalido = await renovar('basura');
    expect(invalido.status).toBe(401);
    expect(((await invalido.json()) as { error: string }).error).toBe('invalid_token');

    const t = await token('jgutierrez');
    revocados.add(decodificar(t).jti as string);
    expect((await renovar(t)).status).toBe(401);
  });
});

describe('/mcp protegido con Bearer', () => {
  const llamarMcp = (headers: Record<string, string> = {}) =>
    fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });

  it('sin token → 401 con resource_metadata', async () => {
    const r = await llamarMcp();
    expect(r.status).toBe(401);
    expect(r.headers.get('www-authenticate')).toBe(`Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"`);
  });

  it('token revocado → 401', async () => {
    const t = await token('jgutierrez');
    revocados.add(decodificar(t).jti as string);
    expect((await llamarMcp({ authorization: `Bearer ${t}` })).status).toBe(401);
  });

  it('el usuario se queda sin credencial activa después del login → 401 (se busca por COD_USUARIO, como la v1)', async () => {
    const t = await jwt.emitir({ ...USUARIOS.otro!, COD_CREDENCIAL_MCP: '77' });
    expect((await llamarMcp({ authorization: `Bearer ${t}` })).status).toBe(200);
    credencialesInactivas.add(20001);
    try {
      expect((await llamarMcp({ authorization: `Bearer ${t}` })).status).toBe(401);
    } finally {
      credencialesInactivas.delete(20001);
    }
  });

  it('COD_CREDENCIAL_MCP sin COD_USUARIO → 401', async () => {
    const t = await jwt.emitir({ ...USUARIOS.vendedor!, COD_CREDENCIAL_MCP: '77' });
    expect((await llamarMcp({ authorization: `Bearer ${t}` })).status).toBe(401);
  });

  it('token de vendedor federado sin COD_USUARIO → 403 que nombra la claim', async () => {
    const r = await llamarMcp({ authorization: `Bearer ${await token('vendedor')}` });
    expect(r.status).toBe(403);
    const cuerpo = (await r.json()) as { error: string; error_description: string };
    expect(cuerpo.error).toBe('insufficient_scope');
    expect(cuerpo.error_description).toContain('COD_USUARIO');
  });

  it('token emitido por la v1 (mismo secreto) aceptado', async () => {
    const t = await jwt.emitir(USUARIOS.otro!);
    expect((await llamarMcp({ authorization: `Bearer ${t}` })).status).toBe(200);
  });

  it('GET /mcp → 405 (servidor sin estado)', async () => {
    const r = await fetch(`${base}/mcp`, { headers: { authorization: `Bearer ${await token('jgutierrez')}` } });
    expect(r.status).toBe(405);
  });

  it('identidad por token: dos usuarios en la misma instancia', async () => {
    async function listarComo(apikey: string) {
      const cliente = new Client({ name: 'test-http', version: '0.0.0' });
      const transporte = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
        requestInit: { headers: { authorization: `Bearer ${await token(apikey)}` } },
      });
      await cliente.connect(transporte);
      const tools = await cliente.listTools();
      expect(tools.tools.map((t) => t.name)).toEqual(['listar_tickets']);
      const antes = llamadas.length;
      await cliente.callTool({ name: 'listar_tickets', arguments: { asignadoA: 'yo' } });
      await cliente.close();
      return llamadas.slice(antes).flatMap((l) => l.parametros);
    }
    expect(await listarComo('jgutierrez')).toContain(15169);
    const delOtro = await listarComo('otro');
    expect(delOtro).toContain(20001);
    expect(delOtro).not.toContain(15169);
  });
});

describe('secretos fuera de los logs', () => {
  it('ni la clave, ni tokens, ni códigos aparecen en el log; los intentos de login sí', async () => {
    await tokenPorCredenciales('jgutierrez', 'clave-mala-que-no-debe-loguearse');
    const t = await token('jgutierrez');
    const renovado = ((await (await fetch(`${base}/token/renovar`, { method: 'POST', headers: { authorization: `Bearer ${t}` } })).json()) as {
      access_token: string;
    }).access_token;
    const { challenge } = pkce();
    const code = new URL((await loginFormulario(challenge)).headers.get('location')!).searchParams.get('code')!;

    const log = registro.crudo.join('');
    for (const secreto of ['clave-mala-que-no-debe-loguearse', CLAVE_BUENA, t, renovado, code]) expect(log).not.toContain(secreto);

    const logins = registro.eventos.filter((e) => e.evento === 'login');
    expect(logins).toContainEqual(expect.objectContaining({ apikey: 'jgutierrez', tipoAuth: 'alias/clave', resultado: 'FALLO' }));
    expect(logins).toContainEqual(expect.objectContaining({ apikey: 'jgutierrez', resultado: 'OK' }));
  });
});
