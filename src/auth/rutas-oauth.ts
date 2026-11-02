import { createHash } from 'node:crypto';
import express, { type Request, type Response, type Router } from 'express';
import type { Logger } from 'pino';
import type { AlmacenCodigos } from './codigos.js';
import type { Credenciales } from './credenciales.js';
import type { Claims, ServicioJwt } from './jwt.js';
import { renderPaginaLogin, type ConfigPaginaLogin } from './pagina-login.js';

/** client_id público fijo: servidor interno, sin registro persistente de clientes (igual que la v1). */
export const CLIENT_ID_ESTATICO = 'mcp-tickets-client';

const MENSAJE_LOGIN_FALLIDO = 'Credenciales incorrectas, o no tenés acceso habilitado al MCP.';

export interface DependenciasOAuth {
  tipoAuth: string;
  paginaLogin: ConfigPaginaLogin;
  credenciales: Credenciales;
  jwt: ServicioJwt;
  codigos: AlmacenCodigos;
  logger: Logger;
  /** URL base pública (MCP_URL_PUBLICA o esquema + host del request). */
  urlBase(req: Request): string;
}

const texto = (valor: unknown) => (typeof valor === 'string' ? valor : '');

function errorOAuth(res: Response, status: number, error: string, descripcion?: string) {
  res.status(status).json(descripcion ? { error, error_description: descripcion } : { error });
}

/** PKCE S256: code_challenge == BASE64URL(SHA256(code_verifier)), sin padding. */
function verificarPkce(codeChallenge: string, codeVerifier: string): boolean {
  return createHash('sha256').update(codeVerifier, 'ascii').digest('base64url') === codeChallenge;
}

/** Valida los parámetros de GET /authorize. Devuelve el motivo del rechazo, o null si están bien. */
function problemaAutorizacion(query: Request['query']): string | null {
  if (query.response_type !== 'code') return "response_type debe ser 'code'.";
  if (!texto(query.redirect_uri)) return 'Falta redirect_uri.';
  if (!texto(query.code_challenge) || query.code_challenge_method !== 'S256') {
    return 'Falta code_challenge, o code_challenge_method distinto de S256 (obligatorio, OAuth 2.1).';
  }
  return null;
}

/**
 * Endpoints del inicio de sesión OAuth 2.1, con el mismo comportamiento observable que el MCP de
 * tickets v1: descubrimiento (RFC 9728 / RFC 8414), registro dinámico (RFC 7591), formulario de
 * login (Authorization Code + PKCE), emisión por authorization_code o client_credentials y
 * renovación. Nunca se loguean claves, tokens ni códigos.
 */
export function crearRutasOAuth(deps: DependenciasOAuth): Router {
  const rutas = express.Router();
  const formulario = express.urlencoded({ extended: false });

  async function emitirToken(res: Response, claims: Claims, via: string) {
    const accessToken = await deps.jwt.emitir(claims);
    deps.logger.info({ evento: 'token_emitido', via }, 'Token emitido');
    res.set('Cache-Control', 'no-store');
    res.json({ access_token: accessToken, token_type: 'Bearer', expires_in: deps.jwt.vigenciaSegundos });
  }

  function registrarLogin(via: string, apikey: string, resultado: boolean) {
    deps.logger.info({ evento: 'login', via, tipoAuth: deps.tipoAuth, apikey, resultado: resultado ? 'OK' : 'FALLO' }, 'Intento de login');
  }

  rutas.get('/.well-known/oauth-protected-resource', (req, res) => {
    const base = deps.urlBase(req);
    res.json({ resource: `${base}/mcp`, authorization_servers: [base], bearer_methods_supported: ['header'] });
  });

  rutas.get('/.well-known/oauth-authorization-server', (req, res) => {
    const base = deps.urlBase(req);
    res.json({
      issuer: base,
      authorization_endpoint: `${base}/authorize`,
      token_endpoint: `${base}/token`,
      registration_endpoint: `${base}/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'client_credentials'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
    });
  });

  rutas.post('/register', express.json(), (req, res) => {
    const cuerpo = (req.body ?? {}) as { redirect_uris?: unknown };
    res.status(201).json({
      client_id: CLIENT_ID_ESTATICO,
      redirect_uris: Array.isArray(cuerpo.redirect_uris) ? cuerpo.redirect_uris : [],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code'],
      response_types: ['code'],
    });
  });

  rutas.get('/authorize', (req, res) => {
    const problema = problemaAutorizacion(req.query);
    if (problema) return errorOAuth(res, 400, 'invalid_request', problema);
    res.type('html').send(
      renderPaginaLogin(deps.paginaLogin, {
        clientId: texto(req.query.client_id),
        redirectUri: texto(req.query.redirect_uri),
        state: texto(req.query.state),
        codeChallenge: texto(req.query.code_challenge),
      }),
    );
  });

  rutas.post('/authorize', formulario, async (req, res) => {
    const campos = (req.body ?? {}) as Record<string, unknown>;
    const datos = {
      clientId: texto(campos.client_id),
      redirectUri: texto(campos.redirect_uri),
      state: texto(campos.state),
      codeChallenge: texto(campos.code_challenge),
    };
    if (!datos.redirectUri || !datos.codeChallenge) {
      return errorOAuth(res, 400, 'invalid_request', 'Falta redirect_uri o code_challenge.');
    }
    const apikey = texto(campos.apikey);
    const claims = await deps.credenciales.validar(deps.tipoAuth, apikey, texto(campos.apisecret));
    registrarLogin('authorization_code', apikey, claims !== null);
    if (!claims) return res.type('html').send(renderPaginaLogin(deps.paginaLogin, datos, MENSAJE_LOGIN_FALLIDO));

    const codigo = deps.codigos.emitir({ claims, clientId: datos.clientId, redirectUri: datos.redirectUri, codeChallenge: datos.codeChallenge });
    const separador = datos.redirectUri.includes('?') ? '&' : '?';
    res.redirect(302, `${datos.redirectUri}${separador}code=${encodeURIComponent(codigo)}&state=${encodeURIComponent(datos.state)}`);
  });

  rutas.post('/token', formulario, async (req, res) => {
    if (!req.is('application/x-www-form-urlencoded')) {
      return errorOAuth(res, 400, 'invalid_request', 'Se espera application/x-www-form-urlencoded.');
    }
    const campos = (req.body ?? {}) as Record<string, unknown>;
    const grant = texto(campos.grant_type);

    if (grant === 'client_credentials') {
      const apikey = texto(campos.client_id);
      const apisecret = texto(campos.client_secret);
      if ((deps.paginaLogin.apiKeyRequerido && !apikey) || (deps.paginaLogin.apiSecretRequerido && !apisecret)) {
        return errorOAuth(res, 400, 'invalid_request', 'client_id y/o client_secret son obligatorios para el mecanismo de login configurado.');
      }
      const claims = await deps.credenciales.validar(deps.tipoAuth, apikey, apisecret);
      registrarLogin('client_credentials', apikey, claims !== null);
      if (!claims) return errorOAuth(res, 401, 'invalid_client');
      return emitirToken(res, claims, 'client_credentials');
    }

    if (grant === 'authorization_code') {
      const codigo = texto(campos.code);
      const codeVerifier = texto(campos.code_verifier);
      if (!codigo || !codeVerifier) return errorOAuth(res, 400, 'invalid_request', 'code y code_verifier son obligatorios.');
      const datos = deps.codigos.consumir(codigo);
      if (!datos) return errorOAuth(res, 400, 'invalid_grant', 'Código inválido, ya usado, o expirado.');
      if (datos.redirectUri !== texto(campos.redirect_uri)) {
        return errorOAuth(res, 400, 'invalid_grant', 'redirect_uri no coincide con el de /authorize.');
      }
      if (!verificarPkce(datos.codeChallenge, codeVerifier)) {
        return errorOAuth(res, 400, 'invalid_grant', 'code_verifier no corresponde al code_challenge original.');
      }
      return emitirToken(res, datos.claims, 'authorization_code');
    }

    errorOAuth(res, 400, 'unsupported_grant_type');
  });

  rutas.post('/token/renovar', async (req, res) => {
    const cabecera = req.get('authorization') ?? '';
    if (!/^bearer /i.test(cabecera)) {
      return errorOAuth(res, 400, 'invalid_request', 'Falta el header Authorization: Bearer <token>.');
    }
    const validado = await deps.jwt.validar(cabecera.slice('Bearer '.length).trim());
    if (!validado) {
      return errorOAuth(res, 401, 'invalid_token', 'Token inválido o expirado, solicitar uno nuevo con client_credentials.');
    }
    if (await deps.credenciales.estaRevocado(validado.jti)) return errorOAuth(res, 401, 'invalid_token', 'Token revocado.');
    return emitirToken(res, validado.claims, 'renovacion');
  });

  return rutas;
}
