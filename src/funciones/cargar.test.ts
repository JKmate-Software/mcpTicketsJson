import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { accesoSimulado, conectarCliente, loggerEnMemoria } from '../../test/apoyo.js';
import { CacheCatalogos } from '../busqueda/catalogo.js';
import { handler as obtenerInstrucciones } from '../catalogos/obtener-instrucciones.js';
import { handler as userInfo } from '../catalogos/user-info.js';
import { completarSesion as completarSesionTickets } from '../comunes/completar-sesion-tickets.js';
import { ANOTACIONES_LECTURA, esquemaJson } from '../nucleo/esquema-json.js';
import { construirCatalogo, leerArchivoFunciones } from './cargar.js';
import { DIR_FUNCIONES } from './esquema-publicado.js';
import { crearRegistroTools } from './registro-tools.js';
import type { RegistroHandlers } from './tipos.js';

const deps = () => ({ acceso: accesoSimulado({}).acceso, zonaHoraria: 'America/Argentina/Buenos_Aires', cache: new CacheCatalogos() });

const entrada = z.object({ texto: z.string().optional(), limite: z.number().int().default(20) }).strict();
const REGISTRO_PRUEBA: RegistroHandlers = {
  handlers: {
    'user-info': userInfo,
    'obtener-instrucciones': obtenerInstrucciones,
    'prueba-eco': {
      crear: () => ({
        inputSchema: esquemaJson(entrada, 'input'),
        outputSchema: esquemaJson(z.object({ texto: z.string() }), 'output'),
        annotations: ANOTACIONES_LECTURA,
        entrada,
        async ejecutar(a: z.infer<typeof entrada>) {
          return { datos: { texto: a.texto ?? '' }, resumen: a.texto ?? '' };
        },
      }),
    },
    'prueba-con-texto-en-codigo': {
      crear: () => ({
        inputSchema: esquemaJson(z.object({ limite: z.number().describe('Máximo') }), 'input'),
        outputSchema: { type: 'object' },
        annotations: ANOTACIONES_LECTURA,
        entrada: z.object({}),
        async ejecutar() {
          return { datos: {}, resumen: '' };
        },
      }),
    },
  },
  completarSesion: { 'completar-sesion-tickets': completarSesionTickets },
};

/** Escribe un archivo de funciones en una carpeta temporal y devuelve su ruta. */
function archivoTemporal(contenido: unknown, extras: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'funciones-'));
  for (const [nombre, texto] of Object.entries(extras)) writeFileSync(join(dir, nombre), texto);
  const ruta = join(dir, 'prueba-functions.json');
  writeFileSync(ruta, typeof contenido === 'string' ? contenido : JSON.stringify(contenido));
  return ruta;
}

const servidor = { nombre: 'mcp-prueba', claimRequerida: 'COD_USUARIO' };
const eco = (extra: Record<string, unknown> = {}) => ({ tipo: 'compleja', nombre: 'eco', handler: 'prueba-eco', descripcion: 'Repite el texto.', ...extra });

function cargar(contenido: unknown, extras?: Record<string, string>) {
  const ruta = archivoTemporal(contenido, extras);
  return construirCatalogo(leerArchivoFunciones(ruta), ruta, REGISTRO_PRUEBA, deps());
}

describe('carga del archivo de funciones', () => {
  it('servidor y tools salen del archivo; el título se genera desde el nombre', async () => {
    const catalogo = cargar({ servidor, tools: [eco({ nombre: 'cotizar_planes_prevision' })] });
    const { cliente } = await conectarCliente(catalogo.tools, undefined, catalogo.servidor.nombre);
    expect(cliente.getServerVersion()?.name).toBe('mcp-prueba');
    const [tool] = (await cliente.listTools()).tools;
    expect(tool).toMatchObject({ name: 'cotizar_planes_prevision', title: 'Cotizar planes prevision', description: 'Repite el texto.' });
  });

  it('la descripción de un parámetro sale del archivo', () => {
    const catalogo = cargar({ servidor, tools: [eco({ parametros: [{ nombre: 'texto', descripcion: 'Busca en título y mensajes' }] })] });
    const propiedades = catalogo.tools[0]!.inputSchema.properties as Record<string, { description?: string }>;
    expect(propiedades.texto?.description).toBe('Busca en título y mensajes');
    expect(propiedades.limite?.description).toBeUndefined();
  });

  it.each([
    ['tool duplicada', { servidor, tools: [eco(), eco()] }, /'eco'.*repetido/],
    ['handler inexistente', { servidor, tools: [eco({ handler: 'no-existe' })] }, /'no-existe' no existe.*disponibles:.*prueba-eco/],
    ['handler que no es un nombre de archivo', { servidor, tools: [eco({ handler: '../db/firebird' })] }, /handler.*minúsculas con guiones/],
    ['parámetro desconocido', { servidor, tools: [eco({ parametros: [{ nombre: 'noExiste', descripcion: 'x' }] })] }, /'eco'.*'noExiste'/],
    ['descripción escrita en el código', { servidor, tools: [eco({ handler: 'prueba-con-texto-en-codigo' })] }, /prueba-con-texto-en-codigo.*limite/],
    ['obtener_instrucciones sin instrucciones', { servidor, tools: [eco({ handler: 'obtener-instrucciones' })] }, /servidor\.instrucciones/],
    ['nombre que no es snake_case', { servidor, tools: [eco({ nombre: 'Eco' })] }, /snake_case/],
    ['claim desconocida', { servidor: { ...servidor, claimRequerida: 'COD_X' }, tools: [eco()] }, /claimRequerida/],
    ['completarSesion inexistente', { servidor: { ...servidor, completarSesion: 'x-y' }, tools: [eco()] }, /completarSesion.*'x-y' no existe.*completar-sesion-tickets/],
  ])('%s invalida el archivo', (_caso, contenido, error) => {
    expect(() => cargar(contenido)).toThrow(error);
  });

  it('un JSON mal formado se informa con la ruta', () => {
    expect(() => cargar('{ "servidor": ')).toThrow(/No se pudo leer .*prueba-functions\.json/);
  });

  it('instrucciones: las lee al lado del archivo; obtener_instrucciones las devuelve', async () => {
    const catalogo = cargar(
      { servidor: { ...servidor, instrucciones: 'guia.md' }, tools: [eco({ nombre: 'obtener_instrucciones', handler: 'obtener-instrucciones' })] },
      { 'guia.md': 'Leeme primero.' },
    );
    expect(catalogo.instrucciones).toBe('Leeme primero.');
    const { cliente } = await conectarCliente(catalogo.tools);
    const r = await cliente.callTool({ name: 'obtener_instrucciones', arguments: {} });
    expect(r.structuredContent).toEqual({ instrucciones: 'Leeme primero.' });
  });

  it('user_info común devuelve todas las claves de identidad de la sesión', async () => {
    const catalogo = cargar({ servidor, tools: [eco({ nombre: 'user_info', handler: 'user-info' })] });
    const sesion = { codUsuario: null, codDesarrollador: null, codVendedor: 12, transporte: 'http' as const, claims: { COD_CLIENTE: '77' } };
    const { cliente } = await conectarCliente(catalogo.tools, sesion);
    const r = await cliente.callTool({ name: 'user_info', arguments: {} });
    expect(r.structuredContent).toMatchObject({ codVendedor: 12, codCliente: 77, codUsuario: null, transporte: 'http' });
  });
});

describe('textos fuera del código fuente', () => {
  /** Todos los .ts de src/ que no son tests. */
  function fuentes(dir = resolve(import.meta.dirname, '..')): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? fuentes(join(dir, e.name)) : e.name.endsWith('.ts') && !e.name.endsWith('.test.ts') ? [join(dir, e.name)] : [],
    );
  }

  it('ninguna descripción de tool o parámetro publicada aparece en src/', () => {
    const codigo = fuentes().map((f) => readFileSync(f, 'utf8')).join('\n');
    const textos = readdirSync(DIR_FUNCIONES)
      .filter((f) => f.endsWith('-functions.json'))
      .flatMap((f) => leerArchivoFunciones(join(DIR_FUNCIONES, f)).tools)
      .flatMap((t) => [t.descripcion, ...(t.parametros ?? []).map((p) => p.descripcion)])
      .filter((t): t is string => typeof t === 'string' && t.length > 25);
    expect(textos.length).toBeGreaterThan(50);
    expect(textos.filter((t) => codigo.includes(t))).toEqual([]);
  });
});

describe('recarga en caliente', () => {
  const contenido = (descripcion: string) => ({ servidor, tools: [eco({ descripcion })] });

  it('una tool editada se ve sin reiniciar; una edición inválida deja la versión anterior', async () => {
    const ruta = archivoTemporal(contenido('Versión 1.'));
    const { logger, eventos } = loggerEnMemoria();
    const registro = await crearRegistroTools(ruta, async (r) => construirCatalogo(leerArchivoFunciones(r), r, REGISTRO_PRUEBA, deps()), logger, { vigilar: false });
    const tomada = registro.actual();

    writeFileSync(ruta, JSON.stringify(contenido('Versión 2.')));
    expect(await registro.recargar()).toBe(true);
    expect(registro.actual().tools[0]!.descripcion).toBe('Versión 2.');
    expect(tomada.tools[0]!.descripcion).toBe('Versión 1.');

    writeFileSync(ruta, '{ "servidor": ');
    expect(await registro.recargar()).toBe(false);
    expect(registro.actual().tools[0]!.descripcion).toBe('Versión 2.');
    expect(eventos.find((e) => e.evento === 'funciones_invalidas')).toMatchObject({ level: 50 });
  });

  it('vigila el archivo en disco', async () => {
    const ruta = archivoTemporal(contenido('Antes.'));
    const registro = await crearRegistroTools(ruta, async (r) => construirCatalogo(leerArchivoFunciones(r), r, REGISTRO_PRUEBA, deps()), loggerEnMemoria().logger, {
      esperaMs: 20,
    });
    try {
      writeFileSync(ruta, JSON.stringify(contenido('Después.')));
      const limite = Date.now() + 5_000;
      while (registro.actual().tools[0]!.descripcion !== 'Después.' && Date.now() < limite) await new Promise((r) => setTimeout(r, 25));
      expect(registro.actual().tools[0]!.descripcion).toBe('Después.');
    } finally {
      registro.cerrar();
    }
  });
});
