import sanitizeHtml from 'sanitize-html';

/**
 * Hay marcado si aparece algo que un navegador interpretaría: una etiqueta, un atributo de evento,
 * una URL javascript: o una entidad numérica. Sin eso, el texto no se toca: así "Pérez & Hijos" o
 * "monto < 500" llegan iguales (sanitizar siempre los convertiría en &amp; o &lt; y cambiaría una búsqueda).
 */
const MARCADO = /<[a-z!/?]|\bon[a-z]+\s*=|javascript:|&#/i;

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Deshace el escapado que sanitize-html aplica al texto que deja: el resultado es texto plano, no HTML. */
function decodificar(texto: string): string {
  return texto.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entidad, cuerpo: string) => {
    if (cuerpo[0] === '#') {
      const codigo = cuerpo[1] === 'x' || cuerpo[1] === 'X' ? Number.parseInt(cuerpo.slice(2), 16) : Number(cuerpo.slice(1));
      return Number.isFinite(codigo) ? String.fromCodePoint(codigo) : entidad;
    }
    return ENTIDADES[cuerpo.toLowerCase()] ?? entidad;
  });
}

/**
 * Quita el HTML y el JavaScript ejecutable de un texto: no queda ninguna etiqueta (script y style se
 * descartan con su contenido) y el resto vuelve como texto plano. Los datos van a un procedure, no a
 * una página: a diferencia de HtmlSanitizer de JKMate3, no se conservan ni las etiquetas "seguras".
 */
export function sanitizarTexto(texto: string): string {
  let actual = texto;
  // Se repite hasta que no quede marcado: decodificar '&#60;script&#62;' produciría '<script>'.
  for (let vuelta = 0; vuelta < 5 && MARCADO.test(actual); vuelta++) {
    actual = decodificar(
      sanitizeHtml(actual, {
        allowedTags: [],
        allowedAttributes: {},
        disallowedTagsMode: 'discard',
        nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'iframe', 'object'],
      }),
    );
  }
  // Si después de varias vueltas sigue habiendo marcado, se neutralizan los signos que lo forman.
  return MARCADO.test(actual) ? actual.replace(/[<>]/g, '').replace(/&#/g, '') : actual;
}

const pareceJson = (texto: string) => /^\s*[[{]/.test(texto);

/** Sanitiza un valor recorriendo objetos, arrays y textos que contienen un JSON. `ruta` = propiedad con punto. */
function sanitizarValor(valor: unknown, ruta: string, excluir: ReadonlySet<string>): unknown {
  if (excluir.has(ruta)) return valor;
  if (typeof valor === 'string') {
    if (pareceJson(valor)) {
      try {
        const interno: unknown = JSON.parse(valor);
        const limpio = sanitizarValor(interno, ruta, excluir);
        return JSON.stringify(limpio) === JSON.stringify(interno) ? valor : JSON.stringify(limpio);
      } catch {
        // No es JSON: se trata como texto común.
      }
    }
    return sanitizarTexto(valor);
  }
  if (Array.isArray(valor)) return valor.map((v) => sanitizarValor(v, ruta, excluir));
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(Object.entries(valor).map(([clave, v]) => [clave, sanitizarValor(v, ruta ? `${ruta}.${clave}` : clave, excluir)]));
  }
  return valor;
}

/** Argumentos de una tool sin HTML ni JavaScript, salvo las propiedades excluidas (`sanitizar: false`). */
export function sanitizarArgumentos(argumentos: unknown, excluir: readonly string[] = []): unknown {
  return sanitizarValor(argumentos, '', new Set(excluir));
}
