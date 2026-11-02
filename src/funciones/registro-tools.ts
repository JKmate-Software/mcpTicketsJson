import { watch, type FSWatcher } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import type { Logger } from 'pino';
import type { CatalogoCargado } from './tipos.js';

/** El catálogo vigente. Una recarga reemplaza la referencia: lo ya tomado sigue igual. */
export interface RegistroTools {
  actual(): CatalogoCargado;
  /** Recarga ya (la usa el vigilante; también sirve en tests). Resuelve true si quedó la versión nueva. */
  recargar(): Promise<boolean>;
  cerrar(): void;
}

export interface OpcionesRegistro {
  /** Vigilar el archivo y su .md de instrucciones y recargar al cambiar (default true). */
  vigilar?: boolean;
  /** Espera tras el último cambio: los editores guardan en varias escrituras. */
  esperaMs?: number;
}

/**
 * Carga el catálogo una vez (si falla, lanza: el servidor no arranca) y, si se pide, lo recarga
 * cuando cambia en disco. Una versión inválida se loguea y se sigue con la anterior.
 */
export async function crearRegistroTools(
  ruta: string,
  cargar: (ruta: string) => Promise<CatalogoCargado>,
  logger: Logger,
  opciones: OpcionesRegistro = {},
): Promise<RegistroTools> {
  let vigente = await cargar(ruta);
  let temporizador: NodeJS.Timeout | undefined;
  let vigilante: FSWatcher | undefined;

  const instrucciones = () => (vigente.servidor.instrucciones ? basename(resolve(dirname(ruta), vigente.servidor.instrucciones)) : null);

  async function recargar(): Promise<boolean> {
    try {
      vigente = await cargar(ruta);
      logger.info({ evento: 'funciones_recargadas', ruta, tools: vigente.tools.map((t) => t.nombre) }, 'Archivo de funciones recargado');
      return true;
    } catch (error) {
      logger.error(
        { evento: 'funciones_invalidas', ruta, motivo: error instanceof Error ? error.message : String(error) },
        'El archivo de funciones cambió pero es inválido: se sigue con la versión anterior',
      );
      return false;
    }
  }

  if (opciones.vigilar ?? true) {
    // Se vigila la carpeta y no el archivo: muchos editores guardan escribiendo otro archivo y renombrándolo.
    vigilante = watch(dirname(ruta), (_evento, nombre) => {
      if (nombre !== basename(ruta) && nombre !== instrucciones()) return;
      clearTimeout(temporizador);
      temporizador = setTimeout(() => void recargar(), opciones.esperaMs ?? 300);
    });
    vigilante.unref();
  }

  return {
    actual: () => vigente,
    recargar,
    cerrar() {
      clearTimeout(temporizador);
      vigilante?.close();
    },
  };
}
