import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Fila, ValorParametro } from '../db/firebird.js';
import { crearCredenciales } from './credenciales.js';

interface Llamada {
  sql: string;
  parametros: ValorParametro[];
}

/** Base simulada: responde según la tabla/procedure que nombra el SQL. */
function baseSimulada(respuestas: { auth?: (p: ValorParametro[]) => Fila | undefined; credencial?: Fila[]; revocado?: Fila[] }) {
  const llamadas: Llamada[] = [];
  const base = {
    async consultar(sql: string, parametros: ValorParametro[]) {
      llamadas.push({ sql, parametros });
      if (sql.includes('PROC_GET_AUTH_CREDENCIAL')) {
        const fila = respuestas.auth?.(parametros);
        return fila ? [fila] : [];
      }
      if (sql.includes('MCP_OAUTH_TOKENS_REVOCADOS')) return respuestas.revocado ?? [];
      if (sql.includes('MCP_OAUTH_CREDENCIALES')) return respuestas.credencial ?? [];
      throw new Error(`SQL no simulado: ${sql}`);
    },
  };
  return { base, llamadas };
}

const okUsuario = (codUsuario: number, extra: Fila = {}): Fila => ({
  OK: 1,
  ERROR_MSG: null,
  COD_USUARIO: codUsuario,
  COD_VENDEDOR: null,
  COD_DESARROLLADOR: null,
  COD_PROVEEDOR: null,
  COD_CLIENTE: null,
  COD_EMPRESA: null,
  SECUENCIAL_EMPRESA: null,
  ...extra,
});

describe('credenciales: PROC_GET_AUTH_CREDENCIAL', () => {
  it('alias/clave válido con credencial activa → 7 claims + COD_CREDENCIAL_MCP', async () => {
    const { base, llamadas } = baseSimulada({ auth: () => okUsuario(15169, { COD_DESARROLLADOR: 100936 }), credencial: [{ COD_CREDENCIAL_MCP: 7 }] });
    const claims = await crearCredenciales(base).validar('alias/clave', 'jgutierrez', 'clave');
    expect(claims).toEqual({
      COD_USUARIO: '15169',
      COD_VENDEDOR: '',
      COD_DESARROLLADOR: '100936',
      COD_PROVEEDOR: '',
      COD_CLIENTE: '',
      COD_EMPRESA: '',
      SECUENCIAL_EMPRESA: '',
      COD_CREDENCIAL_MCP: '7',
    });
    expect(llamadas[0]?.parametros).toEqual(['alias/clave', 'jgutierrez', 'clave']);
  });

  it('alias/clave válido pero sin fila activa → sin acceso', async () => {
    const { base } = baseSimulada({ auth: () => okUsuario(15169), credencial: [] });
    expect(await crearCredenciales(base).validar('alias/clave', 'u', 'c')).toBeNull();
  });

  it('OK distinto de 1 → sin acceso', async () => {
    const { base } = baseSimulada({ auth: () => ({ OK: 0, ERROR_MSG: 'Clave incorrecta' }) });
    expect(await crearCredenciales(base).validar('alias/clave', 'u', 'c')).toBeNull();
  });

  it('el procedure no devuelve filas → sin acceso', async () => {
    const { base } = baseSimulada({ auth: () => undefined });
    expect(await crearCredenciales(base).validar('alias/clave', 'u', 'c')).toBeNull();
  });

  it('OK = -66 reintenta una vez con la clave en MD5 hex minúscula', async () => {
    const md5 = createHash('md5').update('clave', 'utf8').digest('hex');
    const { base, llamadas } = baseSimulada({
      auth: (p) => (p[2] === md5 ? okUsuario(15169) : { OK: -66 }),
      credencial: [{ COD_CREDENCIAL_MCP: 7 }],
    });
    expect(await crearCredenciales(base).validar('alias/clave', 'u', 'clave')).not.toBeNull();
    const llamadasAuth = llamadas.filter((l) => l.sql.includes('PROC_GET_AUTH_CREDENCIAL'));
    expect(llamadasAuth.map((l) => l.parametros[2])).toEqual(['clave', md5]);
  });

  it('otro tipo de login no consulta MCP_OAUTH_CREDENCIALES y usa lo que resuelve el procedure', async () => {
    const { base, llamadas } = baseSimulada({ auth: () => okUsuario(874, { COD_VENDEDOR: 12 }) });
    const claims = await crearCredenciales(base).validar('tlfvendedor', '3515551234', '');
    expect(claims).toMatchObject({ COD_USUARIO: '874', COD_VENDEDOR: '12' });
    expect(claims).not.toHaveProperty('COD_CREDENCIAL_MCP');
    expect(llamadas.some((l) => l.sql.includes('MCP_OAUTH_CREDENCIALES'))).toBe(false);
    expect(llamadas[0]?.parametros).toEqual(['tlfvendedor', '3515551234', '']);
  });
});

describe('credenciales: revocación y re-chequeo', () => {
  it('estaRevocado según MCP_OAUTH_TOKENS_REVOCADOS', async () => {
    expect(await crearCredenciales(baseSimulada({ revocado: [{ REVOCADO: 1 }] }).base).estaRevocado('abc')).toBe(true);
    expect(await crearCredenciales(baseSimulada({ revocado: [] }).base).estaRevocado('abc')).toBe(false);
  });

  it('credencialActiva busca una fila activa del COD_USUARIO', async () => {
    const { base, llamadas } = baseSimulada({ credencial: [{ ACTIVA: 1 }] });
    expect(await crearCredenciales(base).credencialActiva(15169)).toBe(true);
    expect(llamadas[0]!.sql).toContain('WHERE COD_USUARIO = ? AND ACTIVO = 1');
    expect(llamadas[0]!.parametros).toEqual([15169]);
    expect(await crearCredenciales(baseSimulada({ credencial: [] }).base).credencialActiva(7)).toBe(false);
  });
});
