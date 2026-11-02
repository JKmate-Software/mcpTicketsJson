import type { Logger } from 'pino';
import type { Sesion } from '../auth/sesion.js';
import type { CacheCatalogos } from '../busqueda/catalogo.js';
import type { AccesoDatos } from '../db/firebird.js';
import type { DefinicionTool } from '../nucleo/definicion.js';
import type { ArchivoFunciones, EntradaCompleja, EntradaDatos } from './esquema.js';

// Cada tool tiene sus propios tipos de entrada y salida; el registro las trata de forma uniforme.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CualquierTool = DefinicionTool<any, any>;

/** Lo que necesitan las tools para ejecutarse (igual para todas las del catálogo). */
export interface DependenciasFunciones {
  acceso: AccesoDatos;
  zonaHoraria: string;
  /** Caché de catálogos con búsqueda aproximada, compartida por todo el catálogo. */
  cache: CacheCatalogos;
  /** Segundos que se reusa la definición de un método de webservice (MCP_WEBSERVICE_CACHE_SEGUNDOS). */
  cacheWebserviceSegundos?: number;
}

/** Una tool `procedure`/`webservice` ya construida, con su entrada del archivo (las variantes de un grupo). */
export interface ToolDatosConstruida {
  entrada: EntradaDatos;
  tool: CualquierTool;
  /** Ejecuta con los argumentos ya validados y devuelve las filas compuestas (sin búsqueda ni tope). */
  leerFilas(args: Record<string, unknown>, sesion: Sesion, medidor: { llamadasBase: number }): Promise<Record<string, unknown>[]>;
}

export interface ContextoHandler {
  deps: DependenciasFunciones;
  /** Nombre publicado de la tool (el handler puede usarse con otro nombre en otro catálogo). */
  nombre: string;
  /** Contenido de `servidor.instrucciones`, o null. */
  instrucciones: string | null;
  /** Variantes agrupadas bajo esta tool (`"grupo": "<nombre>"`), en el orden del archivo. */
  variantes: ToolDatosConstruida[];
  /** Descripción de la tool, del archivo (los handlers genéricos la extienden). */
  descripcion: string;
}

/** Tool de lógica en código, sin sus textos: nombre, título y descripciones salen del archivo. */
export type ToolSinTextos = Omit<CualquierTool, 'nombre' | 'titulo' | 'descripcion'> & {
  /** Reemplaza la descripción del archivo (handlers genéricos que la arman con sus variantes). */
  descripcion?: string;
};

export interface HandlerCompleja {
  crear(contexto: ContextoHandler): ToolSinTextos;
  /** true si necesita `servidor.instrucciones` (obtener_instrucciones). */
  requiereInstrucciones?: boolean;
}

/** Completa la sesión stdio desde la base (tickets: el desarrollador del usuario). */
export type CompletarSesion = (sesion: Sesion, acceso: AccesoDatos, logger: Logger) => Promise<Sesion>;

export interface RegistroHandlers {
  handlers: Record<string, HandlerCompleja>;
  completarSesion: Record<string, CompletarSesion>;
}

/** Catálogo listo para publicar: inmutable; una recarga crea otro. */
export interface CatalogoCargado {
  ruta: string;
  servidor: ArchivoFunciones['servidor'];
  /** Contenido de las instrucciones, o null. */
  instrucciones: string | null;
  tools: CualquierTool[];
  completarSesion: CompletarSesion | null;
}

export type { EntradaCompleja, EntradaDatos };
