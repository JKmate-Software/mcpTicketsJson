import type { EjecutarSql, ValorParametro } from '../db/firebird.js';
import { ErrorTool } from '../errores.js';
import { aTimestampBase, esFechaIsoParametro } from '../mapeo/fecha.js';
import { sanitizarArgumentos } from '../nucleo/sanitizar.js';
import type { Ejecutor } from './datos.js';
import type { EntradaDatos } from './esquema.js';
import type { DependenciasFunciones } from './tipos.js';

/** Definición de un método de METODOS_WEBSERVICES (la misma que usan JKMate3 y la v1). */
export interface MetodoWebservice {
  nombre: string;
  tipo: string;
  ssql: string;
  categoria: string | null;
  /** Parámetros del método: nombre en MAYÚSCULAS → tipo de JK3 (VarChar, Integer, Timestamp...). */
  parametros: Map<string, string>;
}

export const SQL_METODO = 'SELECT COD_METODO_WEBSERVICE, TIPO, SSQL, COD_CATEGORIA_WEBSERVICE FROM PROC_GET_METODO_WEBSERV_X_NOMB(?)';
export const SQL_PARAMETROS_METODO = 'SELECT NOMBRE, TIPO, LONGITUD FROM PROC_GET_PARAMS_METODOS_WEBSERV(?)';

/** Categorías cuyos textos no se sanitizan (igual que WebserviceController.wsmetodo de JKMate3). */
const CATEGORIAS_SIN_SANITIZAR = new Set(['100', '200']);

export async function leerMetodo(ejecutarSql: EjecutarSql, nombre: string): Promise<MetodoWebservice> {
  const [fila] = await ejecutarSql(SQL_METODO, [nombre.trim()]);
  if (!fila) throw new ErrorTool('ERROR_INTERNO', `No se encontró el método de webservice ${nombre} en METODOS_WEBSERVICES.`);
  const parametros = await ejecutarSql(SQL_PARAMETROS_METODO, [Number(fila.COD_METODO_WEBSERVICE)]);
  return {
    nombre,
    tipo: String(fila.TIPO ?? '').trim(),
    ssql: String(fila.SSQL ?? ''),
    categoria: fila.COD_CATEGORIA_WEBSERVICE === null || fila.COD_CATEGORIA_WEBSERVICE === undefined ? null : String(fila.COD_CATEGORIA_WEBSERVICE).trim(),
    parametros: new Map(parametros.map((p) => [String(p.NOMBRE).trim().toUpperCase(), String(p.TIPO ?? '').trim()])),
  };
}

/**
 * SSQL de JK3 → SQL con `?` posicionales. Cada `@NOMBRE` fuera de literales ('...'), identificadores
 * ("...") y comentarios (-- y /* *\/) se reemplaza por `?`, y su nombre se agrega en orden de aparición.
 */
export function traducirSsql(ssql: string): { sql: string; nombres: string[] } {
  let sql = '';
  const nombres: string[] = [];
  let i = 0;
  while (i < ssql.length) {
    const c = ssql[i]!;
    const siguiente = ssql[i + 1];
    if (c === "'" || c === '"') {
      // Literal o identificador: hasta el cierre (una comilla duplicada es una comilla escapada).
      let j = i + 1;
      while (j < ssql.length && !(ssql[j] === c && ssql[j + 1] !== c)) j += ssql[j] === c ? 2 : 1;
      sql += ssql.slice(i, j + 1);
      i = j + 1;
    } else if (c === '-' && siguiente === '-') {
      const fin = ssql.indexOf('\n', i);
      const j = fin === -1 ? ssql.length : fin;
      sql += ssql.slice(i, j);
      i = j;
    } else if (c === '/' && siguiente === '*') {
      const fin = ssql.indexOf('*/', i + 2);
      const j = fin === -1 ? ssql.length : fin + 2;
      sql += ssql.slice(i, j);
      i = j;
    } else if (c === '@' && /[A-Za-z_]/.test(siguiente ?? '')) {
      const m = /^[A-Za-z_][A-Za-z0-9_$]*/.exec(ssql.slice(i + 1))!;
      nombres.push(m[0].toUpperCase());
      sql += '?';
      i += 1 + m[0].length;
    } else {
      sql += c;
      i++;
    }
  }
  return { sql, nombres };
}

const ENTEROS = new Set(['Integer', 'Smallint', 'BigInt', 'Bigint']);
const DECIMALES = new Set(['Decimal', 'Double', 'Float', 'Numeric']);
const FECHAS = new Set(['Date', 'Time', 'Timestamp']);

/** Valor según el tipo del parámetro en la definición del método (mapeo de DirectDbHelper de la v1). */
export function convertirSegunMetodo(valor: ValorParametro, tipoMetodo: string, parametro: string, zonaHoraria: string): ValorParametro {
  if (valor === null) return null;
  if (ENTEROS.has(tipoMetodo) || DECIMALES.has(tipoMetodo)) {
    const numero = typeof valor === 'number' ? valor : Number(String(valor).trim());
    if (String(valor).trim() === '' || !Number.isFinite(numero) || (ENTEROS.has(tipoMetodo) && !Number.isInteger(numero))) {
      throw new ErrorTool('PARAMETRO_INVALIDO', `El parámetro ${parametro} tiene que ser ${ENTEROS.has(tipoMetodo) ? 'un entero' : 'un número'}.`);
    }
    return numero;
  }
  if (tipoMetodo === 'Boolean') return valor === 1 || valor === '1' || String(valor).toLowerCase() === 'true' ? 1 : 0;
  if (FECHAS.has(tipoMetodo) && typeof valor === 'string' && valor.includes('T')) {
    // Igual que wsmetodo: en una fecha ISO, el '+' del offset pudo llegar como espacio.
    const iso = valor.replace(/ /g, '+');
    return esFechaIsoParametro(iso) ? aTimestampBase(iso, zonaHoraria) : iso;
  }
  return valor;
}

/** Ejecutor de una tool `webservice`: compone la llamada con la definición del método guardada en la base. */
export function crearEjecutorWebservice(entrada: EntradaDatos & { tipo: 'webservice' }, deps: DependenciasFunciones): Ejecutor {
  const segundos = deps.cacheWebserviceSegundos ?? 60;
  let cache: { vence: number; metodo: Promise<MetodoWebservice> } | undefined;
  const declarados = [...(entrada.parametros ?? []).map((p) => p.nombre), ...(entrada.campoUsuario ? [entrada.campoUsuario] : [])];
  const noSanitizar = (entrada.parametros ?? []).filter((p) => p.sanitizar === false).map((p) => p.nombre.toUpperCase());

  return async (ejecutarSql, valores) => {
    if (!cache || cache.vence <= Date.now()) {
      const metodo = leerMetodo(ejecutarSql, entrada.metodo);
      cache = { vence: Date.now() + segundos * 1000, metodo };
      metodo.catch(() => {
        if (cache?.metodo === metodo) cache = undefined;
      });
    }
    const metodo = await cache.metodo;

    const sobrantes = declarados.filter((d) => !metodo.parametros.has(d.toUpperCase()));
    if (sobrantes.length) {
      throw new ErrorTool(
        'ERROR_INTERNO',
        `La tool ${entrada.nombre} declara ${sobrantes.join(', ')}, que el método ${metodo.nombre} no tiene (acepta: ${[...metodo.parametros.keys()].join(', ') || 'ninguno'}).`,
      );
    }

    const limpios = metodo.categoria !== null && CATEGORIAS_SIN_SANITIZAR.has(metodo.categoria)
      ? valores
      : (sanitizarArgumentos(valores, noSanitizar) as Record<string, ValorParametro>);
    const { sql, nombres } = traducirSsql(metodo.ssql);
    const parametros = nombres.map((n) => {
      const tipo = metodo.parametros.get(n);
      const valor = limpios[n] ?? null;
      return tipo === undefined ? valor : convertirSegunMetodo(valor, tipo, n, deps.zonaHoraria);
    });

    switch (metodo.tipo) {
      case 'DATASET_SQL':
      case 'DATASET_PROCEDURE':
        return { filas: await ejecutarSql(sql, parametros), tipos: new Map() };
      case 'EXECUTE_SQL':
      case 'EXECUTE_PROCEDURE':
        await ejecutarSql(sql, parametros);
        return { filas: [], tipos: new Map() };
      default:
        throw new ErrorTool('ERROR_INTERNO', `El método ${metodo.nombre} tiene un tipo desconocido: ${metodo.tipo}.`);
    }
  };
}
