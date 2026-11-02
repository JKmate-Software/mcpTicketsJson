import { describe, expect, it } from 'vitest';
import { catalogoDePrueba, T } from '../../test/funciones-apoyo.js';

type Respuesta = { structuredContent?: unknown; content: { text?: string }[] };
const datos = (r: unknown) => (r as Respuesta).structuredContent as Record<string, unknown>;

const LISTAR = {
  tipo: 'agrupadora',
  nombre: 'listar_catalogo',
  descripcion: 'Catálogos de referencia.',
  parametros: [{ nombre: 'catalogo', descripcion: 'Catálogo a listar.' }],
};
const variante = (nombre: string, extra: Record<string, unknown> = {}) => ({
  tipo: 'procedure',
  nombre,
  grupo: 'listar_catalogo',
  procedure: `P_${nombre.toUpperCase()}`,
  descripcion: `Catálogo ${nombre}.`,
  salida: [
    { columna: 'COD', nombre: 'codigo', tipo: 'entero' },
    { columna: 'NOMBRE', nombre: 'nombre', tipo: 'texto' },
  ],
  ...extra,
});
const BASE = {
  procedures: {
    P_PROVINCIAS: { salidas: { COD: T.INTEGER, NOMBRE: T.VARCHAR } },
    P_LOCALIDADES: { entradas: ['COD_PROVINCIA'], salidas: { COD: T.INTEGER, NOMBRE: T.VARCHAR, CP: T.VARCHAR } },
  },
  filas: {
    P_PROVINCIAS: () => [{ COD: 5, NOMBRE: 'CÓRDOBA ' }],
    P_LOCALIDADES: (p: unknown[]) => [{ COD: Number(p[0]) * 10, NOMBRE: 'CAPITAL', CP: '' }],
  },
};
const localidades = variante('localidades', {
  uso: 'codigo → registrar.codLocalidad',
  parametros: [{ nombre: 'COD_PROVINCIA', tipo: 'entero', requerido: true }],
  padre: { parametro: 'COD_PROVINCIA', catalogo: 'provincias' },
  salida: [
    { columna: 'COD', nombre: 'codigo', tipo: 'entero' },
    { columna: 'NOMBRE', nombre: 'nombre', tipo: 'texto' },
    { columna: 'CP', nombre: 'codigoPostal', tipo: 'texto' },
  ],
});

describe('agrupadora (listar_catalogo genérico)', () => {
  it('publica una sola tool con catalogo (enum), codPadre y la descripción generada', async () => {
    const { cliente } = await catalogoDePrueba([LISTAR, variante('provincias', { busqueda: { campos: ['nombre'] } }), localidades], BASE);
    const tools = (await cliente.listTools()).tools;
    expect(tools.map((t) => t.name)).toEqual(['listar_catalogo']);
    const [t] = tools;
    expect(Object.keys(t!.inputSchema.properties ?? {})).toEqual(['catalogo', 'codPadre', 'buscar']);
    expect(t!.description).toBe(
      "Catálogos de referencia.\n• provincias — Catálogo provincias. [buscar]\n• localidades — requiere codPadre = codigo de 'provincias' — codigo → registrar.codLocalidad",
    );
  });

  it('compone la salida uniforme con la salida de la variante y pasa codPadre al parámetro padre', async () => {
    const { cliente, llamadas } = await catalogoDePrueba([LISTAR, variante('provincias'), localidades], BASE);
    const r = datos(await cliente.callTool({ name: 'listar_catalogo', arguments: { catalogo: 'localidades', codPadre: 5 } }));
    expect(r).toEqual({ catalogo: 'localidades', elementos: [{ codigo: 50, nombre: 'CAPITAL', codigoPostal: null }], avisos: [] });
    expect(llamadas.at(-1)).toMatchObject({ nombre: 'P_LOCALIDADES', parametros: [5] });
  });

  it('padre requerido que falta, padre que no aplica y catálogo desconocido', async () => {
    const { cliente } = await catalogoDePrueba([LISTAR, variante('provincias'), localidades], BASE);
    const falta = datos(await cliente.callTool({ name: 'listar_catalogo', arguments: { catalogo: 'localidades' } }));
    expect(falta.error).toMatchObject({ codigo: 'PARAMETRO_INVALIDO', mensaje: "localidades requiere codPadre: el codigo elegido de 'provincias'." });
    const sobra = datos(await cliente.callTool({ name: 'listar_catalogo', arguments: { catalogo: 'provincias', codPadre: 1 } }));
    expect(sobra).toMatchObject({ elementos: [{ codigo: 5, nombre: 'CÓRDOBA' }], avisos: ['codPadre no aplica a provincias: se ignoró.'] });
    const desconocido = datos(await cliente.callTool({ name: 'listar_catalogo', arguments: { catalogo: 'paises' } }));
    expect(JSON.stringify(desconocido.error)).toContain('catalogo debe ser uno de: provincias, localidades');
  });

  it.each([
    ['grupo sin variantes', [LISTAR], /no tiene variantes/],
    ['variante de un grupo inexistente', [variante('provincias', { grupo: 'otro_grupo' })], /'otro_grupo' no existe/],
    ['variante sin codigo', [LISTAR, variante('provincias', { salida: [{ columna: 'NOMBRE', nombre: 'nombre' }] })], /provincias.*'codigo'/],
    ['variante con escritura', [LISTAR, variante('provincias', { escritura: true })], /escritura/],
    [
      'variante con un parámetro obligatorio que no es el padre',
      [LISTAR, variante('provincias', { parametros: [{ nombre: 'FECHA', tipo: 'fecha', requerido: true }] })],
      /'FECHA' no se puede recibir/,
    ],
    ['padre.catalogo que no es variante', [LISTAR, variante('provincias'), { ...localidades, padre: { parametro: 'COD_PROVINCIA', catalogo: 'paises' } }], /'paises'/],
    [
      'variante cuyo grupo es una tool compleja',
      [{ tipo: 'compleja', nombre: 'user_info', handler: 'user-info', descripcion: 'x' }, variante('provincias', { grupo: 'user_info' })],
      /'provincias'.*'user_info'.*agrupadora/,
    ],
    ['agrupadora con handler', [{ ...LISTAR, handler: 'listar-catalogo' }, variante('provincias')], /handler/],
  ])('%s invalida el archivo', async (_caso, tools, error) => {
    await expect(catalogoDePrueba(tools, BASE)).rejects.toThrow(error);
  });
});
