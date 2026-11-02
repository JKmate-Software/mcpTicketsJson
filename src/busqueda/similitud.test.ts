import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { distanciaOsa, fonetica, normalizar, preparar, puntaje } from './similitud.js';

const UMBRAL = 60;

interface CasoV1 {
  buscado: string;
  valor: string;
  puntaje: number;
  normalizado: string;
  fonetico: string;
}

const referencia = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../test/datos/similitud-v1.json'), 'utf8')) as { casos: CasoV1[] };

describe('mismo puntaje que la v1', () => {
  it(`los ${referencia.casos.length} pares de la tabla de referencia`, () => {
    const distintos = referencia.casos
      .map((c) => ({ ...c, obtenido: puntaje(preparar(c.buscado), preparar(c.valor)) }))
      .filter((c) => c.obtenido !== c.puntaje);
    expect(distintos).toEqual([]);
  });

  it('misma normalización y fonética', () => {
    for (const c of referencia.casos) {
      expect(normalizar(c.buscado)).toBe(c.normalizado);
      expect(preparar(c.buscado).foneticoCompleto).toBe(c.fonetico);
    }
  });
});

// Casos portados de mcp-server/test/McpTicketsServer.Tests/SimilitudTextoTests.cs.
const BARRIOS = [
  'BARRIO SAN MARTÍN', 'VILLA BELGRANO', 'SAN MARTIN', 'CENTRO', 'ALBERDI', 'GENERAL PAZ',
  'NUEVA CÓRDOBA', 'YERBAL', 'VILLA ALLENDE', 'LOS CEIBOS', 'BARRIO JARDÍN', 'SAN VICENTE',
  'COFICO', 'ALTO ALBERDI', 'VILLA CABRERA', 'MARQUÉS DE SOBREMONTE', 'CERRO DE LAS ROSAS',
  'HIPÓLITO YRIGOYEN', 'B° 1° DE MAYO', 'PARQUE CHACABUCO',
];

function ranking(buscado: string) {
  const b = preparar(buscado);
  // Orden estable por puntaje descendente, como OrderByDescending de .NET.
  return BARRIOS.map((nombre) => ({ nombre, puntaje: puntaje(b, preparar(nombre)) })).sort((x, y) => y.puntaje - x.puntaje);
}

describe('similitud (casos de la v1)', () => {
  it.each([
    ['Barrio San Martín', 'BARRIO SAN MARTIN'],
    ['  b° 1° de   Mayo!! ', 'B 1 DE MAYO'],
    ['Ñandú', 'NANDU'],
  ])('normalizar(%j) = %j', (entrada, esperado) => {
    expect(normalizar(entrada)).toBe(esperado);
  });

  it.each([
    ['VELGRANO', 'BELGRANO'],
    ['LLERBAL', 'YERBAL'],
    ['SERRO', 'CERRO'],
    ['IPOLITO', 'HIPOLITO'],
    ['KOFIKO', 'COFICO'],
    ['CHACABUCO', 'CHAKABUKO'],
  ])('fonética iguala %s y %s', (a, b) => {
    expect(fonetica(a)).toBe(fonetica(b));
  });

  it('coincidencia exacta salvo tildes vale 100 y sale primera', () => {
    expect(ranking('barrio san martin')[0]).toEqual({ nombre: 'BARRIO SAN MARTÍN', puntaje: 100 });
  });

  it('nombre mal escrito sale primero y sobre el umbral', () => {
    const [primero, segundo] = ranking('vila velgrano');
    expect(primero?.nombre).toBe('VILLA BELGRANO');
    expect(primero!.puntaje).toBeGreaterThanOrEqual(UMBRAL);
    expect(primero!.puntaje).toBeGreaterThan(segundo!.puntaje);
  });

  it('palabra incompleta encuentra el nombre compuesto', () => {
    expect(puntaje(preparar('martin'), preparar('SAN MARTIN'))).toBeGreaterThanOrEqual(UMBRAL);
  });

  it('palabras en otro orden', () => {
    expect(puntaje(preparar('belgrano villa'), preparar('VILLA BELGRANO'))).toBeGreaterThanOrEqual(90);
  });

  it.each([
    ['serro de las rosas', 'CERRO DE LAS ROSAS'],
    ['ipolito irigoyen', 'HIPÓLITO YRIGOYEN'],
    ['alverdi', 'ALBERDI'],
    ['nueva cordova', 'NUEVA CÓRDOBA'],
    ['marques sobremonte', 'MARQUÉS DE SOBREMONTE'],
    ['1 de mayo', 'B° 1° DE MAYO'],
  ])('error típico %j encuentra %j primero', (buscado, esperado) => {
    const [primero] = ranking(buscado);
    expect(primero?.nombre).toBe(esperado);
    expect(primero!.puntaje).toBeGreaterThanOrEqual(UMBRAL);
  });

  it.each(['zzqx', 'hospital'])('texto sin relación %j queda bajo el umbral', (buscado) => {
    for (const r of ranking(buscado)) expect(r.puntaje, r.nombre).toBeLessThan(UMBRAL);
  });

  it('letra suelta distingue valores', () => {
    const b = preparar('mazana m');
    expect(puntaje(b, preparar('MANZANA M'))).toBeGreaterThan(puntaje(b, preparar('MAZANA C')));
  });

  it('solo la igualdad exacta vale 100', () => {
    expect(puntaje(preparar('villa belgrano'), preparar('VILLA BELGRANO'))).toBe(100);
    expect(puntaje(preparar('belgrano villa'), preparar('VILLA BELGRANO'))).toBeLessThan(100);
  });

  it('token corto con un error no pasa el umbral', () => {
    expect(puntaje(preparar('zzqx'), preparar('MARTIN SIX'))).toBeLessThan(UMBRAL);
  });

  it.each([
    ['CASA', 'CSAA', 1],
    ['KITTEN', 'SITTING', 3],
    ['', 'ABC', 3],
  ])('distanciaOsa(%s, %s) = %i', (a, b, esperado) => {
    expect(distanciaOsa(a, b)).toBe(esperado);
  });
});
