import { describe, expect, it } from 'vitest';
import { baseOAuthSeparada, cargarConfig, configBaseOAuth, sesionStdio } from './config.js';

const BASE = { FIREBIRD_DATABASE: 'E:\\Bases\\prueba.fdb' };

describe('cargarConfig: transporte', () => {
  it('sin MCP_TRANSPORTE usa stdio y exige MCP_COD_USUARIO', () => {
    expect(cargarConfig({ ...BASE, MCP_COD_USUARIO: '15169' }).MCP_TRANSPORTE).toBe('stdio');
    expect(() => cargarConfig({ ...BASE })).toThrow(/MCP_COD_USUARIO/);
  });

  it('un transporte desconocido falla e indica los valores admitidos', () => {
    expect(() => cargarConfig({ ...BASE, MCP_COD_USUARIO: '1', MCP_TRANSPORTE: 'websocket' })).toThrow(/stdio, http/);
  });

  it('http sin MCP_JWT_SIGNING_KEY falla nombrando la variable', () => {
    expect(() => cargarConfig({ ...BASE, MCP_TRANSPORTE: 'http' })).toThrow(/MCP_JWT_SIGNING_KEY/);
  });

  it('http no exige MCP_COD_USUARIO y toma el puerto', () => {
    const config = cargarConfig({ ...BASE, MCP_TRANSPORTE: 'http', MCP_JWT_SIGNING_KEY: 'secreto', MCP_HTTP_PUERTO: '7020' });
    expect(config.MCP_COD_USUARIO).toBeUndefined();
    expect(config.MCP_HTTP_PUERTO).toBe(7020);
  });

  it('informa juntos los problemas del transporte y los del esquema', () => {
    expect(() => cargarConfig({})).toThrow(/MCP_COD_USUARIO.*FIREBIRD_DATABASE/);
  });
});

describe('cargarConfig: inicio de sesión', () => {
  const http = { ...BASE, MCP_TRANSPORTE: 'http', MCP_JWT_SIGNING_KEY: 'secreto' };

  it('defaults iguales a los de la v1', () => {
    const c = cargarConfig(http);
    expect(c.MCP_AUTH_TIPO).toBe('alias/clave');
    expect(c.MCP_AUTH_TITULO_AUTORIZACION).toBe('Autorizar acceso al MCP');
    expect(c.MCP_AUTH_APIKEY_REQUERIDO).toBe(true);
    expect(c.MCP_AUTH_APIKEY_TITULO).toBe('Usuario');
    expect(c.MCP_AUTH_APISECRET_REQUERIDO).toBe(true);
    expect(c.MCP_AUTH_APISECRET_TITULO).toBe('Clave');
    expect(c.MCP_JWT_EXPIRACION_SOBRE_DIAS).toBe(15);
    expect(c.MCP_HTTP_PUERTO).toBe(3000);
  });

  it.each([
    ['true', true],
    ['FALSE', false],
    ['1', true],
    ['0', false],
  ])('booleano %s → %s', (valor, esperado) => {
    expect(cargarConfig({ ...http, MCP_AUTH_APISECRET_REQUERIDO: valor }).MCP_AUTH_APISECRET_REQUERIDO).toBe(esperado);
  });

  it('un booleano inválido corta el arranque', () => {
    expect(() => cargarConfig({ ...http, MCP_AUTH_APIKEY_REQUERIDO: 'si' })).toThrow(/MCP_AUTH_APIKEY_REQUERIDO/);
  });

  it('una vigencia no positiva corta el arranque', () => {
    expect(() => cargarConfig({ ...http, MCP_JWT_EXPIRACION_SOBRE_DIAS: '0' })).toThrow(/MCP_JWT_EXPIRACION_SOBRE_DIAS/);
  });

  it('MCP_URL_PUBLICA sin barra final', () => {
    expect(cargarConfig({ ...http, MCP_URL_PUBLICA: 'https://mcp.ejemplo/tickets-v2/' }).MCP_URL_PUBLICA).toBe('https://mcp.ejemplo/tickets-v2');
  });

  it('la base de OAuth cae en FIREBIRD_* y se separa si hay MCP_OAUTH_DB_*', () => {
    const misma = cargarConfig({ ...http, FIREBIRD_HOST: '10.0.0.32' });
    expect(baseOAuthSeparada(misma)).toBe(false);
    expect(configBaseOAuth(misma)).toMatchObject({ FIREBIRD_HOST: '10.0.0.32', FIREBIRD_DATABASE: BASE.FIREBIRD_DATABASE });

    const otra = cargarConfig({ ...http, MCP_OAUTH_DB_PATH: 'E:\\Bases\\oauth.fdb' });
    expect(baseOAuthSeparada(otra)).toBe(true);
    expect(configBaseOAuth(otra)).toMatchObject({ FIREBIRD_DATABASE: 'E:\\Bases\\oauth.fdb', FIREBIRD_HOST: '127.0.0.1' });
  });
});

describe('cargarConfig: catálogo', () => {
  it('sin MCP_CATALOGO publica tickets', () => {
    expect(cargarConfig({ ...BASE, MCP_COD_USUARIO: '15169' }).MCP_CATALOGO).toBe('tickets');
  });

  it('un catálogo sin archivo falla y lista los disponibles', () => {
    expect(() => cargarConfig({ ...BASE, MCP_COD_USUARIO: '1', MCP_CATALOGO: 'ventas' })).toThrow(/'ventas'.*prospeccion.*tickets/);
  });

  it('MCP_FUNCIONES_ARCHIVO tiene prioridad y tiene que existir', () => {
    expect(() => cargarConfig({ ...BASE, MCP_COD_USUARIO: '1', MCP_FUNCIONES_ARCHIVO: 'C:/no/existe.json' })).toThrow(/MCP_FUNCIONES_ARCHIVO/);
  });

  it('la variable obligatoria por stdio sale de la claimRequerida del archivo', () => {
    expect(() => cargarConfig({ ...BASE, MCP_CATALOGO: 'prospeccion', MCP_COD_USUARIO: '1' })).toThrow(/MCP_COD_VENDEDOR.*COD_VENDEDOR/);
  });

  it('prospección por stdio exige MCP_COD_VENDEDOR y no MCP_COD_USUARIO', () => {
    expect(() => cargarConfig({ ...BASE, MCP_CATALOGO: 'prospeccion' })).toThrow(/MCP_COD_VENDEDOR/);
    const config = cargarConfig({ ...BASE, MCP_CATALOGO: 'prospeccion', MCP_COD_VENDEDOR: '12' });
    expect(config.MCP_COD_VENDEDOR).toBe(12);
    expect(config.MCP_COD_USUARIO).toBeUndefined();
  });

  it('prospección por http no exige vendedor en la configuración (sale del token)', () => {
    expect(cargarConfig({ ...BASE, MCP_CATALOGO: 'prospeccion', MCP_TRANSPORTE: 'http', MCP_JWT_SIGNING_KEY: 's' }).MCP_CATALOGO).toBe('prospeccion');
  });
});

describe('identidad por stdio', () => {
  it('sesionStdio arma la sesión con todas las MCP_COD_*', () => {
    const config = cargarConfig({ ...BASE, MCP_COD_USUARIO: '15169', MCP_COD_CLIENTE: '77', MCP_SECUENCIAL_EMPRESA: '2' });
    const sesion = sesionStdio(config);
    expect(sesion).toMatchObject({ codUsuario: 15169, codVendedor: null, codDesarrollador: null, transporte: 'stdio' });
    expect(sesion.claims).toMatchObject({ COD_USUARIO: '15169', COD_CLIENTE: '77', SECUENCIAL_EMPRESA: '2', COD_VENDEDOR: '' });
  });

  it('valida las variables nuevas', () => {
    expect(() => cargarConfig({ ...BASE, MCP_COD_USUARIO: '1', MCP_COD_CLIENTE: 'abc' })).toThrow(/MCP_COD_CLIENTE/);
    expect(cargarConfig({ ...BASE, MCP_COD_USUARIO: '1' }).MCP_WEBSERVICE_CACHE_SEGUNDOS).toBe(60);
    expect(cargarConfig({ ...BASE, MCP_COD_USUARIO: '1', MCP_WEBSERVICE_CACHE_SEGUNDOS: '0' }).MCP_WEBSERVICE_CACHE_SEGUNDOS).toBe(0);
  });
});
