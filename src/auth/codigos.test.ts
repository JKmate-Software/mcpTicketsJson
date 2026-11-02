import { describe, expect, it } from 'vitest';
import { crearAlmacenCodigos } from './codigos.js';

const DATOS = { claims: { COD_USUARIO: '1' }, clientId: 'c', redirectUri: 'http://localhost/cb', codeChallenge: 'x' };

describe('códigos de autorización', () => {
  it('un código vale una sola vez', () => {
    const almacen = crearAlmacenCodigos();
    const codigo = almacen.emitir(DATOS);
    expect(codigo).toMatch(/^[0-9a-f]{48}$/);
    expect(almacen.consumir(codigo)).toMatchObject(DATOS);
    expect(almacen.consumir(codigo)).toBeNull();
  });

  it('vence a los 5 minutos', () => {
    let t = 0;
    const almacen = crearAlmacenCodigos(() => t);
    const codigo = almacen.emitir(DATOS);
    t = 5 * 60_000 - 1;
    const otro = almacen.emitir(DATOS);
    expect(almacen.consumir(codigo)).not.toBeNull();
    t = 10 * 60_000;
    expect(almacen.consumir(otro)).toBeNull();
  });

  it('un código desconocido no existe', () => {
    expect(crearAlmacenCodigos().consumir('nada')).toBeNull();
  });
});
