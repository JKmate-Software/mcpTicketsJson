import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { Sesion } from './auth/sesion.js';

const entero = (porDefecto: number) => z.coerce.number().int().positive().default(porDefecto);
const textoOpcional = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v.trim() === '' ? undefined : v));
const enteroOpcional = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.coerce.number().int().positive().optional(),
);

/** Booleano de entorno: true/false/1/0, sin distinguir mayúsculas. Cualquier otro valor es inválido. */
const booleano = (porDefecto: boolean) =>
  z.preprocess(
    (v) => {
      if (v === undefined || (typeof v === 'string' && v.trim() === '')) return porDefecto;
      if (typeof v !== 'string') return v;
      const normalizado = v.trim().toLowerCase();
      if (normalizado === 'true' || normalizado === '1') return true;
      if (normalizado === 'false' || normalizado === '0') return false;
      return v;
    },
    z.boolean({ message: 'debe ser true, false, 1 o 0' }),
  );

const textoConDefecto = (porDefecto: string) =>
  z.preprocess((v) => (v === undefined || (typeof v === 'string' && v.trim() === '') ? porDefecto : v), z.string());

export const TRANSPORTES = ['stdio', 'http'] as const;
/** Carpeta de los archivos de funciones (raíz del proyecto), igual desde src/ que desde dist/. */
const DIR_FUNCIONES = resolve(import.meta.dirname, '../funciones');
const SUFIJO_FUNCIONES = '-functions.json';

const esquemaConfig = z.object({
  MCP_TRANSPORTE: z.preprocess(
    (v) => (v === undefined || (typeof v === 'string' && v.trim() === '') ? 'stdio' : v),
    z.enum(TRANSPORTES, { message: `valores admitidos: ${TRANSPORTES.join(', ')}` }),
  ),
  /** MCP que publica este proceso (un catálogo por instalación). */
  MCP_CATALOGO: z.preprocess(
    (v) => (v === undefined || (typeof v === 'string' && v.trim() === '') ? 'tickets' : v),
    z.string().regex(/^[a-z0-9][a-z0-9_-]*$/, 'nombre de catálogo inválido (minúsculas, dígitos, - y _)'),
  ),
  /** COD_USUARIO de JKMate de quien usa el servidor. En stdio, obligatorio para tickets (un usuario por proceso). */
  MCP_COD_USUARIO: enteroOpcional,
  /** COD_VENDEDOR de quien usa el servidor. En stdio, obligatorio para prospección. */
  MCP_COD_VENDEDOR: enteroOpcional,
  /** Resto de la identidad en stdio (en http sale del token). Cada catálogo exige la de su claimRequerida. */
  MCP_COD_DESARROLLADOR: enteroOpcional,
  MCP_COD_PROVEEDOR: enteroOpcional,
  MCP_COD_CLIENTE: enteroOpcional,
  MCP_COD_EMPRESA: enteroOpcional,
  MCP_SECUENCIAL_EMPRESA: enteroOpcional,
  /** Ruta del archivo de funciones; sin valor, funciones/<MCP_CATALOGO>-functions.json. */
  MCP_FUNCIONES_ARCHIVO: textoOpcional,
  /** Segundos que se reusa la definición de un método de METODOS_WEBSERVICES (0 = leerla en cada llamada). */
  MCP_WEBSERVICE_CACHE_SEGUNDOS: z.preprocess(
    (v) => (v === undefined || (typeof v === 'string' && v.trim() === '') ? 60 : v),
    z.coerce.number().int().min(0),
  ),
  ZONA_HORARIA_BASE: z.string().default('America/Argentina/Buenos_Aires'),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  SEQ_URL: textoOpcional,
  SEQ_API_KEY: textoOpcional,

  FIREBIRD_HOST: z.string().default('127.0.0.1'),
  FIREBIRD_PORT: entero(3050),
  FIREBIRD_DATABASE: z.string().min(1, 'falta la ruta o alias de la base de tickets'),
  FIREBIRD_USER: z.string().default('SYSDBA'),
  FIREBIRD_PASSWORD: textoOpcional,
  FIREBIRD_POOL_MAX: entero(5),
  /** Tope de filas en memoria de la caché de catálogos con búsqueda aproximada. */
  MCP_BUSQUEDA_CACHE_MAX_FILAS: entero(200_000),

  // Modo HTTP + inicio de sesión OAuth (mismos nombres que el MCP de tickets v1).
  MCP_HTTP_PUERTO: entero(3000),
  /** Base pública (detrás de un proxy). Sin valor, se arma con el esquema y el host del request. */
  MCP_URL_PUBLICA: textoOpcional.transform((v) => v?.replace(/\/+$/, '')),
  MCP_AUTH_TIPO: textoConDefecto('alias/clave'),
  MCP_AUTH_TITULO_AUTORIZACION: textoConDefecto('Autorizar acceso al MCP'),
  MCP_AUTH_APIKEY_REQUERIDO: booleano(true),
  MCP_AUTH_APIKEY_TITULO: textoConDefecto('Usuario'),
  MCP_AUTH_APISECRET_REQUERIDO: booleano(true),
  MCP_AUTH_APISECRET_TITULO: textoConDefecto('Clave'),
  MCP_JWT_SIGNING_KEY: textoOpcional,
  MCP_JWT_EXPIRACION_SOBRE_DIAS: entero(15),
  /** Base de OAuth aparte. Cada valor sin definir cae en su equivalente FIREBIRD_*. */
  MCP_OAUTH_DB_HOST: textoOpcional,
  MCP_OAUTH_DB_PORT: enteroOpcional,
  MCP_OAUTH_DB_PATH: textoOpcional,
  MCP_OAUTH_DB_USER: textoOpcional,
  MCP_OAUTH_DB_PASSWORD: textoOpcional,
});

export type Config = z.infer<typeof esquemaConfig>;

/** Catálogos disponibles en funciones/ (archivos <nombre>-functions.json), ordenados. */
export function catalogosDisponibles(): string[] {
  try {
    return readdirSync(DIR_FUNCIONES)
      .filter((archivo) => archivo.endsWith(SUFIJO_FUNCIONES))
      .map((archivo) => archivo.slice(0, -SUFIJO_FUNCIONES.length))
      .sort();
  } catch {
    return [];
  }
}

/** Archivo de funciones del proceso: MCP_FUNCIONES_ARCHIVO, o funciones/<MCP_CATALOGO>-functions.json. */
export function rutaArchivoFunciones(config: Pick<Config, 'MCP_CATALOGO' | 'MCP_FUNCIONES_ARCHIVO'>): string {
  return config.MCP_FUNCIONES_ARCHIVO ? resolve(config.MCP_FUNCIONES_ARCHIVO) : resolve(DIR_FUNCIONES, `${config.MCP_CATALOGO}${SUFIJO_FUNCIONES}`);
}

/** claimRequerida del archivo, leída sin validarlo (la carga completa informa los demás errores). */
function claimRequeridaDe(ruta: string): string | undefined {
  try {
    const archivo = JSON.parse(readFileSync(ruta, 'utf8')) as { servidor?: { claimRequerida?: unknown } };
    const claim = archivo.servidor?.claimRequerida;
    return typeof claim === 'string' ? claim : undefined;
  } catch {
    return undefined;
  }
}

/** Requisitos que dependen del transporte y del catálogo; se informan junto con los del esquema. */
function faltantesPorTransporte(env: NodeJS.ProcessEnv): string[] {
  const vacio = (nombre: string) => (env[nombre] ?? '').trim() === '';
  const transporte = vacio('MCP_TRANSPORTE') ? 'stdio' : env.MCP_TRANSPORTE;
  const catalogo = vacio('MCP_CATALOGO') ? 'tickets' : env.MCP_CATALOGO!.trim();
  const ruta = vacio('MCP_FUNCIONES_ARCHIVO')
    ? resolve(DIR_FUNCIONES, `${catalogo}${SUFIJO_FUNCIONES}`)
    : resolve(env.MCP_FUNCIONES_ARCHIVO!.trim());
  if (!existsSync(ruta)) {
    return vacio('MCP_FUNCIONES_ARCHIVO')
      ? [`MCP_CATALOGO: no existe el catálogo '${catalogo}' (disponibles: ${catalogosDisponibles().join(', ') || 'ninguno'})`]
      : [`MCP_FUNCIONES_ARCHIVO: no existe ${ruta}`];
  }
  if (transporte === 'stdio') {
    const claim = claimRequeridaDe(ruta);
    const variable = claim && claim in VARIABLE_DE_CLAIM ? VARIABLE_DE_CLAIM[claim as ClaimStdio] : undefined;
    if (variable && vacio(variable)) {
      return [`${variable}: obligatorio por stdio para el catálogo ${catalogo} (${claim} de JKMate, entero positivo)`];
    }
  }
  if (transporte === 'http' && vacio('MCP_JWT_SIGNING_KEY')) {
    return ['MCP_JWT_SIGNING_KEY: obligatorio con MCP_TRANSPORTE=http (secreto HS256 de los tokens)'];
  }
  return [];
}

/** Lee la configuración desde variables de entorno. Falla al arrancar si algún valor es inválido. */
export function cargarConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const resultado = esquemaConfig.safeParse(env);
  const problemas = [
    ...faltantesPorTransporte(env),
    ...(resultado.success ? [] : resultado.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)),
  ];
  if (problemas.length > 0 || !resultado.success) {
    throw new Error(`Configuración inválida: ${problemas.join('; ')}`);
  }
  return resultado.data;
}

/** COD_USUARIO del proceso en stdio. `cargarConfig` ya garantiza que existe en ese modo. */
export function codUsuarioStdio(config: Pick<Config, 'MCP_COD_USUARIO'>): number {
  if (config.MCP_COD_USUARIO === undefined) throw new Error('Configuración inválida: falta MCP_COD_USUARIO');
  return config.MCP_COD_USUARIO;
}

/** Conexión de la base de OAuth: MCP_OAUTH_DB_* con caída en FIREBIRD_*. */
export function configBaseOAuth(config: Config) {
  return {
    FIREBIRD_HOST: config.MCP_OAUTH_DB_HOST ?? config.FIREBIRD_HOST,
    FIREBIRD_PORT: config.MCP_OAUTH_DB_PORT ?? config.FIREBIRD_PORT,
    FIREBIRD_DATABASE: config.MCP_OAUTH_DB_PATH ?? config.FIREBIRD_DATABASE,
    FIREBIRD_USER: config.MCP_OAUTH_DB_USER ?? config.FIREBIRD_USER,
    FIREBIRD_PASSWORD: config.MCP_OAUTH_DB_PASSWORD ?? config.FIREBIRD_PASSWORD,
    FIREBIRD_POOL_MAX: config.FIREBIRD_POOL_MAX,
  };
}

/** True si la base de OAuth es otra distinta de la de tickets (hace falta un pool aparte). */
export function baseOAuthSeparada(config: Config): boolean {
  return [config.MCP_OAUTH_DB_HOST, config.MCP_OAUTH_DB_PORT, config.MCP_OAUTH_DB_PATH, config.MCP_OAUTH_DB_USER, config.MCP_OAUTH_DB_PASSWORD].some(
    (v) => v !== undefined,
  );
}

/** Variable de entorno de cada clave de identidad en stdio (la de COD_CREDENCIAL_MCP no existe: solo http). */
export const VARIABLE_DE_CLAIM = {
  COD_USUARIO: 'MCP_COD_USUARIO',
  COD_VENDEDOR: 'MCP_COD_VENDEDOR',
  COD_DESARROLLADOR: 'MCP_COD_DESARROLLADOR',
  COD_PROVEEDOR: 'MCP_COD_PROVEEDOR',
  COD_CLIENTE: 'MCP_COD_CLIENTE',
  COD_EMPRESA: 'MCP_COD_EMPRESA',
  SECUENCIAL_EMPRESA: 'MCP_SECUENCIAL_EMPRESA',
} as const satisfies Record<string, keyof Config>;

export type ClaimStdio = keyof typeof VARIABLE_DE_CLAIM;

/** Identidad del proceso en stdio, desde las variables MCP_COD_*. */
export function sesionStdio(config: Pick<Config, (typeof VARIABLE_DE_CLAIM)[ClaimStdio]>): Sesion {
  const valor = (clave: ClaimStdio) => config[VARIABLE_DE_CLAIM[clave]] ?? null;
  return {
    codUsuario: valor('COD_USUARIO'),
    codDesarrollador: valor('COD_DESARROLLADOR'),
    codVendedor: valor('COD_VENDEDOR'),
    transporte: 'stdio',
    claims: Object.fromEntries(
      (Object.keys(VARIABLE_DE_CLAIM) as ClaimStdio[]).map((c) => [c, valor(c) === null ? '' : String(valor(c))]),
    ),
  };
}
