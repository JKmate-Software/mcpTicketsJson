import { describe, expect, it } from 'vitest';
import type { Fila, ValorParametro } from '../db/firebird.js';
import { catalogoDePrueba, llamadasA } from '../../test/funciones-apoyo.js';
import { convertirSegunMetodo, SQL_METODO, SQL_PARAMETROS_METODO, traducirSsql } from './webservice.js';

type Respuesta = { structuredContent?: unknown };
const datos = (r: unknown) => (r as Respuesta).structuredContent as Record<string, unknown>;
const error = (r: unknown) => ((r as Respuesta).structuredContent as { error: { codigo: string; mensaje: string } }).error;

interface MetodoSimulado {
  tipo: string;
  ssql: string;
  categoria?: number;
  parametros: Record<string, string>;
}

/** METODOS_WEBSERVICES simulado: responde las dos consultas de definición. */
function metodos(definidos: Record<string, MetodoSimulado>) {
  const porCodigo = Object.entries(definidos);
  return (sql: string, p: ValorParametro[]): Fila[] | undefined => {
    if (sql === SQL_METODO) {
      const i = porCodigo.findIndex(([nombre]) => nombre === p[0]);
      if (i < 0) return [];
      const [, m] = porCodigo[i]!;
      return [{ COD_METODO_WEBSERVICE: i + 1, TIPO: m.tipo, SSQL: m.ssql, COD_CATEGORIA_WEBSERVICE: m.categoria ?? 1 }];
    }
    if (sql === SQL_PARAMETROS_METODO) {
      const [, m] = porCodigo[Number(p[0]) - 1]!;
      return Object.entries(m.parametros).map(([NOMBRE, TIPO]) => ({ NOMBRE, TIPO, LONGITUD: 0 }));
    }
    return undefined;
  };
}

const HISTORIAL: MetodoSimulado = {
  tipo: 'DATASET_SQL',
  ssql: 'SELECT * FROM PROC_GET_MENSAJES_X_CLIENTEP(@COD_CLIENTE_ING, @COD_PROSPECTO_ING)',
  parametros: { COD_CLIENTE_ING: 'Integer', COD_PROSPECTO_ING: 'Integer' },
};
const historial = (extra: Record<string, unknown> = {}) => ({
  tipo: 'webservice',
  nombre: 'historial_mensajes_prospecto',
  metodo: 'ws_crm_mostrar_msj_x_cliente',
  descripcion: 'Mensajes de un prospecto.',
  parametros: [
    { nombre: 'COD_CLIENTE_ING', alias: 'codCliente', tipo: 'entero', requerido: true },
    { nombre: 'COD_PROSPECTO_ING', alias: 'codProspecto', tipo: 'entero', requerido: true },
  ],
  ...extra,
});

describe('traducción del SSQL', () => {
  it('reemplaza @NOMBRE por ? en orden, también repetidos y en otro caso', () => {
    expect(traducirSsql('SELECT * FROM P(@FILTRO, @filtro, @Otro)')).toEqual({ sql: 'SELECT * FROM P(?, ?, ?)', nombres: ['FILTRO', 'FILTRO', 'OTRO'] });
  });

  it("respeta literales ('a@b' y 'it''s'), identificadores entre comillas y comentarios", () => {
    const ssql = `SELECT 'mail@x.com', 'it''s @NO', "@COL" FROM T -- @COMENTARIO\nWHERE A = @A /* @B */ AND B = @B`;
    expect(traducirSsql(ssql)).toEqual({
      sql: `SELECT 'mail@x.com', 'it''s @NO', "@COL" FROM T -- @COMENTARIO\nWHERE A = ? /* @B */ AND B = ?`,
      nombres: ['A', 'B'],
    });
  });
});

describe('conversión según el tipo del método', () => {
  it.each([
    ['5', 'Integer', 5],
    [1, 'Boolean', 1],
    ['true', 'Boolean', 1],
    ['3.5', 'Decimal', 3.5],
    // El '+' del offset llegó como espacio: 10:00 en +03:00 son las 04:00 en la hora de la base (-03:00).
    ['2026-11-02T10:00:00 03:00', 'Timestamp', '2026-11-02 04:00:00'],
    ['texto', 'VarChar', 'texto'],
    [null, 'Integer', null],
  ] as const)('%s como %s → %s', (valor, tipo, esperado) => {
    expect(convertirSegunMetodo(valor, tipo, 'P', 'America/Argentina/Buenos_Aires')).toBe(esperado);
  });

  it('un Integer que no es número es PARAMETRO_INVALIDO', () => {
    expect(() => convertirSegunMetodo('abc', 'Integer', 'P', 'UTC')).toThrow(/P tiene que ser un entero/);
  });
});

describe('tools webservice', () => {
  const MENSAJES = { PROC_GET_MENSAJES_X_CLIENTEP: () => [{ FECHA_HORA: null, MENSAJE: 'Llamar el lunes   ', USUARIO: 'u' }] };

  it('lee la definición del método, compone la llamada y devuelve las filas en camelCase', async () => {
    const { cliente, llamadas } = await catalogoDePrueba([historial()], { filas: MENSAJES, sql: metodos({ ws_crm_mostrar_msj_x_cliente: HISTORIAL }) });
    const r = datos(await cliente.callTool({ name: 'historial_mensajes_prospecto', arguments: { codCliente: 3, codProspecto: 2 } }));
    expect(r.resultado).toEqual([{ fechaHora: null, mensaje: 'Llamar el lunes', usuario: 'u' }]);
    expect(llamadasA(llamadas, 'PROC_GET_MENSAJES_X_CLIENTEP')[0]).toMatchObject({
      sql: 'SELECT * FROM PROC_GET_MENSAJES_X_CLIENTEP(?, ?)',
      parametros: [3, 2],
    });
  });

  it('la definición se reusa dentro del tiempo de caché', async () => {
    const { cliente, consultas } = await catalogoDePrueba([historial()], { filas: MENSAJES, sql: metodos({ ws_crm_mostrar_msj_x_cliente: HISTORIAL }) });
    await cliente.callTool({ name: 'historial_mensajes_prospecto', arguments: { codCliente: 3, codProspecto: 2 } });
    await cliente.callTool({ name: 'historial_mensajes_prospecto', arguments: { codCliente: 3, codProspecto: 2 } });
    expect(consultas.filter((l) => l.sql === SQL_METODO)).toHaveLength(1);
  });

  it('método inexistente → ERROR_INTERNO que lo nombra', async () => {
    const { cliente } = await catalogoDePrueba([historial({ metodo: 'noExiste' })], { sql: metodos({}) });
    expect(error(await cliente.callTool({ name: 'historial_mensajes_prospecto', arguments: { codCliente: 3, codProspecto: 2 } }))).toMatchObject({
      codigo: 'ERROR_INTERNO',
      mensaje: expect.stringContaining('noExiste'),
    });
  });

  it('un parámetro que el método no tiene → ERROR_INTERNO que nombra el sobrante y lo aceptado, sin ejecutar', async () => {
    const tool = {
      tipo: 'webservice',
      nombre: 'resultados',
      metodo: 'ws_crm_mostrar_resultado',
      descripcion: 'x',
      parametros: [
        { nombre: 'COD_CATEGORIA_MENSAJE', tipo: 'entero' },
        { nombre: 'COD_RESULTADO', tipo: 'entero' },
      ],
    };
    const ws = { tipo: 'DATASET_SQL', ssql: 'SELECT * FROM PROC_GET_RESULTADOS_RECL_X_CAT(@COD_CATEGORIA_MENSAJE)', parametros: { COD_CATEGORIA_MENSAJE: 'Integer' } };
    const { cliente, llamadas } = await catalogoDePrueba([tool], { sql: metodos({ ws_crm_mostrar_resultado: ws }) });
    const e = error(await cliente.callTool({ name: 'resultados', arguments: { COD_CATEGORIA_MENSAJE: 5 } }));
    expect(e.mensaje).toMatch(/COD_RESULTADO.*ws_crm_mostrar_resultado.*acepta: COD_CATEGORIA_MENSAJE/);
    expect(llamadasA(llamadas, 'PROC_GET_RESULTADOS_RECL_X_CAT')).toHaveLength(0);
  });

  it('un parámetro del método que la tool no declara va NULL; EXECUTE_* devuelve resultado vacío', async () => {
    const ws = { tipo: 'EXECUTE_PROCEDURE', ssql: 'EXECUTE PROCEDURE ACT_X(@FILTRO, @OTRO)', parametros: { FILTRO: 'Integer', OTRO: 'VarChar' } };
    const tool = { tipo: 'webservice', nombre: 'actualizar', metodo: 'actX', descripcion: 'x', escritura: true, parametros: [{ nombre: 'FILTRO', tipo: 'entero' }] };
    const { cliente, llamadas, transacciones } = await catalogoDePrueba([tool], { filas: { ACT_X: () => [] }, sql: metodos({ actX: ws }) });
    const r = datos(await cliente.callTool({ name: 'actualizar', arguments: { FILTRO: 5 } }));
    expect(r).toEqual({ resultado: [] });
    expect(llamadasA(llamadas, 'ACT_X')[0]?.parametros).toEqual([5, null]);
    expect(transacciones.confirmadas).toBe(1);
  });

  it('tipo de método desconocido → ERROR_INTERNO', async () => {
    const ws = { tipo: 'OTRA_COSA', ssql: 'SELECT 1 FROM RDB$DATABASE', parametros: {} };
    const { cliente } = await catalogoDePrueba([{ tipo: 'webservice', nombre: 'raro', metodo: 'raro', descripcion: 'x' }], { sql: metodos({ raro: ws }) });
    expect(error(await cliente.callTool({ name: 'raro', arguments: {} })).mensaje).toContain('OTRA_COSA');
  });

  it('sanitiza los textos salvo en las categorías 100 y 200', async () => {
    const definicion = (categoria: number) => ({
      tipo: 'DATASET_SQL',
      ssql: 'SELECT * FROM P_MSJ(@MENSAJE)',
      categoria,
      parametros: { MENSAJE: 'VarChar' },
    });
    const tool = (nombre: string, metodo: string) => ({ tipo: 'webservice', nombre, metodo, descripcion: 'x', parametros: [{ nombre: 'MENSAJE', tipo: 'texto' }] });
    const { cliente, llamadas } = await catalogoDePrueba([tool('comun', 'comun'), tool('exento', 'exento')], {
      filas: { P_MSJ: () => [] },
      sql: metodos({ comun: definicion(1), exento: definicion(100) }),
    });
    await cliente.callTool({ name: 'comun', arguments: { MENSAJE: '<script>x</script>Hola <b>che</b>' } });
    await cliente.callTool({ name: 'exento', arguments: { MENSAJE: 'Hola <b>che</b>' } });
    expect(llamadasA(llamadas, 'P_MSJ').map((l) => l.parametros[0])).toEqual(['Hola che', 'Hola <b>che</b>']);
  });
});
