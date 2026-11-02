import { describe, expect, it } from 'vitest';
import { conectarCliente, r, toolDe } from './apoyo.js';
import type { Sesion } from '../src/auth/sesion.js';
import { CacheCatalogos } from '../src/busqueda/catalogo.js';
import type { ValorParametro } from '../src/db/firebird.js';
import type { MetadatosBusqueda } from '../src/busqueda/catalogo.js';
import { accesoProspeccion } from './datos/catalogos-prospeccion.js';

/** Respuesta de listar_catalogo (handler genérico, src/funciones/listar-catalogo.ts). */
interface ListadoCatalogo {
  catalogo: string;
  elementos: { codigo: number; nombre: string; similitud?: number; [campo: string]: unknown }[];
  avisos: string[];
  busqueda?: MetadatosBusqueda;
}

const ZONA = 'America/Argentina/Buenos_Aires';
const SESION: Sesion = { codUsuario: 874, codDesarrollador: null, codVendedor: 12, transporte: 'http' };

const BARRIOS = ['VILLA BELGRANO', 'CENTRO', 'ALBERDI', 'VILLA ALLENDE', ...Array.from({ length: 60 }, (_, i) => `LOTEO ${i}`)];

const MANEJADORES = {
  PROC_GET_GRUPOS_PROSP_X_VEND: (p: ValorParametro[]) => [
    { COD_GRUPO_PROSPECTO: 5, NOMBRE: `GRUPO DEL VENDEDOR ${p[0]}`, ESTADO_GRUPO_PROSPECTO: 1, COD_CAMPANIA: 2, UNICO: 0 },
  ],
  PROC_GET_ENTIDADES_X_MCCATEG: () => [
    { COD_ENTIDAD: 7, NOMBRE: 'WEB' },
    { COD_ENTIDAD: 8, NOMBRE: 'REFERIDO' },
  ],
  PROC_GET_CAT_MENS_ENC_PROSP: () => [{ COD_CATEGORIA_MENSAJE: 30, CATEGORIA: 'LLAMADO', COLOR: 'red', GENERA_RECLAMOS: 1 }],
  PROC_GET_RESULTADOS_RECL_X_CAT: () => [
    { COD_RESULTADO_RECLAMO: 40, DESCRIPCION: 'VOLVER A LLAMAR', EXIGE_AGENDAMIENTO: 1, COD_ESTADO_RECLAMO: 1 },
    { COD_RESULTADO_RECLAMO: 41, DESCRIPCION: 'NO INTERESADO', EXIGE_AGENDAMIENTO: 0, COD_ESTADO_RECLAMO: 2 },
  ],
  PROC_GET_CAT_MENSAJES_PROSP: () => [{ COD_CATEGORIA_MENSAJE: 31, CATEGORIA: 'VISITA', COLOR: 'blue' }],
  PROC_GET_CAMPANIAS: () => [
    { COD_CAMPANIA: 1, CAMPANIA: 'INVIERNO', FECHA_INICIO: r('2026-06-01'), FECHA_FIN: r('2026-08-31'), COD_EMPRESA: 1 },
    { COD_CAMPANIA: 2, CAMPANIA: 'PRIMAVERA', FECHA_INICIO: r('2026-09-01'), FECHA_FIN: r('2026-11-30'), COD_EMPRESA: 1 },
  ],
  PROC_GET_LOCALIDADES: () => [
    { COD_LOCALIDAD: 1, COD_PROVINCIA: 6, NOMBRE: 'VILLA ALLENDE', CODIGO_POSTAL: '5105' },
    { COD_LOCALIDAD: 2, COD_PROVINCIA: 6, NOMBRE: 'CÓRDOBA', CODIGO_POSTAL: '5000' },
  ],
  PROC_GET_BARRIOS: () => BARRIOS.map((nombre, i) => ({ COD_BARRIO: i + 1, COD_LOCALIDAD: 2, NOMBRE: nombre, CODIGO_POSTAL: '5000' })),
};

function preparar() {
  const { acceso, llamadas } = accesoProspeccion(MANEJADORES);
  const cache = new CacheCatalogos();
  return { acceso, llamadas, cache };
}

async function listar(args: Record<string, unknown>, entorno = preparar(), sesion: Sesion = SESION) {
  const { cliente, eventos } = await conectarCliente([await toolDe('prospeccion', 'listar_catalogo', { acceso: entorno.acceso, zonaHoraria: ZONA, cache: entorno.cache })], sesion);
  const resultado = await cliente.callTool({ name: 'listar_catalogo', arguments: args });
  return {
    datos: resultado.structuredContent as unknown as ListadoCatalogo & { error?: { codigo: string; mensaje: string } },
    llamadas: entorno.llamadas,
    eventos,
  };
}

describe('listar_catalogo: selección', () => {
  it('catálogo inválido: PARAMETRO_INVALIDO con los 8 catálogos', async () => {
    const { datos } = await listar({ catalogo: 'provincias' });
    expect(datos.error?.codigo).toBe('PARAMETRO_INVALIDO');
    for (const c of ['grupos', 'canales', 'categorias', 'resultados', 'acciones', 'campanias', 'localidades', 'barrios']) {
      expect(JSON.stringify(datos.error)).toContain(c);
    }
  });

  it('la descripción dice qué código va a qué parámetro, quién requiere codPadre y quién admite buscar', async () => {
    const { acceso, cache } = preparar();
    const { cliente } = await conectarCliente([await toolDe('prospeccion', 'listar_catalogo', { acceso, zonaHoraria: ZONA, cache })], SESION);
    const descripcion = (await cliente.listTools()).tools[0]!.description!;
    expect(descripcion).toContain('• grupos — codigo → registrar_*.codGrupoProspecto');
    expect(descripcion).toContain("• resultados — requiere codPadre = codigo de 'categorias'");
    expect(descripcion).toMatch(/• barrios — .*\[buscar\]/);
    expect(descripcion).not.toMatch(/• grupos — .*\[buscar\]/);
  });
});

describe('listar_catalogo: respuesta uniforme', () => {
  it('resultados con exigeAgendamiento booleano', async () => {
    const { datos, llamadas } = await listar({ catalogo: 'resultados', codPadre: 30 });
    expect(datos.elementos).toEqual([
      { codigo: 40, nombre: 'VOLVER A LLAMAR', exigeAgendamiento: true },
      { codigo: 41, nombre: 'NO INTERESADO', exigeAgendamiento: false },
    ]);
    expect(datos.avisos).toEqual([]);
    expect(llamadas[0]?.parametros).toEqual([30]);
  });

  it('grupos del vendedor de la sesión', async () => {
    const { datos, llamadas } = await listar({ catalogo: 'grupos' });
    expect(datos.elementos).toEqual([{ codigo: 5, nombre: 'GRUPO DEL VENDEDOR 12', estado: 1 }]);
    expect(llamadas[0]?.parametros).toEqual([12]);
  });

  it('sin campos de presentación', async () => {
    const { datos } = await listar({ catalogo: 'acciones' });
    expect(JSON.stringify(datos)).not.toMatch(/COLOR|color/);
    expect(datos.elementos).toEqual([{ codigo: 31, nombre: 'VISITA' }]);
  });

  it('campañas, la más reciente primero, con fechas', async () => {
    const { datos } = await listar({ catalogo: 'campanias' });
    expect(datos.elementos.map((e) => e.codigo)).toEqual([2, 1]);
    expect(datos.elementos[0]).toMatchObject({ fechaInicio: '2026-09-01', fechaFin: '2026-11-30' });
  });
});

describe('listar_catalogo: codPadre', () => {
  it('resultados sin padre: PARAMETRO_INVALIDO que menciona categorias, sin ir a la base', async () => {
    const { datos, llamadas } = await listar({ catalogo: 'resultados' });
    expect(datos.error?.codigo).toBe('PARAMETRO_INVALIDO');
    expect(datos.error?.mensaje).toContain('categorias');
    expect(llamadas).toHaveLength(0);
  });

  it('categorias: codPadre opcional (resultado previo)', async () => {
    expect((await listar({ catalogo: 'categorias' })).llamadas[0]?.parametros).toEqual([0, null]);
    expect((await listar({ catalogo: 'categorias', codPadre: 40 })).llamadas[0]?.parametros).toEqual([0, 40]);
  });

  it('padre que no aplica: éxito con aviso', async () => {
    const { datos } = await listar({ catalogo: 'barrios', codPadre: 5, buscar: 'centro' });
    expect(datos.error).toBeUndefined();
    expect(datos.avisos).toContain('codPadre no aplica a barrios: se ignoró.');
  });

  it('buscar que no aplica: aviso', async () => {
    const { datos } = await listar({ catalogo: 'grupos', buscar: 'x' });
    expect(datos.avisos).toContain('buscar no aplica a grupos: se ignoró.');
  });
});

describe('listar_catalogo: búsqueda aproximada', () => {
  it('error de tipeo encuentra la localidad', async () => {
    const { datos } = await listar({ catalogo: 'localidades', buscar: 'bila aiende' });
    expect(datos.elementos[0]).toMatchObject({ codigo: 1, nombre: 'VILLA ALLENDE', codProvincia: 6 });
    expect(datos.elementos[0]!.similitud).toBeGreaterThan(60);
  });

  it('igualdad exacta (otras mayúsculas, sin tildes) sale primera con 100', async () => {
    const { datos } = await listar({ catalogo: 'localidades', buscar: 'cordoba' });
    expect(datos.elementos[0]).toMatchObject({ nombre: 'CÓRDOBA', similitud: 100 });
  });

  it('barrios sin buscar (más de 50): vacío y pide buscar', async () => {
    const { datos } = await listar({ catalogo: 'barrios' });
    expect(datos.elementos).toEqual([]);
    expect(datos.busqueda).toMatchObject({ texto: null, totalCatalogo: 64, devueltos: 0 });
    expect(datos.busqueda?.mensaje).toContain('buscar');
  });

  it('segunda búsqueda de otro usuario sale de la caché (llamadasBase 0)', async () => {
    const entorno = preparar();
    await listar({ catalogo: 'barrios', buscar: 'centro' }, entorno);
    const segunda = await listar({ catalogo: 'barrios', buscar: 'alberdi' }, entorno, { ...SESION, codUsuario: 900, codVendedor: 99 });
    expect(segunda.datos.elementos[0]?.nombre).toBe('ALBERDI');
    expect(entorno.llamadas).toHaveLength(1);
    expect(segunda.eventos.find((e) => e.evento === 'invocacion_tool')).toMatchObject({ llamadasBase: 0 });
  });

  it('canales: caché por vendedor', async () => {
    const entorno = preparar();
    await listar({ catalogo: 'canales', buscar: 'web' }, entorno);
    await listar({ catalogo: 'canales', buscar: 'web' }, entorno);
    expect(entorno.llamadas).toHaveLength(1);
    await listar({ catalogo: 'canales', buscar: 'web' }, entorno, { ...SESION, codVendedor: 99 });
    expect(entorno.llamadas).toHaveLength(2);
  });
});
