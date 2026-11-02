import { createHash } from 'node:crypto';
import type { ConsultaSql, Fila } from '../db/firebird.js';
import { CLAVES_IDENTIDAD, type Claims } from './jwt.js';

/** Tipo de login cuya lógica tiene un paso extra en el servidor (fila activa en MCP_OAUTH_CREDENCIALES). */
export const TIPO_ALIAS_CLAVE = 'alias/clave';

/** OK = -66: Firebird 3.0.1 no calcula MD5; el procedure pide que se reintente con la clave hasheada. */
const OK_REQUIERE_MD5 = -66;

export interface Credenciales {
  /** Valida un login del tipo dado. Devuelve las claims a firmar, o null si no corresponde dar acceso. */
  validar(tipoAuth: string, apiKey: string, apiSecret: string): Promise<Claims | null>;
  estaRevocado(jti: string): Promise<boolean>;
  /**
   * El usuario tiene alguna fila activa en MCP_OAUTH_CREDENCIALES (re-chequeo en cada request de un
   * token alias/clave). Igual que la v1: se busca por COD_USUARIO, no por el COD_CREDENCIAL_MCP del token.
   */
  credencialActiva(codUsuario: number): Promise<boolean>;
}

const texto = (valor: unknown) => (valor === null || valor === undefined ? '' : String(valor));

/**
 * Login delegado en PROC_GET_AUTH_CREDENCIAL, mismo protocolo que el MCP de tickets v1: el servidor
 * no conoce la lógica de cada tipo, salvo el reintento MD5 y el gate de alias/clave.
 */
export function crearCredenciales(base: Pick<ConsultaSql, 'consultar'>): Credenciales {
  async function llamarProcedure(tipoAuth: string, apiKey: string, apiSecret: string): Promise<Fila | undefined> {
    const filas = await base.consultar(
      'SELECT OK, ERROR_MSG, COD_USUARIO, COD_VENDEDOR, COD_DESARROLLADOR, COD_PROVEEDOR, COD_CLIENTE, COD_EMPRESA, SECUENCIAL_EMPRESA ' +
        'FROM PROC_GET_AUTH_CREDENCIAL(?, ?, ?)',
      [tipoAuth, apiKey, apiSecret],
    );
    return filas[0];
  }

  return {
    async validar(tipoAuth, apiKey, apiSecret) {
      let fila = await llamarProcedure(tipoAuth, apiKey, apiSecret);
      if (Number(fila?.OK) === OK_REQUIERE_MD5) {
        fila = await llamarProcedure(tipoAuth, apiKey, createHash('md5').update(apiSecret, 'utf8').digest('hex'));
      }
      if (!fila || Number(fila.OK) !== 1) return null;

      const claims: Claims = Object.fromEntries(CLAVES_IDENTIDAD.map((c) => [c, texto(fila[c])]));

      if (tipoAuth === TIPO_ALIAS_CLAVE) {
        if (claims.COD_USUARIO === '') return null;
        const credencial = await base.consultar(
          'SELECT COD_CREDENCIAL_MCP FROM MCP_OAUTH_CREDENCIALES WHERE COD_USUARIO = ? AND ACTIVO = 1',
          [Number(claims.COD_USUARIO)],
        );
        if (!credencial[0]) return null;
        claims.COD_CREDENCIAL_MCP = texto(credencial[0].COD_CREDENCIAL_MCP);
      }
      return claims;
    },

    async estaRevocado(jti) {
      const filas = await base.consultar('SELECT 1 AS REVOCADO FROM MCP_OAUTH_TOKENS_REVOCADOS WHERE JTI = ?', [jti]);
      return filas.length > 0;
    },

    async credencialActiva(codUsuario) {
      const filas = await base.consultar(
        'SELECT 1 AS ACTIVA FROM MCP_OAUTH_CREDENCIALES WHERE COD_USUARIO = ? AND ACTIVO = 1',
        [codUsuario],
      );
      return filas.length > 0;
    },
  };
}
