import { z } from 'zod';
import { resumirTickets, type DimensionResumen, type FilaResumen } from './comunes/sp-tickets.js';
import { aRefNombre, type RefNombre } from '../../mapeo/valores.js';
import type { DefinicionSinTextos } from '../../nucleo/definicion.js';
import { ANOTACIONES_LECTURA, conDefs } from './comunes/esquemas-tickets.js';
import { aFiltrosSp, FILTROS_TICKETS_JSON, filtrosTicketsZod, MENSAJE_RANGO, rangoValido, sufijoAbiertos } from './comunes/filtros-tickets.js';
import type { DependenciasFunciones, HandlerCompleja } from '../../funciones/tipos.js';
import { plural } from './comunes/mapeo-tickets.js';

/** Cantidad de claves con nombre en porCliente / porAsignado; el resto va a una fila con clave null. */
export const TOP_REFERENCIAS = 20;

const DIMENSIONES = ['estado', 'prioridad', 'sistema', 'cliente', 'asignado'] as const;
type Dimension = (typeof DIMENSIONES)[number];

const CAMPO: Record<Dimension, 'porEstado' | 'porPrioridad' | 'porSistema' | 'porCliente' | 'porAsignado'> = {
  estado: 'porEstado',
  prioridad: 'porPrioridad',
  sistema: 'porSistema',
  cliente: 'porCliente',
  asignado: 'porAsignado',
};

const entrada = z
  .object({
    ...filtrosTicketsZod,
    agruparPor: z
      .array(z.enum(DIMENSIONES))
      .min(1)
      .refine((v) => new Set(v).size === v.length, 'Hay dimensiones repetidas')
      .default(['estado', 'prioridad', 'cliente']),
  })
  .strict()
  .refine(rangoValido, { message: MENSAJE_RANGO, path: ['creadoDesde'] });

type Entrada = z.infer<typeof entrada>;

interface ConteoTexto {
  clave: string | null;
  cantidad: number;
}
interface ConteoRef {
  clave: RefNombre | null;
  cantidad: number;
}

export interface ResumenTickets {
  total: number;
  porEstado?: ConteoTexto[];
  porPrioridad?: ConteoTexto[];
  porSistema?: ConteoTexto[];
  porCliente?: ConteoRef[];
  porAsignado?: ConteoRef[];
}

function conteosTexto(filas: FilaResumen[]): ConteoTexto[] {
  return filas.map((f) => ({ clave: f.CLAVE?.trim() || null, cantidad: f.CANTIDAD }));
}

/**
 * Top N con `{ id, nombre }` (las filas ya vienen ordenadas por cantidad) y una fila final con
 * `clave: null` que acumula el resto y los tickets sin clave (sin asignar).
 */
export function conteosRef(filas: FilaResumen[], top = TOP_REFERENCIAS): ConteoRef[] {
  const conClave = filas.filter((f) => f.CLAVE_ID !== null);
  const resto =
    conClave.slice(top).reduce((s, f) => s + f.CANTIDAD, 0) +
    filas.filter((f) => f.CLAVE_ID === null).reduce((s, f) => s + f.CANTIDAD, 0);
  const conteos: ConteoRef[] = conClave.slice(0, top).map((f) => ({
    clave: aRefNombre(f.CLAVE_ID, f.CLAVE),
    cantidad: f.CANTIDAD,
  }));
  if (resto > 0) conteos.push({ clave: null, cantidad: resto });
  return conteos;
}

function textoDimension(nombre: string, conteos: (ConteoTexto | ConteoRef)[]): string {
  const items = conteos.map((c) => {
    const clave = c.clave === null ? 'otros/sin dato' : typeof c.clave === 'string' ? c.clave : c.clave.nombre;
    return `${clave} ${c.cantidad}`;
  });
  return `Por ${nombre}: ${items.length ? items.join(', ') : 'sin datos'}.`;
}

export function resumirResumen(r: ResumenTickets, agruparPor: readonly Dimension[], abiertos: string): string {
  const partes = [`${plural(r.total, 'ticket')}${abiertos}.`];
  for (const d of agruparPor) partes.push(textoDimension(d, r[CAMPO[d]] ?? []));
  return partes.join(' ');
}

const CONTEO_TEXTO = {
  type: 'array',
  items: {
    type: 'object',
    properties: { clave: { type: ['string', 'null'] }, cantidad: { type: 'integer' } },
    required: ['clave', 'cantidad'],
  },
};
const CONTEO_REF = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      clave: { anyOf: [{ $ref: '#/$defs/refNombre' }, { type: 'null' }] },
      cantidad: { type: 'integer' },
    },
    required: ['clave', 'cantidad'],
  },
};

export function crearResumirTickets({ acceso }: DependenciasFunciones): DefinicionSinTextos<Entrada, ResumenTickets> {
  return {
    inputSchema: conDefs({
      type: 'object',
      properties: {
        ...FILTROS_TICKETS_JSON,
        agruparPor: {
          type: 'array',
          items: { enum: [...DIMENSIONES] },
          minItems: 1,
          uniqueItems: true,
          default: ['estado', 'prioridad', 'cliente'],
        },
      },
      additionalProperties: false,
    }),
    outputSchema: conDefs({
      type: 'object',
      properties: {
        total: { type: 'integer' },
        porEstado: CONTEO_TEXTO,
        porPrioridad: CONTEO_TEXTO,
        porSistema: CONTEO_TEXTO,
        porCliente: CONTEO_REF,
        porAsignado: CONTEO_REF,
      },
      required: ['total'],
    }),
    annotations: ANOTACIONES_LECTURA,
    entrada,

    async ejecutar(args, ctx) {
      const filtros = aFiltrosSp(args, ctx.sesion);
      const porDimension = await acceso.enTransaccion(
        (sp) => Promise.all(args.agruparPor.map((d) => resumirTickets(sp, d.toUpperCase() as DimensionResumen, filtros))),
        ctx.medidor,
      );

      const datos: ResumenTickets = { total: porDimension[0]?.[0]?.TOTAL ?? 0 };
      args.agruparPor.forEach((d, i) => {
        const filas = porDimension[i] ?? [];
        if (d === 'cliente' || d === 'asignado') datos[CAMPO[d] as 'porCliente' | 'porAsignado'] = conteosRef(filas);
        else datos[CAMPO[d] as 'porEstado' | 'porPrioridad' | 'porSistema'] = conteosTexto(filas);
      });
      return { datos, resumen: resumirResumen(datos, args.agruparPor, sufijoAbiertos(args)) };
    },
  };
}

export const handler: HandlerCompleja = { crear: ({ deps }) => crearResumirTickets(deps) };
