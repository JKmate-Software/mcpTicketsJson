import { describe, expect, it } from 'vitest';
import { aplicarBusqueda, CacheCatalogos, CatalogoPreparado, claveCache, type CampoBusqueda } from './catalogo.js';

interface Barrio {
  codigo: number;
  nombre: string;
  zona: number;
}

const POR_NOMBRE: CampoBusqueda<Barrio>[] = [{ nombre: 'nombre', texto: (b) => b.nombre }];

function catalogo(cantidadExtra = 0) {
  const filas: Barrio[] = [
    { codigo: 1, nombre: 'VILLA BELGRANO', zona: 7 },
    { codigo: 2, nombre: 'CENTRO', zona: 7 },
    { codigo: 3, nombre: 'BELGRANO NORTE', zona: 8 },
  ];
  for (let i = 0; i < cantidadExtra; i++) filas.push({ codigo: 100 + i, nombre: `LOTEO ${i}`, zona: 9 });
  return new CatalogoPreparado(filas);
}

// Casos portados de mcp-server/test/McpTicketsServer.Tests/BusquedaPostProcesoTests.cs.
describe('aplicarBusqueda', () => {
  it('con búsqueda devuelve el top ordenado con similitud y metadatos', () => {
    const r = aplicarBusqueda(catalogo(), POR_NOMBRE, 'vila velgrano');
    expect(r.elementos[0]?.codigo).toBe(1);
    expect(r.elementos[0]!.similitud).toBeGreaterThanOrEqual(60);
    expect(r.elementos.some((e) => e.nombre === 'CENTRO')).toBe(false);
    expect(r.busqueda).toMatchObject({ texto: 'vila velgrano', totalCatalogo: 3, devueltos: r.elementos.length, mensaje: null });
  });

  it('respeta el tope de resultados', () => {
    expect(aplicarBusqueda(catalogo(), POR_NOMBRE, 'belgrano', { maxResultados: 1 }).elementos).toHaveLength(1);
  });

  it('sin coincidencias: lista vacía y mensaje', () => {
    const r = aplicarBusqueda(catalogo(), POR_NOMBRE, 'zzqx');
    expect(r.elementos).toEqual([]);
    expect(r.busqueda.mensaje).toContain('No hubo coincidencias');
  });

  it('sin búsqueda, catálogo chico: devuelve todo', () => {
    const r = aplicarBusqueda(catalogo(), POR_NOMBRE, undefined);
    expect(r.elementos).toHaveLength(3);
    expect(r.busqueda.mensaje).toBeNull();
  });

  it('sin búsqueda (o solo espacios), catálogo grande: vacío y pide buscar', () => {
    const r = aplicarBusqueda(catalogo(1497), POR_NOMBRE, '  ');
    expect(r.elementos).toEqual([]);
    expect(r.busqueda.mensaje).toContain('1500');
    expect(r.busqueda.mensaje).toContain('buscar');
    expect(r.busqueda.texto).toBeNull();
  });

  it('no modifica las filas cacheadas y se puede repetir', () => {
    const c = catalogo();
    aplicarBusqueda(c, POR_NOMBRE, 'centro');
    aplicarBusqueda(c, POR_NOMBRE, 'centro');
    expect(c.filas[1]).not.toHaveProperty('similitud');
  });

  it('a igual puntaje respeta el orden del procedure', () => {
    const c = new CatalogoPreparado([
      { codigo: 1, nombre: 'SAN MARTIN', zona: 0 },
      { codigo: 2, nombre: 'SAN MARTIN', zona: 0 },
    ]);
    expect(aplicarBusqueda(c, POR_NOMBRE, 'san martin').elementos.map((e) => e.codigo)).toEqual([1, 2]);
  });
});

describe('CacheCatalogos', () => {
  it('dentro de la vigencia no vuelve a ejecutar; vencida, sí', async () => {
    let t = 0;
    let ejecuciones = 0;
    const cache = new CacheCatalogos(1000, () => t);
    const ejecutar = async () => {
      ejecuciones++;
      return [{ codigo: 1 }];
    };
    await cache.obtener('k', 60, ejecutar);
    await cache.obtener('k', 60, ejecutar);
    expect(ejecuciones).toBe(1);
    t = 60 * 60_000 + 1;
    await cache.obtener('k', 60, ejecutar);
    expect(ejecuciones).toBe(2);
  });

  it('ejecuciones concurrentes de la misma clave comparten la consulta', async () => {
    let ejecuciones = 0;
    const cache = new CacheCatalogos();
    const ejecutar = async () => {
      ejecuciones++;
      await new Promise((r) => setTimeout(r, 10));
      return [{ codigo: 1 }];
    };
    await Promise.all([cache.obtener('k', 60, ejecutar), cache.obtener('k', 60, ejecutar)]);
    expect(ejecuciones).toBe(1);
  });

  it('un error no queda cacheado', async () => {
    const cache = new CacheCatalogos();
    await expect(cache.obtener('k', 60, async () => Promise.reject(new Error('base caída')))).rejects.toThrow('base caída');
    const c = await cache.obtener('k', 60, async () => [{ codigo: 1 }]);
    expect(c.filas).toHaveLength(1);
  });

  it('sin minutos de caché ejecuta siempre', async () => {
    let ejecuciones = 0;
    const cache = new CacheCatalogos();
    const ejecutar = async () => {
      ejecuciones++;
      return [];
    };
    await cache.obtener('k', 0, ejecutar);
    await cache.obtener('k', 0, ejecutar);
    expect(ejecuciones).toBe(2);
  });

  it('al pasar el tope de filas descarta las entradas más viejas', async () => {
    let ejecuciones = 0;
    const cache = new CacheCatalogos(5);
    const tres = async () => {
      ejecuciones++;
      return [1, 2, 3];
    };
    await cache.obtener('a', 60, tres);
    await cache.obtener('b', 60, tres); // 6 filas > 5: se descarta 'a'
    await cache.obtener('b', 60, tres);
    expect(ejecuciones).toBe(2);
    await cache.obtener('a', 60, tres);
    expect(ejecuciones).toBe(3);
  });

  it('claveCache distingue valores con separadores', () => {
    expect(claveCache('c', ['a;1', null], 'global')).not.toBe(claveCache('c', ['a', '1'], 'global'));
  });
});
