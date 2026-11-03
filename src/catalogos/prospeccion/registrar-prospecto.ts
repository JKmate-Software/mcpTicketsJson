import { z } from 'zod';
import type { DefinicionSinTextos } from '../../nucleo/definicion.js';
import { ANOTACIONES_ESCRITURA, esquemaJson, fecha, texto, type DependenciasProspeccion } from './comunes/campos-prospeccion.js';
import {
  camposComerciales,
  camposContacto,
  camposDocumento,
  camposGestion,
  datosGestion,
  registrar,
  salidaRegistro,
  type ResultadoRegistro,
} from './comunes/registro-prospeccion.js';
import type { HandlerCompleja } from '../../funciones/tipos.js';

const entradaAlta = z
  .object({
    apellido: texto(35),
    nombre: texto(65),
    ...camposContacto,
    ...camposGestion,
    ...camposDocumento,
    fechaNacimiento: fecha().optional(),
    ...camposComerciales,
  })
  .strict()
  .refine((a) => a.telefono || a.telefonoMovil || a.email, {
    message: 'Hace falta al menos un dato de contacto: telefono, telefonoMovil o email.',
    path: ['telefono'],
  });
type EntradaAlta = z.infer<typeof entradaAlta>;

export function crearRegistrarProspecto(deps: DependenciasProspeccion): DefinicionSinTextos<EntradaAlta, ResultadoRegistro> {
  return {
    inputSchema: esquemaJson(entradaAlta, 'input'),
    outputSchema: esquemaJson(salidaRegistro, 'output'),
    annotations: ANOTACIONES_ESCRITURA,
    entrada: entradaAlta,
    async ejecutar(a, ctx) {
      return registrar(
        deps,
        ctx,
        {
          ...datosGestion(a, deps.zonaHoraria),
          apellido: a.apellido,
          nombre: a.nombre,
          telefono: a.telefono,
          telefonoMovil: a.telefonoMovil,
          email: a.email,
          tipoDocumento: a.tipoDocumento,
          nroDocumento: a.nroDocumento,
          domicilio: a.domicilio,
          fechaNacimiento: a.fechaNacimiento,
        },
        (cod) => `Prospecto ${a.apellido}, ${a.nombre} dado de alta${cod !== null ? ` (registro ${cod})` : ''}.`,
      );
    },
  };
}

export const handler: HandlerCompleja = { crear: ({ deps }) => crearRegistrarProspecto(deps) };
