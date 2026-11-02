import { z } from 'zod';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { EsquemaJson } from './definicion.js';

export const ANOTACIONES_LECTURA: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export const ANOTACIONES_ESCRITURA: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};

const MAX_ENTERO_SEGURO = Number.MAX_SAFE_INTEGER;

/** Quita lo que zod agrega por las suyas y no le sirve al agente ($schema, el tope de entero seguro). */
function limpiar(nodo: unknown): unknown {
  if (Array.isArray(nodo)) return nodo.map(limpiar);
  if (!nodo || typeof nodo !== 'object') return nodo;
  const salida: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries(nodo)) {
    if (clave === '$schema') continue;
    if (clave === 'maximum' && valor === MAX_ENTERO_SEGURO) continue;
    salida[clave] = limpiar(valor);
  }
  return salida;
}

/**
 * JSON Schema publicado a partir del esquema zod: así el inputSchema y el validador real no se
 * desincronizan (las tools de tickets los escriben a mano; acá son muchas y con muchos campos).
 */
export function esquemaJson(esquema: z.ZodType, io: 'input' | 'output'): EsquemaJson {
  return limpiar(z.toJSONSchema(esquema, { io, unrepresentable: 'any' })) as EsquemaJson;
}
