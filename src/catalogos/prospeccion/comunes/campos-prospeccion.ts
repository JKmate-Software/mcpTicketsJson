import { z } from 'zod';
import type { Sesion } from '../../../auth/sesion.js';
import { ErrorTool } from '../../../errores.js';
import { esFechaIsoParametro } from '../../../mapeo/fecha.js';
import type { DependenciasFunciones } from '../../../funciones/tipos.js';

export type DependenciasProspeccion = DependenciasFunciones;

export { ANOTACIONES_ESCRITURA, ANOTACIONES_LECTURA, esquemaJson } from '../../../nucleo/esquema-json.js';

export const codigo = () => z.number().int().positive();
export const fecha = () => z.iso.date({ message: 'Fecha inválida: se espera AAAA-MM-DD' });
export const fechaHora = () =>
  z.string().refine(esFechaIsoParametro, 'Fecha u hora inválida: se espera ISO 8601 (AAAA-MM-DD o AAAA-MM-DDTHH:mm[:ss][offset])');
export const texto = (max: number) => z.string().trim().min(1).max(max);

/** COD_VENDEDOR de la sesión. El catálogo lo exige al arrancar (stdio) y en cada token (http). */
export function vendedorRequerido(sesion: Sesion): number {
  if (sesion.codVendedor === null) throw new ErrorTool('ERROR_INTERNO', 'La sesión no tiene un vendedor asociado.');
  return sesion.codVendedor;
}

export const enteroONull = (valor: unknown): number | null => (valor === null || valor === undefined || valor === '' ? null : Number(valor));

export const textoONull = (valor: unknown): string | null => {
  if (valor === null || valor === undefined) return null;
  const limpio = String(valor).trim();
  return limpio ? limpio : null;
};

export const plural = (cantidad: number, singular: string, pluralTexto = `${singular}s`) =>
  `${cantidad} ${cantidad === 1 ? singular : pluralTexto}`;

// Campos de salida compartidos por las consultas.
export const fechaHoraSalida = z.string().nullable().describe('ISO 8601 con offset');
export const fechaSalida = z.string().nullable().describe('AAAA-MM-DD');
export const entero = z.number().int();
/** Fecha ancla de resumen y totales (AAAA-MM-DD); sin valor, hoy. */
export const fechaReferencia = fecha().optional();
