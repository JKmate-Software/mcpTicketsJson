import { randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

/** Claims de identidad: nombre tal cual lo devuelve PROC_GET_AUTH_CREDENCIAL (MAYÚSCULAS) → valor en texto. */
export type Claims = Record<string, string>;

/**
 * Las 7 claves de identidad van SIEMPRE en el token, vacías si el tipo de login no las resuelve
 * (mismo esquema fijo que el MCP de tickets v1: "sin valor" es claim vacía, nunca ausente).
 */
export const CLAVES_IDENTIDAD = [
  'COD_USUARIO',
  'COD_VENDEDOR',
  'COD_DESARROLLADOR',
  'COD_PROVEEDOR',
  'COD_CLIENTE',
  'COD_EMPRESA',
  'SECUENCIAL_EMPRESA',
] as const;

/** Claims técnicas del sobre: nunca se exponen como identidad. */
const CLAIMS_TECNICAS = new Set(['jti', 'iat', 'nbf', 'exp', 'iss', 'aud']);

export interface TokenValidado {
  jti: string;
  claims: Claims;
}

export interface ServicioJwt {
  emitir(claims: Claims): Promise<string>;
  /** Firma + vigencia (60 s de tolerancia). null si el token es inválido, vencido o no trae jti. */
  validar(token: string): Promise<TokenValidado | null>;
  /** Vigencia de un token nuevo, en segundos (para `expires_in`). */
  readonly vigenciaSegundos: number;
}

/**
 * JWT HS256 con el mismo formato que el MCP de tickets v1 (sin iss/aud, jti sin guiones), así un
 * token emitido por uno sirve en el otro cuando comparten MCP_JWT_SIGNING_KEY.
 */
export function crearServicioJwt(secreto: string, vigenciaDias: number): ServicioJwt {
  if (!secreto) throw new Error('MCP_JWT_SIGNING_KEY no está configurado: no se puede emitir ni validar tokens.');
  const clave = new TextEncoder().encode(secreto);
  const vigenciaSegundos = vigenciaDias * 86_400;

  return {
    vigenciaSegundos,

    async emitir(claims) {
      const ahora = Math.floor(Date.now() / 1000);
      // Mismo orden de claves que el JsonWebTokenHandler de la v1: exp, iat, nbf, identidad, jti.
      const jti = randomUUID().replaceAll('-', '');
      return new SignJWT({ exp: ahora + vigenciaSegundos, iat: ahora, nbf: ahora, ...claims, jti })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .sign(clave);
    },

    async validar(token) {
      let payload: Record<string, unknown>;
      try {
        ({ payload } = await jwtVerify(token, clave, { algorithms: ['HS256'], clockTolerance: 60 }));
      } catch {
        return null;
      }
      const jti = payload.jti;
      if (typeof jti !== 'string' || jti === '') return null;
      const claims: Claims = {};
      for (const [nombre, valor] of Object.entries(payload)) {
        if (CLAIMS_TECNICAS.has(nombre.toLowerCase())) continue;
        claims[nombre] = typeof valor === 'string' ? valor : JSON.stringify(valor);
      }
      return { jti, claims };
    },
  };
}

/** Lee una claim sin distinguir mayúsculas (la v1 las emite en MAYÚSCULAS; un token federado podría no hacerlo). */
export function claim(claims: Claims, nombre: string): string {
  const buscado = nombre.toLowerCase();
  for (const [clave, valor] of Object.entries(claims)) {
    if (clave.toLowerCase() === buscado) return valor;
  }
  return '';
}
