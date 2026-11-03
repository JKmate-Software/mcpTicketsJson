import { z } from 'zod';
import { aFechaONull } from '../../mapeo/fecha.js';
import type { DefinicionSinTextos } from '../../nucleo/definicion.js';
import {
  ANOTACIONES_LECTURA,
  entero,
  enteroONull,
  esquemaJson,
  fechaReferencia,
  fechaSalida,
  textoONull,
  vendedorRequerido,
  type DependenciasProspeccion,
} from './comunes/campos-prospeccion.js';
import { resumenProspeccion } from './comunes/sp-prospeccion.js';
import type { HandlerCompleja } from '../../funciones/tipos.js';

const entradaResumen = z.object({ fechaReferencia }).strict();
const salidaResumen = z.object({
  intervalos: z.array(
    z.object({
      intervalo: z.string(),
      fechaDesde: fechaSalida,
      fechaHasta: fechaSalida,
      asignados: entero,
      nuevos: entero,
      agendados: entero,
      gestionados: entero,
    }),
  ),
});
type Resumen = z.infer<typeof salidaResumen>;

export function crearResumenProspeccion({ acceso }: DependenciasProspeccion): DefinicionSinTextos<z.infer<typeof entradaResumen>, Resumen> {
  return {
    inputSchema: esquemaJson(entradaResumen, 'input'),
    outputSchema: esquemaJson(salidaResumen, 'output'),
    annotations: ANOTACIONES_LECTURA,
    entrada: entradaResumen,
    async ejecutar(a, ctx) {
      const vendedor = vendedorRequerido(ctx.sesion);
      const filas = await acceso.enTransaccion((sp) => resumenProspeccion(sp, vendedor, ctx.sesion.codUsuario, a.fechaReferencia), ctx.medidor);
      const datos: Resumen = {
        intervalos: filas.map((f) => ({
          intervalo: textoONull(f.INTERVALO) ?? '',
          fechaDesde: aFechaONull(f.FECHA_DESDE),
          fechaHasta: aFechaONull(f.FECHA_HASTA),
          asignados: enteroONull(f.ASIGNADOS) ?? 0,
          nuevos: enteroONull(f.NUEVOS) ?? 0,
          agendados: enteroONull(f.AGENDADOS) ?? 0,
          gestionados: enteroONull(f.GESTIONADOS) ?? 0,
        })),
      };
      const resumen = datos.intervalos
        .map((i) => `${i.intervalo}: ${i.asignados} asignados, ${i.nuevos} nuevos, ${i.agendados} agendados, ${i.gestionados} gestionados`)
        .join('. ');
      return { datos, resumen: resumen ? `${resumen}.` : 'Sin datos de prospección.' };
    },
  };
}

export const handler: HandlerCompleja = { crear: ({ deps }) => crearResumenProspeccion(deps) };
