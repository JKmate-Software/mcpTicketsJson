import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Logger } from 'pino';
import type { Credenciales } from './credenciales.js';
import { claim, type Claims, type ServicioJwt } from './jwt.js';

export interface DependenciasBearer {
  jwt: ServicioJwt;
  credenciales: Pick<Credenciales, 'estaRevocado' | 'credencialActiva'>;
  /** Claim de identidad que necesitan las tools del servidor (en tickets, COD_USUARIO). */
  claimRequerida: string;
  logger: Logger;
  urlBase(req: Request): string;
}

/** Claims del token validado, para que la ruta /mcp arme la sesión. */
export function claimsDe(res: Response): Claims {
  return res.locals.claims as Claims;
}

/**
 * Protege /mcp: JWT con firma válida y vigente, jti fuera de MCP_OAUTH_TOKENS_REVOCADOS y, si el
 * login fue alias/clave, credencial todavía activa. El 401 lleva WWW-Authenticate con
 * resource_metadata, así un cliente MCP descubre solo dónde iniciar sesión (RFC 9728).
 */
export function crearMiddlewareBearer(deps: DependenciasBearer): RequestHandler {
  function noAutorizado(req: Request, res: Response, motivo: string) {
    deps.logger.info({ evento: 'bearer_rechazado', motivo }, 'Request a /mcp sin autorización');
    res.set('WWW-Authenticate', `Bearer resource_metadata="${deps.urlBase(req)}/.well-known/oauth-protected-resource"`);
    res.status(401).json({ error: 'invalid_token', error_description: motivo });
  }

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const cabecera = req.get('authorization') ?? '';
      if (!/^bearer /i.test(cabecera)) return noAutorizado(req, res, 'Falta el header Authorization: Bearer <token>.');

      const validado = await deps.jwt.validar(cabecera.slice('Bearer '.length).trim());
      if (!validado) return noAutorizado(req, res, 'Token inválido o vencido.');
      if (await deps.credenciales.estaRevocado(validado.jti)) return noAutorizado(req, res, 'Token revocado.');

      // Como la v1: la claim COD_CREDENCIAL_MCP solo marca que el login fue alias/clave; lo que se
      // re-chequea es que el COD_USUARIO siga teniendo una credencial activa.
      if (claim(validado.claims, 'COD_CREDENCIAL_MCP') !== '') {
        const codUsuario = claim(validado.claims, 'COD_USUARIO');
        if (codUsuario === '' || !(await deps.credenciales.credencialActiva(Number(codUsuario)))) {
          return noAutorizado(req, res, 'La credencial de acceso al MCP ya no está activa.');
        }
      }

      if (claim(validado.claims, deps.claimRequerida) === '') {
        deps.logger.info({ evento: 'bearer_rechazado', motivo: `sin ${deps.claimRequerida}` }, 'Token sin la identidad requerida');
        return res.status(403).json({
          error: 'insufficient_scope',
          error_description: `El inicio de sesión configurado no resuelve ${deps.claimRequerida}, que este MCP necesita para identificar a quien lo usa.`,
        });
      }

      res.locals.claims = validado.claims;
      next();
    } catch (error) {
      next(error);
    }
  };
}
