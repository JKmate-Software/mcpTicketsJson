import { describe, expect, it } from 'vitest';
import { r } from '../../test/apoyo.js';
import { catalogoDePrueba, llamadasA, SESION_VENDEDOR, T } from '../../test/funciones-apoyo.js';
import { SQL_METADATA_PROCEDURE } from './procedure.js';

type Respuesta = { isError?: boolean; structuredContent?: unknown; content: { type: string; text?: string }[] };
const datos = (r: unknown) => (r as Respuesta).structuredContent as Record<string, unknown>;
const error = (r: unknown) => ((r as Respuesta).structuredContent as { error: { codigo: string; mensaje: string } }).error;

const BARRIOS = {
  procedures: { PROC_GET_BARRIOS: { salidas: { COD_BARRIO: T.INTEGER, COD_LOCALIDAD: T.INTEGER, NOMBRE: T.CHAR, CODIGO_POSTAL: T.VARCHAR, COD_ZONA_GEOGRAFICA: T.INTEGER } } },
  filas: {
    PROC_GET_BARRIOS: () => [
      { COD_BARRIO: 11, COD_LOCALIDAD: 1, NOMBRE: 'NUEVA CORDOBA     ', CODIGO_POSTAL: '5000', COD_ZONA_GEOGRAFICA: 1 },
      { COD_BARRIO: 12, COD_LOCALIDAD: 1, NOMBRE: 'ALBERDI', CODIGO_POSTAL: null, COD_ZONA_GEOGRAFICA: 1 },
      { COD_BARRIO: 14, COD_LOCALIDAD: 2, NOMBRE: 'ALTO ALBERDI', CODIGO_POSTAL: '5003', COD_ZONA_GEOGRAFICA: 2 },
    ],
  },
};
const barrios = (extra: Record<string, unknown> = {}) => ({ tipo: 'procedure', nombre: 'listar_barrios', procedure: 'PROC_GET_BARRIOS', descripcion: 'Barrios.', ...extra });

describe('tools procedure', () => {
  it('procedure sin parámetros: SELECT sin paréntesis y columnas en camelCase sin relleno', async () => {
    const { cliente, llamadas } = await catalogoDePrueba([barrios()], BARRIOS);
    const r = await cliente.callTool({ name: 'listar_barrios', arguments: {} });
    expect(llamadasA(llamadas, 'PROC_GET_BARRIOS')[0]?.sql).toBe('SELECT * FROM PROC_GET_BARRIOS');
    expect((datos(r).resultado as unknown[])[0]).toEqual({ codBarrio: 11, codLocalidad: 1, nombre: 'NUEVA CORDOBA', codigoPostal: '5000', codZonaGeografica: 1 });
    expect((r as Respuesta).content[0]?.text).toBe('listar_barrios: 3 filas.');
  });

  it('todas las entradas en el orden de la firma, NULL las no declaradas', async () => {
    const { cliente, llamadas } = await catalogoDePrueba(
      [{ tipo: 'procedure', nombre: 'abc', procedure: 'P_ABC', descripcion: 'x', parametros: [{ nombre: 'C', tipo: 'entero' }, { nombre: 'A', tipo: 'entero' }] }],
      { procedures: { P_ABC: { entradas: ['A', 'B', 'C'], salidas: { X: T.INTEGER } } }, filas: { P_ABC: () => [{ X: 1 }] } },
    );
    await cliente.callTool({ name: 'abc', arguments: { A: 1, C: 3 } });
    expect(llamadasA(llamadas, 'P_ABC')[0]).toMatchObject({ sql: 'SELECT * FROM P_ABC(?, ?, ?)', parametros: [1, null, 3] });
  });

  it('la metadata se lee una sola vez', async () => {
    const { cliente, consultas } = await catalogoDePrueba([barrios()], BARRIOS);
    await cliente.callTool({ name: 'listar_barrios', arguments: {} });
    await cliente.callTool({ name: 'listar_barrios', arguments: {} });
    expect(consultas.filter((l) => l.sql === SQL_METADATA_PROCEDURE)).toHaveLength(1);
  });

  it('procedure inexistente o parámetro que el procedure no tiene → ERROR_INTERNO que los nombra', async () => {
    const { cliente } = await catalogoDePrueba(
      [
        { tipo: 'procedure', nombre: 'no_existe', procedure: 'PROC_NO_EXISTE', descripcion: 'x' },
        { tipo: 'procedure', nombre: 'de_mas', procedure: 'P_ABC', descripcion: 'x', parametros: [{ nombre: 'Z', tipo: 'entero' }] },
      ],
      { procedures: { P_ABC: { entradas: ['A'] } } },
    );
    expect(error(await cliente.callTool({ name: 'no_existe', arguments: {} }))).toMatchObject({ codigo: 'ERROR_INTERNO', mensaje: expect.stringContaining('PROC_NO_EXISTE') });
    expect(error(await cliente.callTool({ name: 'de_mas', arguments: {} })).mensaje).toMatch(/Z.*P_ABC.*entradas: A/);
  });

  it('procedure ejecutable: EXECUTE PROCEDURE', async () => {
    const { cliente, llamadas } = await catalogoDePrueba(
      [{ tipo: 'procedure', nombre: 'ejecutar', procedure: 'P_EJEC', descripcion: 'x', escritura: true, parametros: [{ nombre: 'A', tipo: 'entero' }] }],
      { procedures: { P_EJEC: { tipo: 2, entradas: ['A'] } }, filas: { P_EJEC: () => [] } },
    );
    await cliente.callTool({ name: 'ejecutar', arguments: { A: 5 } });
    expect(llamadasA(llamadas, 'P_EJEC')[0]?.sql).toBe('EXECUTE PROCEDURE P_EJEC(?)');
  });

  it('DATE como AAAA-MM-DD, TIMESTAMP en ISO con offset', async () => {
    const { cliente } = await catalogoDePrueba([{ tipo: 'procedure', nombre: 'fechas', procedure: 'P_F', descripcion: 'x' }], {
      procedures: { P_F: { salidas: { FECHA_ALTA: T.DATE, CREADO: T.TIMESTAMP } } },
      filas: { P_F: () => [{ FECHA_ALTA: r('2026-11-02'), CREADO: r('2026-11-02 10:30:00') }] },
    });
    const r0 = (datos(await cliente.callTool({ name: 'fechas', arguments: {} })).resultado as Record<string, unknown>[])[0];
    expect(r0).toEqual({ fechaAlta: '2026-11-02', creado: '2026-11-02T10:30:00-03:00' });
  });
});

describe('parámetros de las tools procedure', () => {
  const P = { procedures: { P_X: { entradas: ['PORDEN', 'COD_ORIGEN_MENSAJE', 'COD_VENDEDOR_IN', 'COD_DES', 'P_JSON'], salidas: { OK: T.INTEGER } } }, filas: { P_X: () => [{ OK: 1 }] } };
  const tool = (extra: Record<string, unknown> = {}) => ({
    tipo: 'procedure',
    nombre: 'px',
    procedure: 'P_X',
    descripcion: 'x',
    campoVendedor: 'COD_VENDEDOR_IN',
    campoDesarrollador: 'COD_DES',
    parametros: [
      { nombre: 'PORDEN', alias: 'orden', tipo: 'entero', descripcion: 'Orden del integrante.' },
      { nombre: 'COD_ORIGEN_MENSAJE', tipo: 'entero', valorFijo: 7 },
      { nombre: 'COD_VENDEDOR_IN', tipo: 'entero', requerido: true },
      { nombre: 'COD_DES', tipo: 'entero' },
      { nombre: 'P_JSON', tipo: 'json' },
    ],
    ...extra,
  });

  it('inputSchema: alias visible, valor fijo y campo forzado ocultos, autocompletado visible', async () => {
    const { cliente } = await catalogoDePrueba([tool()], P);
    const [t] = (await cliente.listTools()).tools;
    expect(Object.keys(t!.inputSchema.properties ?? {})).toEqual(['orden', 'COD_DES', 'P_JSON']);
    expect((t!.inputSchema.properties as Record<string, { description?: string }>).orden?.description).toBe('Orden del integrante.');
  });

  it('resuelve alias, valor fijo, sesión forzada, autocompletado y json', async () => {
    const sesion = { ...SESION_VENDEDOR, codDesarrollador: 100936 };
    const { cliente, llamadas } = await catalogoDePrueba([tool()], P, sesion);
    await cliente.callTool({ name: 'px', arguments: { orden: 2, P_JSON: { a: [1, 2] } } });
    await cliente.callTool({ name: 'px', arguments: { orden: 2, COD_DES: 200 } });
    const [primera, segunda] = llamadasA(llamadas, 'P_X');
    expect(primera?.parametros).toEqual([2, 7, 12, 100936, '{"a":[1,2]}']);
    expect(segunda?.parametros).toEqual([2, 7, 12, 200, null]);
  });

  it('sesión sin el dato que un campo de sesión necesita → NO_AUTORIZADO que nombra la clave', async () => {
    const { cliente, llamadas } = await catalogoDePrueba([tool()], P, { ...SESION_VENDEDOR, codVendedor: null });
    const e = error(await cliente.callTool({ name: 'px', arguments: {} }));
    expect(e).toMatchObject({ codigo: 'NO_AUTORIZADO', mensaje: expect.stringContaining('COD_VENDEDOR') });
    expect(llamadasA(llamadas, 'P_X')).toHaveLength(0);
  });

  it('tipo inválido → PARAMETRO_INVALIDO que nombra el parámetro', async () => {
    const { cliente } = await catalogoDePrueba([tool()], P);
    const e = error(await cliente.callTool({ name: 'px', arguments: { orden: 'abc' } }));
    expect(e.codigo).toBe('PARAMETRO_INVALIDO');
    expect(JSON.stringify(e)).toContain('orden');
  });

  it('sanitiza los textos, también dentro de un json', async () => {
    const { cliente, llamadas } = await catalogoDePrueba([tool()], P);
    await cliente.callTool({ name: 'px', arguments: { COD_DES: 1, P_JSON: { titular: { nombre: '<img src=x onerror=alert(1)>Ana' } } } });
    expect(llamadasA(llamadas, 'P_X')[0]?.parametros[4]).toBe('{"titular":{"nombre":"Ana"}}');
  });
});

describe('contexto de sesión', () => {
  const CONTEXTO = {
    procedures: { P_CTX: { salidas: { VENDEDOR: T.VARCHAR } } },
    filas: { P_CTX: (_p: unknown, contexto?: Map<string, string>) => [{ VENDEDOR: contexto?.get('COD_VENDEDOR') ?? null }] },
  };
  const ctx = { tipo: 'procedure', nombre: 'quien', procedure: 'P_CTX', descripcion: 'x' };

  it('el procedure ve las claims en RDB$GET_CONTEXT y no se filtran a la siguiente sesión del pool', async () => {
    const base = await catalogoDePrueba([ctx], CONTEXTO);
    const r1 = datos(await base.cliente.callTool({ name: 'quien', arguments: {} }));
    expect(r1.resultado).toEqual([{ vendedor: '12' }]);

    // Misma conexión del pool, otra sesión sin vendedor.
    const tool = base.catalogo.tools[0]!;
    const { conectarCliente } = await import('../../test/apoyo.js');
    const otra = await conectarCliente([tool], { codUsuario: 15169, codDesarrollador: null, codVendedor: null, transporte: 'http' });
    const r2 = datos(await otra.cliente.callTool({ name: 'quien', arguments: {} }));
    expect(r2.resultado).toEqual([{ vendedor: null }]);
    expect(base.contextos.map((c) => c.exclusiva)).toEqual([false, false]);
  });

  it('conexionExclusiva usa una conexión propia', async () => {
    const { cliente, contextos, conexionPool } = await catalogoDePrueba([{ ...ctx, conexionExclusiva: true }], CONTEXTO);
    await cliente.callTool({ name: 'quien', arguments: {} });
    expect(contextos[0]).toMatchObject({ exclusiva: true, valores: { COD_VENDEDOR: '12', COD_USUARIO: '874' } });
    expect(conexionPool.size).toBe(0);
  });
});

describe('salida, tope, búsqueda, escritura y rechazo', () => {
  it('salida proyecta y renombra; una columna inexistente es ERROR_INTERNO', async () => {
    const { cliente } = await catalogoDePrueba(
      [barrios({ salida: [{ columna: 'COD_BARRIO', nombre: 'id' }, 'NOMBRE'] }), barrios({ nombre: 'roto', salida: ['NO_EXISTE'] })],
      BARRIOS,
    );
    const r1 = datos(await cliente.callTool({ name: 'listar_barrios', arguments: {} }));
    expect((r1.resultado as unknown[])[1]).toEqual({ id: 12, nombre: 'ALBERDI' });
    expect(error(await cliente.callTool({ name: 'roto', arguments: {} }))).toMatchObject({ codigo: 'ERROR_INTERNO', mensaje: expect.stringContaining('NO_EXISTE') });
  });

  it('maxFilas acota e informa hayMas', async () => {
    const { cliente } = await catalogoDePrueba([barrios({ maxFilas: 2 })], BARRIOS);
    const r1 = datos(await cliente.callTool({ name: 'listar_barrios', arguments: {} }));
    expect((r1.resultado as unknown[]).length).toBe(2);
    expect(r1.hayMas).toBe(true);
  });

  it('búsqueda aproximada con caché', async () => {
    const { cliente, llamadas } = await catalogoDePrueba(
      [barrios({ busqueda: { campos: ['NOMBRE'], cacheMinutos: 60, cacheAlcance: 'global' } })],
      BARRIOS,
    );
    const r1 = datos(await cliente.callTool({ name: 'listar_barrios', arguments: { buscar: 'alberdi' } }));
    await cliente.callTool({ name: 'listar_barrios', arguments: { buscar: 'nueva' } });
    const nombres = (r1.resultado as { nombre: string; similitud: number }[]).map((e) => e.nombre);
    expect(nombres[0]).toBe('ALBERDI');
    expect(nombres).not.toContain('NUEVA CORDOBA');
    expect(r1.busqueda).toMatchObject({ texto: 'alberdi', totalCatalogo: 3 });
    expect(llamadasA(llamadas, 'PROC_GET_BARRIOS')).toHaveLength(1);
  });

  it('escritura: annotations; rechazo por SALIDA deshace la transacción', async () => {
    const { cliente, transacciones } = await catalogoDePrueba(
      [
        {
          tipo: 'procedure',
          nombre: 'registrar',
          procedure: 'P_SET',
          descripcion: 'x',
          escritura: true,
          rechazo: { columna: 'SALIDA', valoresExito: [0], columnaMensaje: 'MENSAJE' },
        },
      ],
      { procedures: { P_SET: { salidas: { SALIDA: T.INTEGER, MENSAJE: T.VARCHAR } } }, filas: { P_SET: () => [{ SALIDA: -1, MENSAJE: 'Falta el teléfono' }] } },
    );
    const [t] = (await cliente.listTools()).tools;
    expect(t?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    expect(error(await cliente.callTool({ name: 'registrar', arguments: {} }))).toEqual({ codigo: 'OPERACION_RECHAZADA', mensaje: 'Falta el teléfono' });
    expect(transacciones).toEqual({ confirmadas: 0, deshechas: 1 });
  });

  it('una excepción de usuario de Firebird es OPERACION_RECHAZADA con su texto', async () => {
    const excepcion = Object.assign(new Error('exception 12\nE_PROSPECTO\nProspecto inexistente\nAt procedure P_SET line: 3, col: 5'), { gdscode: 335544517 });
    const { cliente } = await catalogoDePrueba([{ tipo: 'procedure', nombre: 'registrar', procedure: 'P_SET', descripcion: 'x', escritura: true }], {
      procedures: { P_SET: { salidas: { SALIDA: T.INTEGER } } },
      filas: {
        P_SET: () => {
          throw excepcion;
        },
      },
    });
    expect(error(await cliente.callTool({ name: 'registrar', arguments: {} }))).toEqual({ codigo: 'OPERACION_RECHAZADA', mensaje: 'Prospecto inexistente' });
  });
});
