import { z } from 'zod';
import type { DefinicionSinTextos } from '../../nucleo/definicion.js';
import type { HandlerCompleja } from '../../funciones/tipos.js';
import { ANOTACIONES_LECTURA, esquemaJson } from './comunes/campos-prospeccion.js';

const sinParametros = z.object({}).strict();

const salidaUsuario = z.object({
  codUsuario: z.number().int().nullable(),
  codVendedor: z.number().int().nullable(),
  transporte: z.enum(['stdio', 'http']),
});
type Usuario = z.infer<typeof salidaUsuario>;

export function crearUserInfo(): DefinicionSinTextos<z.infer<typeof sinParametros>, Usuario> {
  return {
    inputSchema: esquemaJson(sinParametros, 'input'),
    outputSchema: esquemaJson(salidaUsuario, 'output'),
    annotations: ANOTACIONES_LECTURA,
    entrada: sinParametros,
    async ejecutar(_a, { sesion }) {
      const datos: Usuario = { codUsuario: sesion.codUsuario, codVendedor: sesion.codVendedor, transporte: sesion.transporte };
      return { datos, resumen: `Usuario ${datos.codUsuario ?? '-'}, vendedor ${datos.codVendedor ?? '-'} (${datos.transporte}).` };
    },
  };
}

/** user_info de prospección: solo usuario y vendedor (la común, user-info, devuelve todas las claves). */
export const handler: HandlerCompleja = { crear: () => crearUserInfo() };
