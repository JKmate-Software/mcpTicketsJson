import type { CompletarSesion } from '../../../funciones/tipos.js';

/** En stdio, el desarrollador del usuario se resuelve una vez, al arrancar ("yo" en listar_tareas). */
export const completarSesion: CompletarSesion = async (sesion, acceso, logger) => {
  if (sesion.codUsuario === null || sesion.codDesarrollador !== null) return sesion;
  const codDesarrollador = await acceso.codDesarrolladorDeUsuario(sesion.codUsuario).catch((error: unknown) => {
    logger.warn({ err: error }, 'No se pudo resolver el desarrollador del usuario; "yo" en tareas no estará disponible');
    return null;
  });
  return {
    ...sesion,
    codDesarrollador,
    ...(sesion.claims ? { claims: { ...sesion.claims, COD_DESARROLLADOR: codDesarrollador === null ? '' : String(codDesarrollador) } } : {}),
  };
};
