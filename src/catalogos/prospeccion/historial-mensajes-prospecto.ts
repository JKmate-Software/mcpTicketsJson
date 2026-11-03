import { z } from 'zod';
import { aFechaHoraIsoONull } from '../../mapeo/fecha.js';
import { htmlATexto } from '../../mapeo/valores.js';
import type { DefinicionSinTextos } from '../../nucleo/definicion.js';
import {
  ANOTACIONES_LECTURA,
  codigo,
  esquemaJson,
  fechaHoraSalida,
  plural,
  textoONull,
  vendedorRequerido,
  type DependenciasProspeccion,
} from './comunes/campos-prospeccion.js';
import { mensajesProspecto } from './comunes/sp-prospeccion.js';
import type { HandlerCompleja } from '../../funciones/tipos.js';

const entradaHistorial = z
  .object({
    codCliente: codigo(),
    codProspecto: codigo(),
  })
  .strict();
const salidaHistorial = z.object({
  gestiones: z.array(
    z.object({
      fechaHora: fechaHoraSalida,
      fechaHoraAgenda: fechaHoraSalida,
      categoria: z.string().nullable(),
      resultado: z.string().nullable(),
      estado: z.string().nullable(),
      mensaje: z.string().nullable(),
      entidad: z.string().nullable(),
      usuario: z.string().nullable(),
      nroTramite: z.string().nullable(),
    }),
  ),
});
type Historial = z.infer<typeof salidaHistorial>;

export function crearHistorialProspecto({ acceso, zonaHoraria }: DependenciasProspeccion): DefinicionSinTextos<z.infer<typeof entradaHistorial>, Historial> {
  return {
    inputSchema: esquemaJson(entradaHistorial, 'input'),
    outputSchema: esquemaJson(salidaHistorial, 'output'),
    annotations: ANOTACIONES_LECTURA,
    entrada: entradaHistorial,
    async ejecutar(a, ctx) {
      vendedorRequerido(ctx.sesion);
      const filas = await acceso.enTransaccion((sp) => mensajesProspecto(sp, a.codCliente, a.codProspecto), ctx.medidor);
      const datos: Historial = {
        gestiones: filas.map((f) => ({
          fechaHora: aFechaHoraIsoONull(f.FECHA_HORA, zonaHoraria),
          fechaHoraAgenda: aFechaHoraIsoONull(f.FECHA_HORA_AGENDA, zonaHoraria),
          categoria: textoONull(f.CATEGORIA_MENSAJE),
          resultado: textoONull(f.RESULTADO_TRAMITE),
          estado: textoONull(f.ESTADO_TRAMITE),
          mensaje: textoONull(htmlATexto(f.MENSAJE)),
          entidad: textoONull(f.ENTIDAD_RELACIONADA),
          usuario: textoONull(f.USUARIO),
          nroTramite: textoONull(f.NRO_TRAMITE),
        })),
      };
      return { datos, resumen: `${plural(datos.gestiones.length, 'gestión', 'gestiones')} del prospecto ${a.codProspecto}.` };
    },
  };
}

export const handler: HandlerCompleja = { crear: ({ deps }) => crearHistorialProspecto(deps) };
