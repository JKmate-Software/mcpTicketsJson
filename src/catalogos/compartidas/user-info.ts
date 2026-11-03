import { z } from 'zod';
import { claimsDeSesion } from '../../auth/sesion.js';
import { ANOTACIONES_LECTURA, esquemaJson } from '../../nucleo/esquema-json.js';
import type { HandlerCompleja } from '../../funciones/tipos.js';

const sinParametros = z.object({}).strict();

const codigo = z.number().int().nullable();
const salidaUsuario = z.object({
  codUsuario: codigo,
  codVendedor: codigo,
  codDesarrollador: codigo,
  codProveedor: codigo,
  codCliente: codigo,
  codEmpresa: codigo,
  secuencialEmpresa: codigo,
  transporte: z.enum(['stdio', 'http']),
});
type Usuario = z.infer<typeof salidaUsuario>;

/** Identidad de la sesión: todas las claves de identidad (null las que no aplican al tipo de login). */
export const handler: HandlerCompleja = {
  crear: () => ({
    inputSchema: esquemaJson(sinParametros, 'input'),
    outputSchema: esquemaJson(salidaUsuario, 'output'),
    annotations: ANOTACIONES_LECTURA,
    entrada: sinParametros,
    async ejecutar(_a, { sesion }) {
      const claims = claimsDeSesion(sesion);
      const numero = (valor: string) => (valor === '' ? null : Number(valor));
      const datos: Usuario = {
        codUsuario: numero(claims.COD_USUARIO),
        codVendedor: numero(claims.COD_VENDEDOR),
        codDesarrollador: numero(claims.COD_DESARROLLADOR),
        codProveedor: numero(claims.COD_PROVEEDOR),
        codCliente: numero(claims.COD_CLIENTE),
        codEmpresa: numero(claims.COD_EMPRESA),
        secuencialEmpresa: numero(claims.SECUENCIAL_EMPRESA),
        transporte: sesion.transporte,
      };
      const presentes = Object.entries(datos).filter(([clave, valor]) => clave !== 'transporte' && valor !== null);
      const resumen = presentes.length ? presentes.map(([clave, valor]) => `${clave} ${valor}`).join(', ') : 'Sesión sin identidad';
      return { datos, resumen: `${resumen} (${datos.transporte}).` };
    },
  }),
};
