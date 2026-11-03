import { z } from 'zod';
import type { DefinicionSinTextos } from '../../nucleo/definicion.js';
import { ANOTACIONES_ESCRITURA, codigo, esquemaJson, type DependenciasProspeccion } from './comunes/campos-prospeccion.js';
import { camposComerciales, camposGestion, datosGestion, registrar, salidaRegistro, type ResultadoRegistro } from './comunes/registro-prospeccion.js';
import type { HandlerCompleja } from '../../funciones/tipos.js';

const entradaGestion = z
  .object({
    codCliente: codigo(),
    codProspecto: codigo(),
    ...camposGestion,
    codReclamo: codigo().optional(),
    ...camposComerciales,
  })
  .strict();
type EntradaGestion = z.infer<typeof entradaGestion>;

export function crearRegistrarGestion(deps: DependenciasProspeccion): DefinicionSinTextos<EntradaGestion, ResultadoRegistro> {
  return {
    inputSchema: esquemaJson(entradaGestion, 'input'),
    outputSchema: esquemaJson(salidaRegistro, 'output'),
    annotations: ANOTACIONES_ESCRITURA,
    entrada: entradaGestion,
    async ejecutar(a, ctx) {
      return registrar(
        deps,
        ctx,
        { ...datosGestion(a, deps.zonaHoraria), codCliente: a.codCliente, codProspecto: a.codProspecto, codReclamo: a.codReclamo },
        (cod) => `Gestión registrada sobre el prospecto ${a.codProspecto}${cod !== null ? ` (registro ${cod})` : ''}.`,
      );
    },
  };
}

export const handler: HandlerCompleja = { crear: ({ deps }) => crearRegistrarGestion(deps) };
