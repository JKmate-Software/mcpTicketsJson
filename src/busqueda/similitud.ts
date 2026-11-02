/**
 * Similitud aproximada entre nombres propios en español (barrios, calles, localidades…), tolerante a
 * mayúsculas, tildes, puntuación, errores de tipeo típicos (b/v, s/z/c, ll/y, h muda, letras dobles,
 * letras faltantes/sobrantes/transpuestas) y a palabras en distinto orden.
 *
 * Port fiel de `SimilitudTexto.cs` del MCP de tickets v1: los dos servidores tienen que puntuar
 * igual (lo verifica `similitud.test.ts` contra una tabla generada con el código de la v1).
 *
 * Puntaje (0-100) de un texto buscado contra un valor = máximo de:
 *   - igualdad exacta de los textos normalizados (100);
 *   - similitud de string completo (Damerau-Levenshtein OSA normalizado), literal y fonética;
 *   - promedio por token buscado del mejor token del valor (máx. entre similitud literal, fonética
 *     y "es prefijo" = 90), menos una penalización leve por tokens de más en el valor.
 */

/** Texto normalizado y tokenizado con su clave fonética por token. Las filas de un catálogo se preparan una vez. */
export interface TextoPreparado {
  normalizado: string;
  tokens: string[];
  foneticos: string[];
  foneticoCompleto: string;
}

/** Palabras de enlace que no aportan a distinguir un nombre de otro. */
const CONECTORES = new Set(['DE', 'DEL', 'LA', 'LAS', 'LOS', 'EL', 'Y']);

const PUNTAJE_PREFIJO = 90;
const PENALIZACION_POR_TOKEN_SOBRANTE = 3;
const PENALIZACION_MAXIMA = 10;
const LONGITUD_MAXIMA_COMPARADA = 120;
const LONGITUD_TOKEN_CORTO = 4;
const PENALIZACION_TOKEN_CORTO = 15;

const MARCA_NO_ESPACIADA = /\p{Mn}/u;
const LETRA_O_DIGITO = /[\p{L}\p{Nd}]/u;

export function preparar(texto: string | null | undefined): TextoPreparado {
  const normalizado = normalizar(texto);
  const todos = normalizado.length === 0 ? [] : normalizado.split(' ');
  // Se descartan conectores, salvo que no quede ninguno. Las letras sueltas NO: distinguen
  // "MANZANA M" de "MANZANA C".
  let tokens = todos.filter((t) => !CONECTORES.has(t));
  if (tokens.length === 0) tokens = todos;
  const foneticos = tokens.map(fonetica);
  return { normalizado, tokens, foneticos, foneticoCompleto: foneticos.join(' ') };
}

/** Mayúsculas, sin diacríticos (Ñ→N, Á→A…), puntuación y "°" a espacio, espacios colapsados. */
export function normalizar(texto: string | null | undefined): string {
  if (!texto || texto.trim() === '') return '';
  const descompuesto = texto.toUpperCase().normalize('NFD');
  let salida = '';
  let ultimoFueEspacio = true;
  // Por unidad UTF-16, igual que el foreach sobre string de .NET.
  for (let i = 0; i < descompuesto.length; i++) {
    const c = descompuesto[i]!;
    if (MARCA_NO_ESPACIADA.test(c)) continue;
    if (LETRA_O_DIGITO.test(c)) {
      salida += c;
      ultimoFueEspacio = false;
    } else if (!ultimoFueEspacio) {
      salida += ' ';
      ultimoFueEspacio = true;
    }
  }
  return salida.trimEnd();
}

/**
 * Clave fonética aproximada en español rioplatense para un token ya normalizado:
 * V→B, Z→S, C(E/I)→S, QU→K, C(A/O/U)→K, G(E/I)→J, LL→Y→I, H muda, dobles colapsadas.
 */
export function fonetica(token: string): string {
  if (token.length === 0) return token;
  // "CH" es un sonido propio: se protege con un marcador para que ni la C ni la H muda lo rompan.
  const MARCA_CH = '§';
  const s = token.replaceAll('CH', MARCA_CH).replaceAll('QU', 'K').replaceAll('LL', 'Y');
  let salida = '';
  for (let i = 0; i < s.length; i++) {
    let c = s[i]!;
    const siguiente = s[i + 1] ?? '';
    switch (c) {
      case 'H':
        continue;
      case 'V':
      case 'W':
        c = 'B';
        break;
      case 'Z':
        c = 'S';
        break;
      case 'C':
        c = siguiente === 'E' || siguiente === 'I' ? 'S' : 'K';
        break;
      case 'G':
        if (siguiente === 'E' || siguiente === 'I') c = 'J';
        break;
      case 'Y':
        c = 'I';
        break;
    }
    if (salida.length === 0 || salida[salida.length - 1] !== c) salida += c;
  }
  return salida.replaceAll(MARCA_CH, 'CH');
}

/** Redondeo al par en el punto medio, como `Math.Round` de .NET (si no, algunos puntajes difieren de la v1). */
function redondearAlPar(valor: number): number {
  const piso = Math.floor(valor);
  const diferencia = valor - piso;
  if (diferencia > 0.5) return piso + 1;
  if (diferencia < 0.5) return piso;
  return piso % 2 === 0 ? piso : piso + 1;
}

/** Puntaje 0-100 del texto buscado contra un valor, ambos ya preparados. */
export function puntaje(buscado: TextoPreparado, valor: TextoPreparado): number {
  if (buscado.normalizado.length === 0 || valor.normalizado.length === 0) return 0;
  if (buscado.normalizado === valor.normalizado) return 100;

  let mejor = Math.max(similitud(buscado.normalizado, valor.normalizado), similitud(buscado.foneticoCompleto, valor.foneticoCompleto));

  if (buscado.tokens.length > 0 && valor.tokens.length > 0) {
    let suma = 0;
    for (let i = 0; i < buscado.tokens.length; i++) {
      let mejorToken = 0;
      for (let j = 0; j < valor.tokens.length && mejorToken < 100; j++) {
        mejorToken = Math.max(mejorToken, puntajeToken(buscado.tokens[i]!, buscado.foneticos[i]!, valor.tokens[j]!, valor.foneticos[j]!));
      }
      suma += mejorToken;
    }
    const sobrantes = Math.max(0, valor.tokens.length - buscado.tokens.length);
    const penalizacion = Math.min(PENALIZACION_MAXIMA, sobrantes * PENALIZACION_POR_TOKEN_SOBRANTE);
    mejor = Math.max(mejor, suma / buscado.tokens.length - penalizacion);
  }

  // 100 queda reservado a la igualdad exacta: un valor idéntico siempre queda por encima.
  return redondearAlPar(Math.min(99, Math.max(0, mejor)));
}

function puntajeToken(buscado: string, buscadoFonetico: string, valor: string, valorFonetico: string): number {
  if (buscado === valor) return 100;
  let resultado = Math.max(similitud(buscado, valor), similitud(buscadoFonetico, valorFonetico));
  // En palabras cortas un solo error es una fracción grande del token: se castiga para que no pase el umbral solo.
  if (Math.max(buscado.length, valor.length) <= LONGITUD_TOKEN_CORTO) resultado -= PENALIZACION_TOKEN_CORTO;
  if (buscado.length >= 3 && (valor.startsWith(buscado) || valorFonetico.startsWith(buscadoFonetico))) {
    resultado = Math.max(resultado, PUNTAJE_PREFIJO);
  }
  return resultado;
}

/** 100·(1 − distancia/longitud mayor), con distancia Damerau-Levenshtein (OSA). */
export function similitud(a: string, b: string): number {
  const x = a.length > LONGITUD_MAXIMA_COMPARADA ? a.slice(0, LONGITUD_MAXIMA_COMPARADA) : a;
  const y = b.length > LONGITUD_MAXIMA_COMPARADA ? b.slice(0, LONGITUD_MAXIMA_COMPARADA) : b;
  const maximo = Math.max(x.length, y.length);
  if (maximo === 0) return 100;
  return 100 * (1 - distanciaOsa(x, y) / maximo);
}

/** Distancia de edición con inserción, borrado, sustitución y transposición de adyacentes. */
export function distanciaOsa(a: string, b: string): number {
  const n = a.length;
  const m = b.length;
  if (n === 0) return m;
  if (m === 0) return n;
  // Tres filas rodantes (la transposición mira dos filas atrás).
  let anterior2 = new Array<number>(m + 1).fill(0);
  let anterior = Array.from({ length: m + 1 }, (_, j) => j);
  let actual = new Array<number>(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    actual[0] = i;
    for (let j = 1; j <= m; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      let valor = Math.min(anterior[j]! + 1, actual[j - 1]! + 1, anterior[j - 1]! + costo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) valor = Math.min(valor, anterior2[j - 2]! + 1);
      actual[j] = valor;
    }
    [anterior2, anterior, actual] = [anterior, actual, anterior2];
  }
  return anterior[m]!;
}
