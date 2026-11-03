import { z } from 'zod';
import { aFechaHoraIsoONull } from '../../mapeo/fecha.js';
import { htmlATexto } from '../../mapeo/valores.js';
import type { DefinicionSinTextos } from '../../nucleo/definicion.js';
import {
  ANOTACIONES_LECTURA,
  codigo,
  entero,
  enteroONull,
  esquemaJson,
  fecha,
  fechaHoraSalida,
  plural,
  textoONull,
  vendedorRequerido,
  type DependenciasProspeccion,
} from './comunes/campos-prospeccion.js';
import { buscarProspectos } from './comunes/sp-prospeccion.js';
import type { HandlerCompleja } from '../../funciones/tipos.js';

const FILTROS_FECHA = { cita: 1, gestion: 2 } as const;

const entradaBuscar = z
  .object({
    codCampania: codigo().optional(),
    filtroFecha: z.enum(['cita', 'gestion']).optional(),
    fechaAgenda: fecha().optional(),
    cliente: z.string().trim().min(1).max(100).optional(),
    codBarrio: codigo().optional(),
    codAccion: codigo().optional(),
    archivado: z.boolean().default(false),
    maxFilas: z.number().int().min(1).max(500).default(50),
  })
  .strict()
  .refine((a) => (a.filtroFecha === undefined) === (a.fechaAgenda === undefined), {
    message: 'filtroFecha y fechaAgenda van juntos: pasá los dos o ninguno.',
    path: ['fechaAgenda'],
  });

const salidaProspecto = z.object({
  codProspectacionMovil: entero.nullable(),
  codProspecto: entero.nullable(),
  codCliente: entero.nullable(),
  cliente: z.string().nullable(),
  telefonos: z.string().nullable(),
  domicilio: z.string().nullable(),
  codGrupoProspecto: entero.nullable(),
  codReclamo: entero.nullable(),
  fechaHoraGestion: fechaHoraSalida,
  accion: z.string().nullable(),
  codResultado: entero.nullable(),
  resultado: z.string().nullable(),
  ultimoMensaje: z.string().nullable(),
  fechaHoraCita: fechaHoraSalida,
  canal: z.string().nullable(),
  campania: z.string().nullable(),
  barrio: z.string().nullable(),
  archivado: z.boolean(),
});
const salidaBuscar = z.object({ prospectos: z.array(salidaProspecto), maxFilas: entero, hayMas: z.boolean() });
type Busqueda = z.infer<typeof salidaBuscar>;

export function crearBuscarProspectos({ acceso, zonaHoraria }: DependenciasProspeccion): DefinicionSinTextos<z.infer<typeof entradaBuscar>, Busqueda> {
  return {
    inputSchema: esquemaJson(entradaBuscar, 'input'),
    outputSchema: esquemaJson(salidaBuscar, 'output'),
    annotations: ANOTACIONES_LECTURA,
    entrada: entradaBuscar,
    async ejecutar(a, ctx) {
      const vendedor = vendedorRequerido(ctx.sesion);
      const filas = await acceso.enTransaccion(
        (sp) =>
          buscarProspectos(sp, vendedor, {
            codCampania: a.codCampania,
            fechaAgenda: a.fechaAgenda,
            filtroFecha: a.filtroFecha ? FILTROS_FECHA[a.filtroFecha] : 0,
            cliente: a.cliente,
            codBarrio: a.codBarrio,
            archivado: a.archivado,
            codAccion: a.codAccion,
            maxFilas: a.maxFilas,
          }),
        ctx.medidor,
      );
      const prospectos = filas.slice(0, a.maxFilas).map((f) => ({
        codProspectacionMovil: enteroONull(f.COD_PROSPECTACION_MOVIL),
        codProspecto: enteroONull(f.COD_PROSPECTO),
        codCliente: enteroONull(f.COD_CLIENTE),
        cliente: textoONull(f.CLIENTE),
        telefonos: textoONull(f.TELEFONOS),
        domicilio: textoONull(f.DOMICILIO),
        codGrupoProspecto: enteroONull(f.COD_GRUPO_PROSPECTO),
        codReclamo: enteroONull(f.COD_RECLAMO),
        fechaHoraGestion: aFechaHoraIsoONull(f.FECHA_HORA_GESTION, zonaHoraria),
        accion: textoONull(f.ACCION),
        codResultado: enteroONull(f.COD_RESULTADO_RECLAMO),
        resultado: textoONull(f.RESULTADO_GESTION),
        ultimoMensaje: textoONull(htmlATexto(f.ULTIMO_MENSAJE)),
        fechaHoraCita: aFechaHoraIsoONull(f.FECHA_HORA_CITA, zonaHoraria),
        canal: textoONull(f.CANAL),
        campania: textoONull(f.CAMPANIA),
        barrio: textoONull(f.BARRIO),
        archivado: f.ARCHIVADO === 1,
      }));
      const datos: Busqueda = { prospectos, maxFilas: a.maxFilas, hayMas: filas.length >= a.maxFilas };
      const primeros = prospectos.slice(0, 5).map((p) => `${p.cliente ?? '(sin nombre)'}${p.resultado ? ` — ${p.resultado}` : ''}`);
      const resumen = `${plural(prospectos.length, 'gestión', 'gestiones')}${datos.hayMas ? ' (hay más: usá un filtro)' : ''}${
        primeros.length ? `. ${primeros.join('; ')}` : ''
      }.`;
      return { datos, resumen };
    },
  };
}

export const handler: HandlerCompleja = { crear: ({ deps }) => crearBuscarProspectos(deps) };
