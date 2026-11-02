import { ErrorTool } from '../errores.js';
import { CLAVES_IDENTIDAD } from './jwt.js';

/** Claves de identidad que se cargan en el contexto de la base (RDB$SET_CONTEXT 'USER_SESSION'). */
export const CLAVES_CONTEXTO = [...CLAVES_IDENTIDAD, 'COD_CREDENCIAL_MCP'] as const;
export type ClaveContexto = (typeof CLAVES_CONTEXTO)[number];

/**
 * Identidad de quien usa el servidor, nunca un parámetro de tool. En stdio sale de la configuración
 * del proceso (MCP_COD_*); en http, de las claims del token de cada request.
 */
export interface Sesion {
  /** COD_USUARIO de JKMate; null solo si el catálogo no lo exige (prospección por stdio sin usuario). */
  codUsuario: number | null;
  /** USUARIOS.COD_DESARROLLADOR del usuario de la sesión; null si no es desarrollador. */
  codDesarrollador: number | null;
  /** COD_VENDEDOR del vendedor de la sesión; null si no es vendedor. */
  codVendedor: number | null;
  transporte: 'stdio' | 'http';
  /**
   * Todas las claves de identidad como texto ('' = sin valor), para los campos de sesión y el
   * contexto de la base. Si falta, se deriva de los tres códigos de arriba (ver `claimsDeSesion`).
   */
  claims?: Partial<Record<ClaveContexto, string>>;
}

const texto = (valor: number | null) => (valor === null ? '' : String(valor));

/** Las claves de identidad de la sesión, completas; los tres códigos explícitos tienen prioridad. */
export function claimsDeSesion(sesion: Sesion): Record<ClaveContexto, string> {
  const claims = Object.fromEntries(CLAVES_CONTEXTO.map((c) => [c, sesion.claims?.[c] ?? ''])) as Record<ClaveContexto, string>;
  claims.COD_USUARIO = texto(sesion.codUsuario);
  claims.COD_DESARROLLADOR = texto(sesion.codDesarrollador);
  claims.COD_VENDEDOR = texto(sesion.codVendedor);
  return claims;
}

/**
 * COD_USUARIO para las tools que lo necesitan. El catálogo de tickets lo exige al arrancar (stdio) y
 * en cada token (http), así que no debería faltar nunca: si falta, es un error interno.
 */
export function usuarioRequerido(sesion: Sesion): number {
  if (sesion.codUsuario === null) throw new ErrorTool('ERROR_INTERNO', 'La sesión no tiene un usuario de JKMate asociado.');
  return sesion.codUsuario;
}
