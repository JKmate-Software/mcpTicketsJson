import { z } from 'zod';
import { CLAVES_IDENTIDAD } from '../auth/jwt.js';

/**
 * Esquema del archivo de funciones (`funciones/<catalogo>-functions.json`), equivalente a los
 * `*-functions.json` de la v1. Se publica como `funciones/functions.schema.json` para que el editor
 * autocomplete y valide (ver scripts/generar-schema-funciones.ts).
 */

const NOMBRE_TOOL = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;
const NOMBRE_DB = /^[A-Za-z][A-Za-z0-9_$]*$/;
/** Nombre de un handler o de un completarSesion: el nombre de su archivo (kebab-case, sin rutas). */
export const NOMBRE_HANDLER = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Tipos de dato de los parámetros. También se aceptan los nombres de la v1 (Entero, Texto, ...). */
export const TIPOS_PARAMETRO = ['entero', 'decimal', 'texto', 'booleano', 'fecha', 'fechaHora', 'json'] as const;
export type TipoParametro = (typeof TIPOS_PARAMETRO)[number];
const TIPOS_V1: Record<string, TipoParametro> = {
  Entero: 'entero',
  Decimal: 'decimal',
  Texto: 'texto',
  Booleano: 'booleano',
  integer: 'entero',
  number: 'decimal',
  string: 'texto',
  boolean: 'booleano',
};

/** Tipos de un campo de salida. */
export const TIPOS_SALIDA = ['entero', 'decimal', 'texto', 'booleano', 'fecha', 'fechaHora'] as const;
export type TipoSalida = (typeof TIPOS_SALIDA)[number];

const texto = z.string().trim().min(1);

const tipoParametro = z.preprocess(
  (v) => (typeof v === 'string' && v in TIPOS_V1 ? TIPOS_V1[v] : v),
  z.enum(TIPOS_PARAMETRO),
).describe('Tipo de dato: entero, decimal, texto, booleano, fecha (AAAA-MM-DD), fechaHora (ISO 8601) o json (objeto o array, llega como texto).');

const parametroDato = z
  .object({
    nombre: z.string().regex(NOMBRE_DB).describe('Nombre real del parámetro en el procedure o el método (no cambia con alias).'),
    alias: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/).optional().describe('Nombre con el que lo ve y lo manda el agente.'),
    tipo: tipoParametro,
    descripcion: texto.optional().describe('Lo que ve el agente en el inputSchema.'),
    requerido: z.boolean().optional().describe('Obligatorio para el agente (default false). En un campo de sesión, true = modo forzado (oculto).'),
    default: z.json().optional().describe('Valor si el agente no lo manda (visible y pisable).'),
    valorFijo: z.json().optional().describe('Valor constante: el parámetro no se publica y siempre va con este valor.'),
    sanitizar: z.boolean().optional().describe('false = no quitar HTML/JavaScript de este parámetro (default true).'),
  })
  .strict();
export type ParametroDato = z.infer<typeof parametroDato>;

const parametroTexto = z
  .object({
    nombre: z.string().min(1).describe('Propiedad del inputSchema del handler; las anidadas, con punto (filtros.estado).'),
    descripcion: texto.describe('Lo que ve el agente en el inputSchema.'),
    sanitizar: z.boolean().optional().describe('false = no quitar HTML/JavaScript de este parámetro (default true).'),
  })
  .strict();
export type ParametroTexto = z.infer<typeof parametroTexto>;

const campoSalida = z.union([
  z.string().regex(NOMBRE_DB),
  z
    .object({
      columna: z.string().regex(NOMBRE_DB).describe('Columna que devuelve la consulta.'),
      nombre: z.string().regex(/^[a-z][A-Za-z0-9]*$/).optional().describe('Campo en la respuesta (default: la columna en camelCase).'),
      tipo: z.enum(TIPOS_SALIDA).optional().describe('Conversión del valor (booleano convierte 0/1 en true/false).'),
    })
    .strict(),
]);
export type CampoSalida = z.infer<typeof campoSalida>;

const busqueda = z
  .object({
    campos: z.array(z.string().min(1)).min(1).describe('Columnas (o campos de salida, en listar_catalogo) contra las que se compara el texto.'),
    columnas: z.array(z.string().regex(NOMBRE_DB)).min(1).optional().describe('Columnas que vuelven al agente (prioridad sobre salida).'),
    maxResultados: z.number().int().positive().optional(),
    umbral: z.number().int().min(0).max(100).optional(),
    maxSinBusqueda: z.number().int().min(0).optional(),
    cacheMinutos: z.number().int().min(0).optional(),
    cacheAlcance: z.enum(['usuario', 'global']).optional().describe('global SOLO si el procedure no lee RDB$GET_CONTEXT.'),
  })
  .strict();
export type ConfigBusqueda = z.infer<typeof busqueda>;

const rechazo = z
  .object({
    columna: z.string().regex(NOMBRE_DB),
    valoresExito: z.array(z.union([z.number(), z.string()])).min(1),
    columnaMensaje: z.string().regex(NOMBRE_DB).optional(),
  })
  .strict();
export type ConfigRechazo = z.infer<typeof rechazo>;

const padre = z
  .object({
    parametro: z.string().regex(NOMBRE_DB).describe('Parámetro de la variante que recibe codPadre.'),
    catalogo: z.string().optional().describe('Variante de la que sale el código (para la descripción).'),
    requerido: z.boolean().optional().describe('Default true.'),
  })
  .strict();
export type ConfigPadre = z.infer<typeof padre>;

const orden = z.array(z.object({ campo: z.string().min(1), desc: z.boolean().optional() }).strict()).min(1);

const CAMPOS_SESION = {
  campoUsuario: 'COD_USUARIO',
  campoVendedor: 'COD_VENDEDOR',
  campoDesarrollador: 'COD_DESARROLLADOR',
  campoProveedor: 'COD_PROVEEDOR',
  campoCliente: 'COD_CLIENTE',
  campoEmpresa: 'COD_EMPRESA',
  campoSecuencialEmpresa: 'SECUENCIAL_EMPRESA',
} as const;
export type CampoSesion = keyof typeof CAMPOS_SESION;
export const CLAIM_DE_CAMPO: Record<CampoSesion, (typeof CLAVES_IDENTIDAD)[number]> = CAMPOS_SESION;
const camposSesion = Object.fromEntries(
  (Object.keys(CAMPOS_SESION) as CampoSesion[]).map((c) => [c, z.string().regex(NOMBRE_DB).optional()]),
) as Record<CampoSesion, z.ZodOptional<z.ZodString>>;

const base = {
  nombre: z.string().regex(NOMBRE_TOOL, 'snake_case en minúsculas').describe('Nombre de la tool (único en el archivo).'),
  titulo: texto.optional().describe('Nombre legible (ícono + acción + objeto). Sin titulo se genera desde el nombre.'),
  descripcion: texto.describe('Lo que ve el agente para decidir cuándo usar la tool.'),
};

/** Lo común a procedure y webservice: parámetros, sesión, salida, búsqueda, escritura y agrupación. */
const datos = {
  ...base,
  parametros: z.array(parametroDato).optional(),
  ...camposSesion,
  salida: z.array(campoSalida).min(1).optional(),
  maxFilas: z.number().int().positive().optional(),
  busqueda: busqueda.optional(),
  escritura: z.boolean().optional(),
  destructiva: z.boolean().optional(),
  rechazo: rechazo.optional(),
  conexionExclusiva: z.boolean().optional().describe('Conexión propia fuera del pool (procedures que escriben USER_SESSION).'),
  grupo: z.string().regex(NOMBRE_TOOL).optional().describe('Tool agrupadora (como listar_catalogo) de la que es variante: no se publica suelta.'),
  uso: texto.optional().describe('En una variante: qué código va a qué parámetro de qué tool (línea de la descripción).'),
  padre: padre.optional(),
  orden: orden.optional(),
};

const toolProcedure = z.object({ tipo: z.literal('procedure'), procedure: z.string().regex(NOMBRE_DB), ...datos }).strict();
const toolWebservice = z.object({ tipo: z.literal('webservice'), metodo: z.string().min(1), ...datos }).strict();
const toolCompleja = z
  .object({
    tipo: z.literal('compleja'),
    ...base,
    handler: z
      .string()
      .regex(NOMBRE_HANDLER, 'el nombre del archivo de src/catalogos/<mcp>/ o compartidas/, en minúsculas con guiones (ej. listar-tickets)')
      .describe('Archivo src/catalogos/<mcp>/<handler>.ts (o src/catalogos/compartidas/<handler>.ts) con la lógica de la tool; <mcp> es el nombre del archivo de funciones sin -functions.json.'),
    parametros: z.array(parametroTexto).optional(),
  })
  .strict();
const toolAgrupadora = z
  .object({
    tipo: z.literal('agrupadora'),
    ...base,
    parametros: z.array(parametroTexto).optional().describe('Descripciones de catalogo, codPadre y buscar.'),
  })
  .strict();

export const esquemaTool = z.discriminatedUnion('tipo', [toolProcedure, toolWebservice, toolCompleja, toolAgrupadora]);
export type EntradaTool = z.infer<typeof esquemaTool>;
export type EntradaProcedure = z.infer<typeof toolProcedure>;
export type EntradaWebservice = z.infer<typeof toolWebservice>;
export type EntradaDatos = EntradaProcedure | EntradaWebservice;
export type EntradaCompleja = z.infer<typeof toolCompleja>;
export type EntradaAgrupadora = z.infer<typeof toolAgrupadora>;

export const esquemaArchivoFunciones = z
  .object({
    $schema: z.string().optional(),
    servidor: z
      .object({
        nombre: texto.describe('serverInfo.name del handshake.'),
        version: texto.optional(),
        claimRequerida: z.enum(CLAVES_IDENTIDAD).describe('Clave de identidad que necesitan las tools (token http o MCP_COD_* en stdio).'),
        instrucciones: texto.optional().describe('Archivo .md con las instrucciones, relativo a este archivo.'),
        instruccionesEnHandshake: z.boolean().optional().describe('true = enviar las instrucciones también en el handshake.'),
        completarSesion: z
          .string()
          .regex(NOMBRE_HANDLER, 'el nombre del archivo de src/catalogos/<mcp>/comunes/, en minúsculas con guiones')
          .optional()
          .describe('Archivo src/catalogos/<mcp>/comunes/<nombre>.ts (o compartidas/comunes/) que completa la sesión stdio desde la base.'),
      })
      .strict(),
    tools: z.array(esquemaTool).min(1),
  })
  .strict();
export type ArchivoFunciones = z.infer<typeof esquemaArchivoFunciones>;

/** JSON Schema publicado del archivo. */
export function jsonSchemaArchivo(): Record<string, unknown> {
  return z.toJSONSchema(esquemaArchivoFunciones, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
}
