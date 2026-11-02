import { z } from 'zod';
import { ErrorTool } from '../errores.js';
import { aTimestampBase } from '../mapeo/fecha.js';
import type { ContextoTool } from '../nucleo/definicion.js';
import { codigo, enteroONull, fecha, fechaHora, texto, textoONull, vendedorRequerido, type DependenciasProspeccion } from './campos-prospeccion.js';
import { setProspeccion, type DatosProspeccion } from './sp-prospeccion.js';

/**
 * Lo común a las tres escrituras de prospección (registrar_gestion_prospecto, registrar_prospecto y
 * modificar_prospecto): los campos, con los largos de MM_PROC_SET_PROSPECCION_MOVILB2, la respuesta
 * y la ejecución en una transacción propia.
 */

export const camposGestion = {
  codGrupoProspecto: codigo(),
  codComercializadora: codigo(),
  codCategoriaMensaje: codigo(),
  codResultado: codigo(),
  fechaHoraAgenda: fechaHora().optional(),
  mensaje: z.string().trim().min(1).optional(),
  fechaHora: fechaHora().optional(),
};

export const camposComerciales = {
  codBarrio: codigo().optional(),
  codLocalidad: codigo().optional(),
  codProvincia: codigo().optional(),
  fechaCierrePosible: fecha().optional(),
  tipoPlanDisponible: texto(20).optional(),
  codPlanDisponible: codigo().optional(),
  forecast: z.number().int().optional(),
  montoCotizacion: z.number().nonnegative().optional(),
  cantEmpleados: z.number().int().nonnegative().optional(),
};

export const camposContacto = {
  telefono: texto(50).optional(),
  telefonoMovil: texto(50).optional(),
  email: texto(50).optional(),
};

export const camposDocumento = {
  tipoDocumento: texto(6).optional(),
  nroDocumento: texto(30).optional(),
  domicilio: texto(100).optional(),
};

export const salidaRegistro = z.object({
  codProspectacionMovil: z.number().int().nullable().describe('Registro de la gestión creada; null en una modificación.'),
  mensaje: z.string(),
});

export type ResultadoRegistro = z.infer<typeof salidaRegistro>;

/** Ejecuta la escritura en su propia transacción. Un rechazo del procedure deshace todo (design D3). */
export async function registrar(
  deps: DependenciasProspeccion,
  ctx: ContextoTool,
  datos: DatosProspeccion,
  mensajeExito: (cod: number | null) => string,
): Promise<{ datos: ResultadoRegistro; resumen: string }> {
  const vendedor = vendedorRequerido(ctx.sesion);
  const fila = await deps.acceso.enTransaccionEscritura(async (sp) => {
    const resultado = await setProspeccion(sp, ctx.sesion.codUsuario, vendedor, datos);
    if (!resultado || Number(resultado.SALIDA) !== 0) {
      throw new ErrorTool('OPERACION_RECHAZADA', textoONull(resultado?.MENSAJE_SALIDA) ?? 'La base rechazó la operación sin informar el motivo.');
    }
    return resultado;
  }, ctx.medidor);
  const cod = enteroONull(fila.COD_PROSPECTACION_MOVIL);
  const mensaje = mensajeExito(cod);
  return { datos: { codProspectacionMovil: cod, mensaje }, resumen: mensaje };
}

const aBase = (valor: string | undefined, zona: string) => (valor === undefined ? undefined : aTimestampBase(valor, zona));

/** Lo que comparten la gestión y el alta: campos de la gestión y comerciales. */
export const entradaGestionComercial = z.object({ ...camposGestion, ...camposComerciales });
type ConGestion = z.infer<typeof entradaGestionComercial>;

/** Datos de la gestión y comerciales para el procedure, con las fechas en la hora de la base. */
export function datosGestion(a: ConGestion, zona: string): DatosProspeccion {
  return {
    codGrupoProspecto: a.codGrupoProspecto,
    codComercializadora: a.codComercializadora,
    codCategoriaMensaje: a.codCategoriaMensaje,
    codResultado: a.codResultado,
    fechaHoraAgenda: aBase(a.fechaHoraAgenda, zona),
    mensaje: a.mensaje,
    fechaHora: aBase(a.fechaHora, zona),
    codBarrio: a.codBarrio,
    codLocalidad: a.codLocalidad,
    codProvincia: a.codProvincia,
    fechaCierrePosible: a.fechaCierrePosible,
    tipoPlanDisponible: a.tipoPlanDisponible,
    codPlanDisponible: a.codPlanDisponible,
    forecast: a.forecast,
    montoCotizacion: a.montoCotizacion,
    cantEmpleados: a.cantEmpleados,
  };
}
