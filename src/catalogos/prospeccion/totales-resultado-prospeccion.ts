import { z } from 'zod';
import type { DefinicionSinTextos } from '../../nucleo/definicion.js';
import {
  ANOTACIONES_LECTURA,
  entero,
  enteroONull,
  esquemaJson,
  fechaReferencia,
  plural,
  textoONull,
  vendedorRequerido,
  type DependenciasProspeccion,
} from './comunes/campos-prospeccion.js';
import { totalesPorResultado } from './comunes/sp-prospeccion.js';
import type { HandlerCompleja } from '../../funciones/tipos.js';

export const INTERVALOS = ['Día', 'Sem', 'Mes', 'Año'] as const;

const entradaTotales = z
  .object({
    intervalo: z.enum(INTERVALOS, { message: `intervalo admite exactamente: ${INTERVALOS.join(', ')}` }),
    fechaReferencia,
  })
  .strict();
const salidaTotales = z.object({
  intervalo: z.enum(INTERVALOS),
  resultados: z.array(z.object({ codResultado: entero.nullable(), resultado: z.string().nullable(), cantidad: entero })),
});
type Totales = z.infer<typeof salidaTotales>;

export function crearTotalesResultado({ acceso }: DependenciasProspeccion): DefinicionSinTextos<z.infer<typeof entradaTotales>, Totales> {
  return {
    inputSchema: esquemaJson(entradaTotales, 'input'),
    outputSchema: esquemaJson(salidaTotales, 'output'),
    annotations: ANOTACIONES_LECTURA,
    entrada: entradaTotales,
    async ejecutar(a, ctx) {
      const vendedor = vendedorRequerido(ctx.sesion);
      const filas = await acceso.enTransaccion(
        (sp) => totalesPorResultado(sp, vendedor, ctx.sesion.codUsuario, a.intervalo, a.fechaReferencia),
        ctx.medidor,
      );
      const datos: Totales = {
        intervalo: a.intervalo,
        resultados: filas.map((f) => ({
          codResultado: enteroONull(f.COD_RESULTADO_RECLAMO),
          resultado: textoONull(f.RESULTADO_RECLAMO),
          cantidad: enteroONull(f.CANTIDAD) ?? 0,
        })),
      };
      const total = datos.resultados.reduce((s, r) => s + r.cantidad, 0);
      const detalle = datos.resultados.map((r) => `${r.resultado ?? 'sin resultado'}: ${r.cantidad}`).join(', ');
      return { datos, resumen: `${plural(total, 'gestión', 'gestiones')} (${a.intervalo})${detalle ? `: ${detalle}` : ''}.` };
    },
  };
}

export const handler: HandlerCompleja = { crear: ({ deps }) => crearTotalesResultado(deps) };
