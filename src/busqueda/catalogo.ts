import { preparar, puntaje, type TextoPreparado } from './similitud.js';

/** Defaults de la v1 (BusquedaConfig): mismos números para que los dos servidores respondan igual. */
export const UMBRAL_DEFECTO = 60;
export const MAX_RESULTADOS_DEFECTO = 10;
export const MAX_SIN_BUSQUEDA_DEFECTO = 50;
export const MAX_FILAS_CACHE_DEFECTO = 200_000;

/** Filas de un catálogo con sus textos preparados una sola vez (se reusan entre búsquedas). */
export class CatalogoPreparado<T> {
  private readonly preparadosPorCampo = new Map<string, TextoPreparado[]>();

  constructor(readonly filas: readonly T[]) {}

  preparados(campo: string, texto: (fila: T) => string | null | undefined): TextoPreparado[] {
    let preparados = this.preparadosPorCampo.get(campo);
    if (!preparados) {
      preparados = this.filas.map((f) => preparar(texto(f)));
      this.preparadosPorCampo.set(campo, preparados);
    }
    return preparados;
  }
}

export interface CampoBusqueda<T> {
  nombre: string;
  texto(fila: T): string | null | undefined;
}

export interface MetadatosBusqueda {
  texto: string | null;
  totalCatalogo: number;
  devueltos: number;
  mensaje: string | null;
}

export interface ResultadoBusqueda<T> {
  elementos: (T & { similitud?: number })[];
  busqueda: MetadatosBusqueda;
}

export interface OpcionesBusqueda {
  umbral?: number;
  maxResultados?: number;
  maxSinBusqueda?: number;
  /** Nombre del parámetro que el agente tiene que usar, para el mensaje. */
  parametro?: string;
}

/**
 * Sin texto: devuelve todo si no supera `maxSinBusqueda`; si lo supera, lista vacía y un mensaje
 * pidiendo buscar. Con texto: puntúa cada fila (mejor puntaje entre los campos), filtra por umbral,
 * ordena por puntaje (estable: a igual puntaje, el orden del procedure) y corta en `maxResultados`.
 * Las filas cacheadas nunca se modifican: cada elemento devuelto es una copia.
 */
export function aplicarBusqueda<T extends object>(
  catalogo: CatalogoPreparado<T>,
  campos: readonly CampoBusqueda<T>[],
  buscar: string | undefined,
  opciones: OpcionesBusqueda = {},
): ResultadoBusqueda<T> {
  const umbral = opciones.umbral ?? UMBRAL_DEFECTO;
  const maxResultados = opciones.maxResultados ?? MAX_RESULTADOS_DEFECTO;
  const maxSinBusqueda = opciones.maxSinBusqueda ?? MAX_SIN_BUSQUEDA_DEFECTO;
  const parametro = opciones.parametro ?? 'buscar';
  const total = catalogo.filas.length;
  const texto = buscar?.trim() ? buscar.trim() : null;

  if (texto === null) {
    if (total <= maxSinBusqueda) {
      return { elementos: catalogo.filas.map((f) => ({ ...f })), busqueda: { texto, totalCatalogo: total, devueltos: total, mensaje: null } };
    }
    return {
      elementos: [],
      busqueda: {
        texto,
        totalCatalogo: total,
        devueltos: 0,
        mensaje: `El catálogo tiene ${total} registros, demasiados para devolverlos completos. Volvé a llamar con ${parametro} y el nombre aproximado (tolera errores de tipeo).`,
      },
    };
  }

  const buscado = preparar(texto);
  const porCampo = campos.map((c) => catalogo.preparados(c.nombre, c.texto));
  const candidatos: { indice: number; puntaje: number }[] = [];
  for (let i = 0; i < total; i++) {
    let mejor = 0;
    for (const preparados of porCampo) mejor = Math.max(mejor, puntaje(buscado, preparados[i]!));
    if (mejor >= umbral) candidatos.push({ indice: i, puntaje: mejor });
  }
  // Array.prototype.sort es estable: a igual puntaje se respeta el orden original.
  const elementos = candidatos
    .sort((a, b) => b.puntaje - a.puntaje)
    .slice(0, maxResultados)
    .map((c) => ({ ...catalogo.filas[c.indice]!, similitud: c.puntaje }));

  return {
    elementos,
    busqueda: {
      texto,
      totalCatalogo: total,
      devueltos: elementos.length,
      mensaje:
        elementos.length === 0
          ? `No hubo coincidencias para "${texto}" entre ${total} registros. Probá con otra forma de escribirlo (menos palabras, sin abreviaturas) o consultá al usuario.`
          : null,
    },
  };
}

interface EntradaCache {
  vence: number;
  filas: number;
  promesa: Promise<CatalogoPreparado<unknown>>;
}

/**
 * Caché en memoria del catálogo completo, por clave (catálogo + parámetros + alcance). Las
 * ejecuciones concurrentes de una misma clave comparten la misma promesa. Un error no queda
 * cacheado. Tope total de filas: al pasarlo, se descartan las entradas más viejas.
 */
export class CacheCatalogos {
  private readonly entradas = new Map<string, EntradaCache>();

  constructor(
    private readonly maxFilas = MAX_FILAS_CACHE_DEFECTO,
    private readonly ahora: () => number = Date.now,
  ) {}

  async obtener<T>(clave: string, minutos: number, ejecutar: () => Promise<T[]>): Promise<CatalogoPreparado<T>> {
    if (minutos <= 0) return new CatalogoPreparado(await ejecutar());

    const existente = this.entradas.get(clave);
    if (existente && existente.vence > this.ahora()) return existente.promesa as Promise<CatalogoPreparado<T>>;

    const entrada: EntradaCache = {
      vence: this.ahora() + minutos * 60_000,
      filas: 1,
      promesa: ejecutar().then((filas) => new CatalogoPreparado<unknown>(filas)),
    };
    this.entradas.delete(clave);
    this.entradas.set(clave, entrada);
    try {
      const catalogo = await entrada.promesa;
      entrada.filas = Math.max(1, catalogo.filas.length);
      this.recortar();
      return catalogo as CatalogoPreparado<T>;
    } catch (error) {
      if (this.entradas.get(clave) === entrada) this.entradas.delete(clave);
      throw error;
    }
  }

  private recortar() {
    let total = 0;
    for (const e of this.entradas.values()) total += e.filas;
    for (const [clave, e] of this.entradas) {
      if (total <= this.maxFilas) break;
      this.entradas.delete(clave);
      total -= e.filas;
    }
  }
}

/** Clave de caché: valores con largo prefijado, así un valor con separadores no fabrica una clave ajena. */
export function claveCache(catalogo: string, parametros: readonly (string | number | null)[], alcance: string): string {
  const partes = parametros.map((p) => (p === null ? '-1:' : `${String(p).length}:${p}`));
  return `${catalogo}|${partes.join(';')}|${alcance}`;
}
