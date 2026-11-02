import type { EsquemaJson } from '../nucleo/definicion.js';
import type { ParametroTexto } from './esquema.js';

/** Error de un archivo de funciones: siempre nombra la tool y el campo con problemas. */
export class ErrorFunciones extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorFunciones';
  }
}

/** "cotizar_planes_prevision" → "Cotizar planes prevision" (igual que la v1). */
export function tituloDesdeNombre(nombre: string): string {
  const texto = nombre.split('_').filter(Boolean).join(' ');
  return texto ? texto[0]!.toUpperCase() + texto.slice(1) : nombre;
}

type Nodo = Record<string, unknown>;
const esObjeto = (v: unknown): v is Nodo => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Propiedades de un nodo de schema: las propias y las de sus items (arrays de objetos), por ruta con punto. */
function propiedades(nodo: Nodo, prefijo = ''): Map<string, Nodo> {
  const rutas = new Map<string, Nodo>();
  const visitar = (n: Nodo, base: string) => {
    if (esObjeto(n.properties)) {
      for (const [clave, valor] of Object.entries(n.properties)) {
        if (!esObjeto(valor)) continue;
        const ruta = base ? `${base}.${clave}` : clave;
        rutas.set(ruta, valor);
        visitar(valor, ruta);
      }
    }
    if (esObjeto(n.items)) visitar(n.items, base);
  };
  visitar(nodo, prefijo);
  return rutas;
}

/** Rutas de las propiedades del inputSchema que traen `description` (no puede haber: los textos van en el archivo). */
export function descripcionesEnCodigo(inputSchema: EsquemaJson): string[] {
  return [...propiedades(inputSchema)].filter(([, nodo]) => 'description' in nodo).map(([ruta]) => ruta);
}

/** Rutas de todas las propiedades del inputSchema. */
export function rutasPropiedades(inputSchema: EsquemaJson): string[] {
  return [...propiedades(inputSchema).keys()];
}

/**
 * Copia del inputSchema con la descripción de cada propiedad tomada del archivo. La descripción se
 * agrega al final de la propiedad, como la dejaba `.describe()` de zod.
 */
export function aplicarDescripciones(inputSchema: EsquemaJson, parametros: readonly ParametroTexto[], tool: string): EsquemaJson {
  // Por JSON y no structuredClone: el código reusa nodos (dos propiedades con el mismo objeto) y cada una lleva su texto.
  const copia = JSON.parse(JSON.stringify(inputSchema)) as Nodo;
  const rutas = propiedades(copia);
  for (const p of parametros) {
    const nodo = rutas.get(p.nombre);
    if (!nodo) {
      throw new ErrorFunciones(
        `Tool '${tool}': el parámetro '${p.nombre}' no existe en la tool (propiedades: ${[...rutas.keys()].join(', ') || 'ninguna'}).`,
      );
    }
    nodo.description = p.descripcion;
  }
  return copia;
}
