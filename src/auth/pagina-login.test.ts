import { describe, expect, it } from 'vitest';
import { renderPaginaLogin, type ConfigPaginaLogin } from './pagina-login.js';

const POR_DEFECTO: ConfigPaginaLogin = {
  titulo: 'Autorizar acceso al MCP',
  apiKeyRequerido: true,
  apiKeyTitulo: 'Usuario',
  apiSecretRequerido: true,
  apiSecretTitulo: 'Clave',
};
const DATOS = { clientId: 'mcp-tickets-client', redirectUri: 'http://localhost:5555/callback', state: 'xyz', codeChallenge: 'abc' };

describe('página de login', () => {
  it('formulario por defecto: encabezado, Usuario de texto y Clave de tipo password', () => {
    const html = renderPaginaLogin(POR_DEFECTO, DATOS);
    expect(html).toContain('<h2>Autorizar acceso al MCP</h2>');
    expect(html).toContain('<title>Autorizar acceso al MCP — Iniciar sesión</title>');
    expect(html).toMatch(/Usuario <input type="text" name="apikey" autofocus required>/);
    expect(html).toMatch(/Clave <input type="password" name="apisecret" required>/);
    expect(html).toContain('name="code_challenge" value="abc"');
  });

  it('login de un solo campo con títulos propios', () => {
    const html = renderPaginaLogin({ ...POR_DEFECTO, titulo: 'Tickets JKMate', apiKeyTitulo: 'Teléfono', apiSecretRequerido: false }, DATOS);
    expect(html).toContain('<h2>Tickets JKMate</h2>');
    expect(html).toContain('Teléfono <input type="text" name="apikey" autofocus required>');
    expect(html).not.toContain('name="apisecret"');
  });

  it('si solo hay clave, la clave lleva el foco', () => {
    const html = renderPaginaLogin({ ...POR_DEFECTO, apiKeyRequerido: false }, DATOS);
    expect(html).not.toContain('name="apikey"');
    expect(html).toContain('name="apisecret" autofocus required');
  });

  it('textos configurados y datos del request escapados', () => {
    const html = renderPaginaLogin({ ...POR_DEFECTO, titulo: '<b>MCP</b>' }, { ...DATOS, state: '"><script>x</script>' }, 'Error <grave>');
    expect(html).toContain('<h2>&lt;b&gt;MCP&lt;/b&gt;</h2>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('value="&quot;&gt;&lt;script&gt;x&lt;/script&gt;"');
    expect(html).toContain('Error &lt;grave&gt;');
  });
});
