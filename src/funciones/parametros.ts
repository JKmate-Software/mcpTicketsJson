import { z } from 'zod';
import { claimsDeSesion, type Sesion } from '../auth/sesion.js';
import type { ValorParametro } from '../db/firebird.js';
import { ErrorTool } from '../errores.js';
import { aTimestampBase, esFechaIsoParametro } from '../mapeo/fecha.js';
import { esquemaJson } from '../nucleo/esquema-json.js';
import type { EsquemaJson } from '../nucleo/definicion.js';
import { CLAIM_DE_CAMPO, type CampoSesion, type EntradaDatos, type ParametroDato, type TipoParametro } from './esquema.js';

/** Nombre del parámetro virtual de búsqueda aproximada. */
export const PARAMETRO_BUSCAR = 'buscar';
/** `buscar` es un parámetro virtual del servidor (no existe en la base): su texto es fijo, como en la v1. */
const DESCRIPCION_BUSCAR_DEFECTO = 'Texto aproximado (tolera errores de tipeo, tildes y palabras en otro orden). Devuelve los registros más parecidos con su similitud (0-100).';

const iguales = (a: string, b: string) => a.toUpperCase() === b.toUpperCase();

/** Parámetros que el agente ve (sin valor fijo, sin campos de sesión forzados). */
export function parametrosVisibles(entrada: EntradaDatos) {
  const forzados = new Set<string>();
  for (const campo of Object.keys(CLAIM_DE_CAMPO) as CampoSesion[]) {
    const nombre = entrada[campo];
    if (!nombre) continue;
    const parametro = entrada.parametros?.find((p) => iguales(p.nombre, nombre));
    if (campo === 'campoUsuario' || !parametro || parametro.requerido) forzados.add(nombre.toUpperCase());
  }
  return (entrada.parametros ?? []).filter((p) => p.valorFijo === undefined && !forzados.has(p.nombre.toUpperCase()));
}

export const nombreExpuesto = (p: ParametroDato) => p.alias ?? p.nombre;

function zodDeTipo(tipo: TipoParametro): z.ZodType {
  switch (tipo) {
    case 'entero':
      return z.number().int();
    case 'decimal':
      return z.number();
    case 'texto':
      return z.string();
    case 'booleano':
      return z.boolean();
    case 'fecha':
      return z.iso.date({ message: 'Fecha inválida: se espera AAAA-MM-DD' });
    case 'fechaHora':
      return z.string().refine(esFechaIsoParametro, 'Fecha u hora inválida: se espera ISO 8601');
    case 'json':
      return z.union([z.record(z.string(), z.unknown()), z.array(z.unknown())]);
  }
}

/**
 * Validador e inputSchema de una tool procedure/webservice, desde los parámetros visibles del archivo
 * (el mismo zod genera los dos: no se desincronizan). Los textos son los del archivo.
 */
export function esquemaEntradaDatos(entrada: EntradaDatos): { entrada: z.ZodType<Record<string, unknown>>; inputSchema: EsquemaJson } {
  const forma: Record<string, z.ZodType> = {};
  for (const p of parametrosVisibles(entrada)) {
    let campo = zodDeTipo(p.tipo);
    if (p.descripcion) campo = campo.describe(p.descripcion);
    if (p.default !== undefined) campo = campo.default(p.default as never);
    else if (!p.requerido) campo = campo.optional();
    forma[nombreExpuesto(p)] = campo;
  }
  if (entrada.busqueda) forma[PARAMETRO_BUSCAR] = z.string().max(200).describe(DESCRIPCION_BUSCAR_DEFECTO).optional();
  const esquema = z.object(forma).strict();
  return { entrada: esquema as z.ZodType<Record<string, unknown>>, inputSchema: esquemaJson(esquema, 'input') };
}

/** Valor de un parámetro listo para la base: booleanos 1/0, json serializado, fecha-hora en la hora de la base. */
export function aValorBase(valor: unknown, tipo: TipoParametro, zonaHoraria: string): ValorParametro {
  if (valor === undefined || valor === null) return null;
  switch (tipo) {
    case 'booleano':
      return valor === true || valor === 1 || valor === '1' ? 1 : 0;
    case 'json':
      return typeof valor === 'string' ? valor : JSON.stringify(valor);
    case 'fechaHora':
      return typeof valor === 'string' && esFechaIsoParametro(valor) ? aTimestampBase(valor, zonaHoraria) : String(valor);
    case 'entero':
    case 'decimal':
      return typeof valor === 'number' ? valor : Number(valor);
    default:
      return typeof valor === 'string' ? valor : JSON.stringify(valor);
  }
}

/** Campo de sesión (si lo hay) que alimenta a este parámetro. */
function campoDe(entrada: EntradaDatos, parametro: string): CampoSesion | undefined {
  return (Object.keys(CLAIM_DE_CAMPO) as CampoSesion[]).find((c) => entrada[c] && iguales(entrada[c]!, parametro));
}

function claimRequerida(sesion: Sesion, campo: CampoSesion, tool: string): string {
  const clave = CLAIM_DE_CAMPO[campo];
  const valor = claimsDeSesion(sesion)[clave];
  if (valor === '') {
    throw new ErrorTool('NO_AUTORIZADO', `La sesión no tiene ${clave} asociado, que la tool ${tool} necesita. Iniciá sesión con un usuario que lo tenga.`);
  }
  return valor;
}

/**
 * Valores de los parámetros reales (por nombre en MAYÚSCULAS), con las reglas de la v1: valorFijo
 * siempre; campoUsuario y campos de sesión de parámetros requeridos, siempre de la sesión (forzados);
 * los de parámetros no requeridos, del agente o, si no lo mandó, de la sesión (autocompletados).
 */
export function resolverParametros(
  entrada: EntradaDatos,
  args: Record<string, unknown>,
  sesion: Sesion,
  zonaHoraria: string,
): Record<string, ValorParametro> {
  const valores: Record<string, ValorParametro> = {};
  for (const p of entrada.parametros ?? []) {
    const campo = campoDe(entrada, p.nombre);
    let valor: unknown;
    if (p.valorFijo !== undefined) valor = p.valorFijo;
    else if (campo && (campo === 'campoUsuario' || p.requerido)) valor = claimRequerida(sesion, campo, entrada.nombre);
    else {
      valor = args[nombreExpuesto(p)];
      if ((valor === undefined || valor === null || valor === '') && campo) valor = claimRequerida(sesion, campo, entrada.nombre);
    }
    valores[p.nombre.toUpperCase()] = aValorBase(valor, p.tipo, zonaHoraria);
  }
  // campoUsuario puede nombrar un parámetro que no se declaró (como en la v1).
  if (entrada.campoUsuario && !(entrada.campoUsuario.toUpperCase() in valores)) {
    valores[entrada.campoUsuario.toUpperCase()] = Number(claimRequerida(sesion, 'campoUsuario', entrada.nombre));
  }
  return valores;
}
