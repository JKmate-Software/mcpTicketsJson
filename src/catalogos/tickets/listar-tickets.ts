import { z } from 'zod';
import { listarTickets, type FilaListadoTicket, type OrdenTickets } from './comunes/sp-tickets.js';
import { aFechaHoraIso } from '../../mapeo/fecha.js';
import { aPersona, aRefNombre, aTextoONull, type Persona, type RefNombre } from '../../mapeo/valores.js';
import type { DefinicionSinTextos } from '../../nucleo/definicion.js';
import {
  ANOTACIONES_LECTURA,
  conDefs,
  DESPLAZAMIENTO_JSON,
  desplazamientoZod,
  LIMITE_LISTADO_JSON,
  limiteZod,
  ref,
  refNullable,
} from './comunes/esquemas-tickets.js';
import { aFiltrosSp, FILTROS_TICKETS_JSON, filtrosTicketsZod, MENSAJE_RANGO, rangoValido, sufijoAbiertos } from './comunes/filtros-tickets.js';
import type { DependenciasFunciones, HandlerCompleja } from '../../funciones/tipos.js';
import { plural, rango } from './comunes/mapeo-tickets.js';

const ORDENES = ['actualizacion', 'creacion', 'agenda'] as const satisfies readonly OrdenTickets[];

const entrada = z
  .object({
    ...filtrosTicketsZod,
    orden: z.enum(ORDENES).default('actualizacion'),
    limite: limiteZod,
    desplazamiento: desplazamientoZod,
  })
  .strict()
  .refine(rangoValido, { message: MENSAJE_RANGO, path: ['creadoDesde'] });

type Entrada = z.infer<typeof entrada>;

interface TicketListado {
  id: number;
  titulo: string;
  estado: string;
  prioridad: string;
  sistema: string | null;
  cliente: RefNombre;
  asignadoA: Persona | null;
  creadoEn: string;
  actualizadoEn: string;
  proximaAgenda: { inicio: string; usuario: Persona } | null;
  presupuesto: string | null;
}

export interface ListadoTickets {
  total: number;
  limite: number;
  desplazamiento: number;
  hayMas: boolean;
  tickets: TicketListado[];
}

function mapearTicket(f: FilaListadoTicket, zona: string): TicketListado {
  const usuarioAgenda = aPersona(f.AGENDA_COD_USUARIO, f.AGENDA_USUARIO);
  return {
    id: f.COD_RECLAMO,
    titulo: f.TITULO.trim(),
    estado: f.ESTADO.trim(),
    prioridad: f.PRIORIDAD.trim(),
    sistema: aTextoONull(f.TIPO_SISTEMA),
    cliente: aRefNombre(f.COD_CLIENTE, f.CLIENTE) ?? { id: f.COD_CLIENTE, nombre: String(f.COD_CLIENTE) },
    asignadoA: aPersona(f.COD_USUARIO_ASIG, f.USUARIO_ASIG),
    creadoEn: aFechaHoraIso(f.FECHA_CREACION, zona),
    actualizadoEn: aFechaHoraIso(f.FECHA_ULTIMO_CAMBIO, zona),
    proximaAgenda: f.AGENDA_FECHA && usuarioAgenda ? { inicio: aFechaHoraIso(f.AGENDA_FECHA, zona), usuario: usuarioAgenda } : null,
    presupuesto: f.ESTADO_PRESUPUESTO,
  };
}

export function resumirListado(l: ListadoTickets, abiertos: string): string {
  const cabecera = `${plural(l.total, 'ticket')}${abiertos} (${rango(l.desplazamiento, l.tickets.length)})`;
  if (!l.tickets.length) return `${cabecera}.`;
  const items = l.tickets.map((t) => `#${t.id} ${t.estado}/${t.prioridad} "${t.titulo}"`).join('; ');
  return `${cabecera}. ${items}.`;
}

export function crearListarTickets({ acceso, zonaHoraria }: DependenciasFunciones): DefinicionSinTextos<Entrada, ListadoTickets> {
  return {
    inputSchema: conDefs({
      type: 'object',
      properties: {
        ...FILTROS_TICKETS_JSON,
        orden: {
          enum: [...ORDENES],
          default: 'actualizacion',
        },
        limite: LIMITE_LISTADO_JSON,
        desplazamiento: DESPLAZAMIENTO_JSON,
      },
      additionalProperties: false,
    }),
    outputSchema: conDefs({
      type: 'object',
      properties: {
        total: { type: 'integer' },
        limite: { type: 'integer' },
        desplazamiento: { type: 'integer' },
        hayMas: { type: 'boolean' },
        tickets: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              titulo: { type: 'string' },
              estado: ref('estadoTicket'),
              prioridad: ref('prioridadTicket'),
              sistema: ref('sistema'),
              cliente: ref('refNombre'),
              asignadoA: refNullable('persona'),
              creadoEn: ref('fechaHora'),
              actualizadoEn: ref('fechaHora'),
              proximaAgenda: {
                anyOf: [
                  {
                    type: 'object',
                    properties: { inicio: ref('fechaHora'), usuario: ref('persona') },
                    required: ['inicio', 'usuario'],
                  },
                  { type: 'null' },
                ],
              },
              presupuesto: { ...refNullable('estadoPresupuesto'), description: 'Estado del presupuesto más reciente; null si no tiene' },
            },
            required: [
              'id',
              'titulo',
              'estado',
              'prioridad',
              'sistema',
              'cliente',
              'asignadoA',
              'creadoEn',
              'actualizadoEn',
              'proximaAgenda',
              'presupuesto',
            ],
          },
        },
      },
      required: ['total', 'limite', 'desplazamiento', 'hayMas', 'tickets'],
    }),
    annotations: ANOTACIONES_LECTURA,
    entrada,

    async ejecutar(args, ctx) {
      const filtros = aFiltrosSp(args, ctx.sesion);
      const { limite, desplazamiento, orden } = args;
      const { filas, total } = await acceso.enTransaccion(async (sp) => {
        const filas = await listarTickets(sp, { ...filtros, orden, limite, desplazamiento });
        if (filas.length || desplazamiento === 0) return { filas, total: filas[0]?.TOTAL ?? 0 };
        // Desplazamiento más allá del final: no hay filas que traigan TOTAL; se recalcula aparte.
        const primera = await listarTickets(sp, { ...filtros, orden, limite: 1, desplazamiento: 0 });
        return { filas, total: primera[0]?.TOTAL ?? 0 };
      }, ctx.medidor);

      const tickets = filas.map((f) => mapearTicket(f, zonaHoraria));
      const datos: ListadoTickets = {
        total,
        limite,
        desplazamiento,
        hayMas: desplazamiento + tickets.length < total,
        tickets,
      };
      return { datos, resumen: resumirListado(datos, sufijoAbiertos(args)) };
    },
  };
}

export const handler: HandlerCompleja = { crear: ({ deps }) => crearListarTickets(deps) };
