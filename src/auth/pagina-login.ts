export interface ConfigPaginaLogin {
  titulo: string;
  apiKeyRequerido: boolean;
  apiKeyTitulo: string;
  apiSecretRequerido: boolean;
  apiSecretTitulo: string;
}

export interface DatosAutorizacion {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escaparHtml(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

/**
 * Formulario de /authorize, mismo layout que la v1. Muestra 0, 1 o 2 campos genéricos
 * ("apikey"/"apisecret") según la configuración: nunca asume que son usuario y clave.
 * El action es relativo para que funcione detrás de un proxy con prefijo de ruta.
 */
export function renderPaginaLogin(config: ConfigPaginaLogin, datos: DatosAutorizacion, mensajeError?: string): string {
  const campos: string[] = [];
  if (config.apiKeyRequerido) {
    campos.push(`<label>${escaparHtml(config.apiKeyTitulo)} <input type="text" name="apikey"${campos.length === 0 ? ' autofocus' : ''} required></label>`);
  }
  if (config.apiSecretRequerido) {
    campos.push(
      `<label>${escaparHtml(config.apiSecretTitulo)} <input type="password" name="apisecret"${campos.length === 0 ? ' autofocus' : ''} required></label>`,
    );
  }
  const titulo = escaparHtml(config.titulo);
  const error = mensajeError ? `<p style="color:#b00020">${escaparHtml(mensajeError)}</p>` : '';
  const oculto = (nombre: string, valor: string) => `<input type="hidden" name="${nombre}" value="${escaparHtml(valor)}">`;

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>${titulo} — Iniciar sesión</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 360px; margin: 80px auto; }
    label { display: block; margin-top: 12px; font-size: 14px; }
    input { width: 100%; padding: 8px; margin-top: 4px; box-sizing: border-box; }
    button { margin-top: 20px; padding: 10px 16px; width: 100%; }
  </style>
</head>
<body>
  <h2>${titulo}</h2>
  ${error}
  <form method="post" action="authorize">
    ${oculto('client_id', datos.clientId)}
    ${oculto('redirect_uri', datos.redirectUri)}
    ${oculto('state', datos.state)}
    ${oculto('code_challenge', datos.codeChallenge)}
    ${campos.join('\n    ')}
    <button type="submit">Autorizar</button>
  </form>
</body>
</html>`;
}
