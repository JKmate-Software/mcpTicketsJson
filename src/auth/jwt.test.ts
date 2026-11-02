import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CLAVES_IDENTIDAD, claim, crearServicioJwt, type Claims } from './jwt.js';

const SECRETO = 'secreto-de-prueba-de-al-menos-32-bytes!!';

function identidad(parcial: Partial<Record<(typeof CLAVES_IDENTIDAD)[number], string>>): Claims {
  return Object.fromEntries(CLAVES_IDENTIDAD.map((c) => [c, parcial[c] ?? '']));
}

const b64url = (valor: string | Buffer) => Buffer.from(valor).toString('base64url');

/**
 * Arma a mano un token con la forma exacta que emite el MCP de tickets v1 (.NET
 * JsonWebTokenHandler): header {alg, typ}, claims de negocio en texto, jti sin guiones e
 * iat/nbf/exp numéricos. No usa jose, así el test verifica compatibilidad real de formato.
 */
function tokenEstiloV1(payload: Record<string, unknown>, secreto = SECRETO): string {
  const cabecera = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const cuerpo = b64url(JSON.stringify(payload));
  const firma = createHmac('sha256', secreto).update(`${cabecera}.${cuerpo}`).digest('base64url');
  return `${cabecera}.${cuerpo}.${firma}`;
}

const ahora = () => Math.floor(Date.now() / 1000);

describe('servicio JWT', () => {
  const jwt = crearServicioJwt(SECRETO, 15);

  it('ida y vuelta conserva las claims y agrega un jti sin guiones', async () => {
    const token = await jwt.emitir(identidad({ COD_USUARIO: '15169', COD_DESARROLLADOR: '100936' }));
    const validado = await jwt.validar(token);
    expect(validado?.jti).toMatch(/^[0-9a-f]{32}$/);
    expect(validado?.claims).toEqual(identidad({ COD_USUARIO: '15169', COD_DESARROLLADOR: '100936' }));
  });

  it('claims vacías presentes, nunca ausentes', async () => {
    const validado = await jwt.validar(await jwt.emitir(identidad({ COD_USUARIO: '15169' })));
    expect(validado?.claims).toHaveProperty('COD_VENDEDOR', '');
  });

  it('exp según la vigencia configurada', async () => {
    const token = await jwt.emitir(identidad({ COD_USUARIO: '1' }));
    const payload = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString()) as { iat: number; exp: number; nbf: number };
    expect(payload.exp - payload.iat).toBe(15 * 86_400);
    expect(payload.nbf).toBe(payload.iat);
    expect(jwt.vigenciaSegundos).toBe(15 * 86_400);
  });

  it('header y orden del payload iguales a los del JsonWebTokenHandler de la v1', async () => {
    const token = await jwt.emitir({ ...identidad({ COD_USUARIO: '1' }), COD_CREDENCIAL_MCP: '7' });
    const [header, payload] = token.split('.').slice(0, 2).map((p) => JSON.parse(Buffer.from(p, 'base64url').toString()) as object);
    expect(header).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(Object.keys(payload!)).toEqual(['exp', 'iat', 'nbf', ...CLAVES_IDENTIDAD, 'COD_CREDENCIAL_MCP', 'jti']);
  });

  it('rechaza firma de otro secreto, token vencido, sin jti y basura', async () => {
    const otro = crearServicioJwt('otro-secreto-de-al-menos-32-bytes-xxxx', 15);
    expect(await jwt.validar(await otro.emitir(identidad({ COD_USUARIO: '1' })))).toBeNull();
    expect(await jwt.validar(tokenEstiloV1({ COD_USUARIO: '1', jti: 'a', iat: ahora() - 1000, exp: ahora() - 120 }))).toBeNull();
    expect(await jwt.validar(tokenEstiloV1({ COD_USUARIO: '1', iat: ahora(), exp: ahora() + 600 }))).toBeNull();
    expect(await jwt.validar('no-es-un-jwt')).toBeNull();
  });

  it('tolera 60 s de desfase de reloj en exp', async () => {
    const validado = await jwt.validar(tokenEstiloV1({ COD_USUARIO: '1', jti: 'a', iat: ahora() - 1000, exp: ahora() - 30 }));
    expect(validado).not.toBeNull();
  });

  it('acepta un token con el formato de la v1 y filtra las claims técnicas', async () => {
    const t = ahora();
    const token = tokenEstiloV1({
      ...identidad({ COD_USUARIO: '874', COD_VENDEDOR: '12' }),
      COD_CREDENCIAL_MCP: '7',
      jti: '0123456789abcdef0123456789abcdef',
      iat: t,
      nbf: t,
      exp: t + 3600,
    });
    const validado = await jwt.validar(token);
    expect(validado?.jti).toBe('0123456789abcdef0123456789abcdef');
    expect(validado?.claims).toEqual({ ...identidad({ COD_USUARIO: '874', COD_VENDEDOR: '12' }), COD_CREDENCIAL_MCP: '7' });
  });

  it('sin secreto no arranca', () => {
    expect(() => crearServicioJwt('', 15)).toThrow(/MCP_JWT_SIGNING_KEY/);
  });

  it('claim() no distingue mayúsculas', () => {
    expect(claim({ cod_usuario: '5' }, 'COD_USUARIO')).toBe('5');
    expect(claim({}, 'COD_USUARIO')).toBe('');
  });
});
