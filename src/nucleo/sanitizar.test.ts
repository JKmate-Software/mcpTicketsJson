import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { conectarCliente } from '../../test/apoyo.js';
import { ANOTACIONES_LECTURA, esquemaJson } from './esquema-json.js';
import { sanitizarArgumentos, sanitizarTexto } from './sanitizar.js';

describe('sanitización de la entrada', () => {
  it.each([
    ['Hola <script>alert(1)</script>', 'Hola '],
    ['<img src=x onerror=alert(1)>Ana', 'Ana'],
    ['<a href="javascript:alert(1)">ver</a> ficha', 'ver ficha'],
    ['<b>Pérez</b> & Hijos', 'Pérez & Hijos'],
    ['<style>body{}</style>Texto', 'Texto'],
    ['&#60;script&#62;alert(1)&#60;/script&#62;Hola', 'Hola'],
    ['&#x3C;img src=x onerror=alert(1)&#x3E;Ana', 'Ana'],
  ])('%s → %s', (entrada, esperado) => {
    expect(sanitizarTexto(entrada)).toBe(esperado);
  });

  it.each(['Pérez & Hijos', 'monto < 500', 'a > b y c <= d', '&lt;script&gt;', 'O\'Brien "el gordo"', 'línea 1\nlínea 2'])(
    'texto común intacto: %s',
    (texto) => {
      expect(sanitizarTexto(texto)).toBe(texto);
    },
  );

  it('recorre objetos y arrays anidados', () => {
    const limpio = sanitizarArgumentos({ titular: { nombre: '<img src=x onerror=alert(1)>Ana' }, notas: ['ok', '<script>x</script>bien'] });
    expect(limpio).toEqual({ titular: { nombre: 'Ana' }, notas: ['ok', 'bien'] });
  });

  it('sanitiza un JSON que viene como texto y lo vuelve a serializar', () => {
    const limpio = sanitizarArgumentos({ P_JSON: '{"titular":{"nombre":"<img src=x onerror=alert(1)>Ana"},"edad":30}' }) as { P_JSON: string };
    expect(JSON.parse(limpio.P_JSON)).toEqual({ titular: { nombre: 'Ana' }, edad: 30 });
  });

  it('un JSON en texto sin marcado queda igual, con su formato', () => {
    const texto = '{ "a": 1,\n  "b": "x" }';
    expect(sanitizarArgumentos({ P_JSON: texto })).toEqual({ P_JSON: texto });
  });

  it('respeta las propiedades excluidas (también anidadas)', () => {
    expect(sanitizarArgumentos({ html: '<b>hola</b>', otro: '<b>hola</b>' }, ['html'])).toEqual({ html: '<b>hola</b>', otro: 'hola' });
    expect(sanitizarArgumentos({ a: { b: '<b>x</b>' } }, ['a.b'])).toEqual({ a: { b: '<b>x</b>' } });
  });

  it('se aplica a toda tool antes del handler, salvo sanitizar: false', async () => {
    const entrada = z.object({ mensaje: z.string(), html: z.string().optional() }).strict();
    const recibidos: unknown[] = [];
    const tool = {
      nombre: 'eco',
      titulo: 'Eco',
      descripcion: 'x',
      inputSchema: esquemaJson(entrada, 'input'),
      outputSchema: { type: 'object' },
      annotations: ANOTACIONES_LECTURA,
      entrada,
      noSanitizar: ['html'],
      async ejecutar(a: z.infer<typeof entrada>) {
        recibidos.push(a);
        return { datos: {}, resumen: '' };
      },
    };
    const { cliente } = await conectarCliente([tool]);
    await cliente.callTool({ name: 'eco', arguments: { mensaje: 'Hola <script>alert(1)</script>', html: '<b>hola</b>' } });
    expect(recibidos).toEqual([{ mensaje: 'Hola ', html: '<b>hola</b>' }]);
  });
});
