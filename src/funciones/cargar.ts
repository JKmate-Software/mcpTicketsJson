import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { z } from 'zod';
import { construirAgrupadora } from './agrupadora.js';
import { construirToolDatos } from './datos.js';
import { parametrosVisibles } from './parametros.js';
import { CLAIM_DE_CAMPO, esquemaArchivoFunciones, type ArchivoFunciones, type CampoSesion, type EntradaAgrupadora, type EntradaCompleja, type EntradaDatos } from './esquema.js';
import { aplicarDescripciones, descripcionesEnCodigo, ErrorFunciones, tituloDesdeNombre } from './textos.js';
import type { CatalogoCargado, CualquierTool, DependenciasFunciones, RegistroHandlers, ToolDatosConstruida, ToolSinTextos } from './tipos.js';

/** Un problema de zod en palabras: ruta con el nombre de la tool cuando se puede. */
function describirProblema(archivo: unknown, problema: z.core.$ZodIssue): string {
  const [seccion, indice, ...resto] = problema.path;
  if (seccion === 'tools' && typeof indice === 'number') {
    const tools = (archivo as { tools?: { nombre?: unknown }[] }).tools;
    const nombre = tools?.[indice]?.nombre;
    const donde = typeof nombre === 'string' ? `tool '${nombre}'` : `tools[${indice}]`;
    return `${donde}${resto.length ? `, ${resto.join('.')}` : ''}: ${problema.message}`;
  }
  return `${problema.path.join('.') || '(raíz)'}: ${problema.message}`;
}

/** Lee y valida la estructura del archivo. Los errores nombran la tool y el campo. */
export function leerArchivoFunciones(ruta: string): ArchivoFunciones {
  let crudo: unknown;
  try {
    crudo = JSON.parse(readFileSync(ruta, 'utf8'));
  } catch (error) {
    throw new ErrorFunciones(`No se pudo leer ${ruta}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const resultado = esquemaArchivoFunciones.safeParse(crudo);
  if (!resultado.success) {
    throw new ErrorFunciones(`Archivo de funciones inválido (${ruta}): ${resultado.error.issues.map((i) => describirProblema(crudo, i)).join('; ')}`);
  }
  return resultado.data;
}

const iguales = (a: string, b: string) => a.toUpperCase() === b.toUpperCase();

/** Validaciones de una tool procedure/webservice que no necesitan la base. */
function validarDatos(entrada: EntradaDatos, nombres: Set<string>) {
  const t = `Tool '${entrada.nombre}'`;
  const parametros = entrada.parametros ?? [];
  const existe = (nombre: string) => parametros.some((p) => iguales(p.nombre, nombre));

  const vistos = new Set<string>();
  for (const p of parametros) {
    const expuesto = (p.alias ?? p.nombre).toUpperCase();
    if (vistos.has(expuesto)) throw new ErrorFunciones(`${t}: el parámetro '${p.alias ?? p.nombre}' está repetido.`);
    vistos.add(expuesto);
  }
  for (const campo of Object.keys(CLAIM_DE_CAMPO) as CampoSesion[]) {
    const nombre = entrada[campo];
    if (nombre && campo !== 'campoUsuario' && !existe(nombre)) {
      throw new ErrorFunciones(`${t}: '${campo}' = '${nombre}' no está entre sus 'parametros' (declararlo, con requerido true para el modo forzado).`);
    }
  }
  if (entrada.busqueda && parametros.some((p) => iguales(p.alias ?? p.nombre, 'buscar') || iguales(p.nombre, 'buscar'))) {
    throw new ErrorFunciones(`${t}: declara 'busqueda' y además un parámetro 'buscar': el nombre está reservado para el texto de búsqueda.`);
  }
  if (entrada.padre && !entrada.grupo) throw new ErrorFunciones(`${t}: 'padre' solo aplica a variantes de un grupo (falta 'grupo').`);
  if (entrada.padre && !existe(entrada.padre.parametro)) {
    throw new ErrorFunciones(`${t}: 'padre.parametro' = '${entrada.padre.parametro}' no está entre sus 'parametros'.`);
  }
  if (entrada.grupo) {
    if (!nombres.has(entrada.grupo)) throw new ErrorFunciones(`${t}: el grupo '${entrada.grupo}' no existe (falta una tool "tipo": "agrupadora" con ese nombre).`);
    if (entrada.escritura) throw new ErrorFunciones(`${t}: una variante de '${entrada.grupo}' no puede tener escritura: true.`);
    const imposible = parametrosVisibles(entrada).find((p) => p.requerido && !(entrada.padre && iguales(p.nombre, entrada.padre.parametro)));
    if (imposible) {
      throw new ErrorFunciones(
        `${t}: el parámetro obligatorio '${imposible.alias ?? imposible.nombre}' no se puede recibir a través de '${entrada.grupo}' (solo codPadre vía 'padre' y buscar). Usar 'padre', 'valorFijo' o un campo de sesión.`,
      );
    }
  }
}

/**
 * Construye el catálogo a partir del archivo ya leído: valida lo que cruza tools (nombres, grupos,
 * handlers, descripciones) y arma las DefinicionTool en el orden del archivo, sin las variantes.
 */
export function construirCatalogo(archivo: ArchivoFunciones, ruta: string, registro: RegistroHandlers, deps: DependenciasFunciones): CatalogoCargado {
  const nombres = new Set<string>();
  for (const entrada of archivo.tools) {
    if (nombres.has(entrada.nombre)) throw new ErrorFunciones(`Tool '${entrada.nombre}': el nombre está repetido en el archivo.`);
    nombres.add(entrada.nombre);
  }

  let instrucciones: string | null = null;
  if (archivo.servidor.instrucciones) {
    const rutaInstrucciones = resolve(dirname(ruta), archivo.servidor.instrucciones);
    try {
      instrucciones = readFileSync(rutaInstrucciones, 'utf8');
    } catch {
      throw new ErrorFunciones(`servidor.instrucciones: no se pudo leer ${rutaInstrucciones}.`);
    }
  }

  const completarSesion = archivo.servidor.completarSesion ? (registro.completarSesion[archivo.servidor.completarSesion] ?? null) : null;
  if (archivo.servidor.completarSesion && !completarSesion) {
    throw new ErrorFunciones(
      `servidor.completarSesion: '${archivo.servidor.completarSesion}' no existe (disponibles: ${Object.keys(registro.completarSesion).join(', ') || 'ninguno'}).`,
    );
  }

  // Primero las tools de datos (las variantes las necesitan sus agrupadoras), después las demás, y al final el orden del archivo.
  const datos = new Map<string, ToolDatosConstruida>();
  for (const entrada of archivo.tools) {
    if (entrada.tipo !== 'procedure' && entrada.tipo !== 'webservice') continue;
    validarDatos(entrada, nombres);
    datos.set(entrada.nombre, construirToolDatos(entrada, deps));
  }

  const agrupadoras = new Set(archivo.tools.filter((e) => e.tipo === 'agrupadora').map((e) => e.nombre));
  for (const d of datos.values()) {
    if (d.entrada.grupo && !agrupadoras.has(d.entrada.grupo)) {
      throw new ErrorFunciones(`Tool '${d.entrada.nombre}': el grupo '${d.entrada.grupo}' tiene que ser una tool "tipo": "agrupadora".`);
    }
  }

  const otras = new Map<string, CualquierTool>();
  for (const entrada of archivo.tools) {
    if (entrada.tipo === 'agrupadora') {
      const variantes = [...datos.values()].filter((d) => d.entrada.grupo === entrada.nombre);
      if (variantes.length === 0) throw new ErrorFunciones(`Tool '${entrada.nombre}': no tiene variantes (ninguna tool con "grupo": "${entrada.nombre}").`);
      const tool = construirAgrupadora({ deps, instrucciones, variantes, nombre: entrada.nombre, descripcion: entrada.descripcion });
      otras.set(entrada.nombre, publicar(entrada, tool, `Agrupadora '${entrada.nombre}'`));
    } else if (entrada.tipo === 'compleja') {
      otras.set(entrada.nombre, construirCompleja(entrada, registro, { deps, instrucciones, variantes: [] }));
    }
  }

  const tools = archivo.tools
    .filter((e) => e.tipo === 'compleja' || e.tipo === 'agrupadora' || !e.grupo)
    .map((e) => otras.get(e.nombre) ?? datos.get(e.nombre)!.tool);
  return { ruta, servidor: archivo.servidor, instrucciones, tools, completarSesion };
}

/** Le pone a una tool sin textos los del archivo: título, descripción y descripciones de sus parámetros. */
function publicar(entrada: EntradaCompleja | EntradaAgrupadora, sinTextos: ToolSinTextos, origen: string): CualquierTool {
  const { descripcion: descripcionGenerada, ...tool } = sinTextos;
  const enCodigo = descripcionesEnCodigo(tool.inputSchema);
  if (enCodigo.length) {
    throw new ErrorFunciones(`${origen}: el inputSchema trae descripciones en el código (${enCodigo.join(', ')}); van en 'parametros' del archivo.`);
  }
  const parametros = entrada.parametros ?? [];
  const noSanitizar = parametros.filter((p) => p.sanitizar === false).map((p) => p.nombre);
  return {
    ...tool,
    nombre: entrada.nombre,
    titulo: entrada.titulo ?? tituloDesdeNombre(entrada.nombre),
    descripcion: descripcionGenerada ?? entrada.descripcion,
    inputSchema: aplicarDescripciones(tool.inputSchema, parametros, entrada.nombre),
    ...(noSanitizar.length ? { noSanitizar } : {}),
  };
}

function construirCompleja(
  entrada: EntradaCompleja,
  registro: RegistroHandlers,
  contexto: { deps: DependenciasFunciones; instrucciones: string | null; variantes: ToolDatosConstruida[] },
): CualquierTool {
  const t = `Tool '${entrada.nombre}'`;
  const handler = Object.hasOwn(registro.handlers, entrada.handler) ? registro.handlers[entrada.handler] : undefined;
  if (!handler) {
    throw new ErrorFunciones(`${t}: el handler '${entrada.handler}' no existe (disponibles: ${Object.keys(registro.handlers).sort().join(', ') || 'ninguno'}).`);
  }
  if (handler.requiereInstrucciones && contexto.instrucciones === null) {
    throw new ErrorFunciones(`${t}: el handler '${entrada.handler}' necesita servidor.instrucciones.`);
  }
  return publicar(entrada, handler.crear({ ...contexto, nombre: entrada.nombre, descripcion: entrada.descripcion }), `Handler '${entrada.handler}'`);
}
