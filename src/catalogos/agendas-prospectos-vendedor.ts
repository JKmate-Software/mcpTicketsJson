import { z } from 'zod';
import { aFechaHoraIsoONull } from '../mapeo/fecha.js';
import type { DefinicionSinTextos } from '../nucleo/definicion.js';
import {
  ANOTACIONES_LECTURA,
  entero,
  enteroONull,
  esquemaJson,
  fecha,
  fechaHoraSalida,
  plural,
  textoONull,
  vendedorRequerido,
  type DependenciasProspeccion,
} from '../comunes/campos-prospeccion.js';
import { agendaProspectos } from '../comunes/sp-prospeccion.js';
import type { HandlerCompleja } from '../funciones/tipos.js';

const entradaAgenda = z
  .object({
    fechaDesde: fecha(),
    fechaHasta: fecha(),
  })
  .strict()
  .refine((a) => a.fechaDesde <= a.fechaHasta, { message: 'fechaDesde es posterior a fechaHasta', path: ['fechaDesde'] });
const salidaAgenda = z.object({
  citas: z.array(
    z.object({
      fechaHoraCita: fechaHoraSalida,
      fechaHoraFin: fechaHoraSalida,
      codCliente: entero.nullable(),
      codProspecto: entero.nullable(),
      cliente: z.string().nullable(),
      telefonoMovil: z.string().nullable(),
      titulo: z.string().nullable(),
    }),
  ),
});
type Agenda = z.infer<typeof salidaAgenda>;

export function crearAgendaProspectos({ acceso, zonaHoraria }: DependenciasProspeccion): DefinicionSinTextos<z.infer<typeof entradaAgenda>, Agenda> {
  return {
    inputSchema: esquemaJson(entradaAgenda, 'input'),
    outputSchema: esquemaJson(salidaAgenda, 'output'),
    annotations: ANOTACIONES_LECTURA,
    entrada: entradaAgenda,
    async ejecutar(a, ctx) {
      const vendedor = vendedorRequerido(ctx.sesion);
      const filas = await acceso.enTransaccion((sp) => agendaProspectos(sp, vendedor, a.fechaDesde, a.fechaHasta), ctx.medidor);
      const datos: Agenda = {
        citas: filas.map((f) => ({
          fechaHoraCita: aFechaHoraIsoONull(f.FECHA_HORA_CITA, zonaHoraria),
          fechaHoraFin: aFechaHoraIsoONull(f.FECHA_HORA_FIN, zonaHoraria),
          codCliente: enteroONull(f.COD_CLIENTE),
          codProspecto: enteroONull(f.COD_PROSPECTO),
          cliente: textoONull(f.CLIENTE),
          telefonoMovil: textoONull(f.TELEFONO_MOVIL),
          titulo: textoONull(f.TITULO),
        })),
      };
      return { datos, resumen: `${plural(datos.citas.length, 'cita')} entre ${a.fechaDesde} y ${a.fechaHasta}.` };
    },
  };
}

export const handler: HandlerCompleja = { crear: ({ deps }) => crearAgendaProspectos(deps) };
