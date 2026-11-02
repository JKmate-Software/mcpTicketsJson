import { z } from 'zod';
import type { DefinicionSinTextos } from '../nucleo/definicion.js';
import { ANOTACIONES_ESCRITURA, codigo, esquemaJson, texto, type DependenciasProspeccion } from '../comunes/campos-prospeccion.js';
import { camposContacto, camposDocumento, registrar, salidaRegistro, type ResultadoRegistro } from '../comunes/registro-prospeccion.js';
import type { HandlerCompleja } from '../funciones/tipos.js';

const DATOS_MODIFICABLES = ['nombre', 'apellido', 'email', 'telefono', 'telefonoMovil', 'tipoDocumento', 'nroDocumento', 'domicilio'] as const;

const entradaModificacion = z
  .object({
    codCliente: codigo(),
    codProspecto: codigo(),
    nombre: texto(65).optional(),
    apellido: texto(35).optional(),
    ...camposContacto,
    ...camposDocumento,
  })
  .strict()
  .refine((a) => DATOS_MODIFICABLES.some((c) => a[c] !== undefined), {
    message: `No hay nada para modificar: pasá al menos uno de ${DATOS_MODIFICABLES.join(', ')}.`,
    path: ['codProspecto'],
  });
type EntradaModificacion = z.infer<typeof entradaModificacion>;

export function crearModificarProspecto(deps: DependenciasProspeccion): DefinicionSinTextos<EntradaModificacion, ResultadoRegistro> {
  return {
    inputSchema: esquemaJson(entradaModificacion, 'input'),
    outputSchema: esquemaJson(salidaRegistro, 'output'),
    annotations: ANOTACIONES_ESCRITURA,
    entrada: entradaModificacion,
    async ejecutar(a, ctx) {
      // Sin acción, resultado, canal, grupo ni cita: el procedure entra en su rama "solo datos del prospecto".
      return registrar(
        deps,
        ctx,
        {
          codCliente: a.codCliente,
          codProspecto: a.codProspecto,
          nombre: a.nombre,
          apellido: a.apellido,
          email: a.email,
          telefono: a.telefono,
          telefonoMovil: a.telefonoMovil,
          tipoDocumento: a.tipoDocumento,
          nroDocumento: a.nroDocumento,
          domicilio: a.domicilio,
        },
        () => `Datos del prospecto ${a.codProspecto} actualizados.`,
      );
    },
  };
}

export const handler: HandlerCompleja = { crear: ({ deps }) => crearModificarProspecto(deps) };
