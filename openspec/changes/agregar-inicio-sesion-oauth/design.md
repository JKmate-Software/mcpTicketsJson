# Design

## Context

- Hoy `src/index.ts` arma una `Sesion` fija (`MCP_COD_USUARIO` + su `COD_DESARROLLADOR` resuelto al arrancar), crea **un** `Server` y lo conecta a `StdioServerTransport`. Las tools reciben la `Sesion` por `ejecutarTool(...)` y no saben de dónde salió.
- `crearServidorMcp(tools, { logger, sesion })` ya recibe la sesión como dependencia, así que basta con construir un servidor por request con la sesión del token.
- El mecanismo a replicar es el de `mcp-server/` (.NET, MCP de tickets v1): `Oauth/*.cs`, `Security/JwtTokenService.cs`, `Config/McpOAuthOptions.cs` y el mapeo de variables en `Program.cs`. Este design copia su comportamiento observable. No copia su código.
- Motivación: ver proposal.md → Why. Requisitos: specs `transporte-servidor`, `autenticacion-oauth` y el delta de `contrato-tools`.

## Goals / Non-Goals

**Goals:**
- Paridad de comportamiento con el login de la v1: endpoints, códigos de error, formulario dinámico, `PROC_GET_AUTH_CREDENCIAL`, reintento MD5, gate de `MCP_OAUTH_CREDENCIALES` y revocación por `jti`.
- Mismos nombres de variables de entorno que la v1, para copiar una configuración de un despliegue al otro.
- Tokens intercambiables con la v1 (federación por secreto compartido).
- Stdio intacto: mismo comportamiento, mismos tests y la medición sin cambios.

**Non-Goals:**
- Sin refresh tokens estándar de OAuth. La renovación es el `/token/renovar` propio de la v1, igual que allá.
- Sin persistencia de clientes registrados ni de códigos de autorización (en memoria, como la v1).
- Sin endpoint de revocación: los tokens se revocan insertando en `MCP_OAUTH_TOKENS_REVOCADOS` desde la base, como hoy.
- No se mueven las descripciones de tools a JSON (eso es otro change, a explorar después).
- Sin DDL nuevo.

## Decisions

### D1. Stdio sigue siendo el default y HTTP es opt-in (`MCP_TRANSPORTE`)
- **Por qué:** el README, la instalación en Claude Desktop y los scripts `medir*` dependen de stdio. Reemplazarlo rompería todo eso sin necesidad.
- **Alternativa descartada:** pasar a solo HTTP, como la v1. Obliga a levantar un servicio para cualquier prueba local y revierte la decisión del 2026-10-17 entera.

### D2. HTTP con `express` + `StreamableHTTPServerTransport` del SDK, en modo *stateless*
- Por cada `POST /mcp` autenticado se crea un `Server` con `crearServidorMcp(tools, { logger, sesion })` (sesión sacada del token) y un transporte con `sessionIdGenerator: undefined`. Al cerrar la respuesta se cierran los dos. `GET`/`DELETE /mcp` → 405 (sin streams de servidor, ninguna tool los usa).
- **Por qué stateless:** la identidad viaja en cada request (Bearer), y las tools son lecturas sin estado. Así se evita mapear `mcp-session-id` → identidad y el riesgo de reusar una sesión con otro token.
- **Alternativa:** stateful con mapa de sesiones, que agrega estado y limpieza sin beneficio para estas tools.
- `express` ya llega como dependencia transitiva del SDK. Se declara explícita en `package.json`.

### D3. JWT con `jose` (HS256), formato idéntico al de la v1
- Payload: las claims de identidad tal cual las devuelve el procedure, en MAYÚSCULAS y como string, más `jti` (UUID sin guiones), `iat`, `nbf` y `exp`. Sin `iss`/`aud`, porque la v1 no los valida ni los emite y agregarlos rompería la federación.
- Validación: firma + `exp`/`nbf` con 60 s de tolerancia. Toda claim que no sea técnica (`jti iat nbf exp iss aud`) pasa a ser claim de negocio. Los nombres se comparan sin distinguir mayúsculas.
- **Alternativa:** `jsonwebtoken` (CommonJS, API de callbacks). `jose` es ESM nativo, sin dependencias y tipado, y encaja con el proyecto (`"type": "module"`).

### D4. Flujo de login: misma lógica que `CredentialValidator` de la v1
1. `SELECT OK, COD_TOKEN_MCP, ERROR_MSG, COD_USUARIO, COD_VENDEDOR, COD_DESARROLLADOR, COD_PROVEEDOR, COD_CLIENTE, COD_EMPRESA, SECUENCIAL_EMPRESA FROM PROC_GET_AUTH_CREDENCIAL(?, ?, ?)`.
2. Si `OK = -66` → un reintento con `md5(apisecret)` en hex minúscula (`node:crypto`).
3. Si `OK <> 1` → fallo.
4. Se arma el diccionario con las 7 claves (vacías si son NULL).
5. Solo con `alias/clave`: se exige `COD_USUARIO` no nulo y `SELECT COD_CREDENCIAL_MCP FROM MCP_OAUTH_CREDENCIALES WHERE COD_USUARIO = ? AND ACTIVO = 1`. Si no hay fila → fallo; si hay → claim `COD_CREDENCIAL_MCP`.
- `client_credentials` y el formulario usan exactamente esta función. `authorization_code` no revalida: el código ya trae las claims resueltas.
- **Objetos de base:** `PROC_GET_AUTH_CREDENCIAL` (entrada `TIPO_AUTH, APIKEY, APISECRET`; salida `OK, COD_TOKEN_MCP, ERROR_MSG` y las 7 claves de identidad), `MCP_OAUTH_CREDENCIALES (COD_CREDENCIAL_MCP, COD_USUARIO, ACTIVO)` y `MCP_OAUTH_TOKENS_REVOCADOS (JTI)`. **Verificados el 2026-10-29 en `SANTAROSA64_IA`** (10.0.0.32), que es la base de desarrollo y pruebas de este change. No se crean desde este change.
- **Bases:** `CREAR_JK3` es producción. No se usa para desarrollar, probar ni crear objetos. Ningún test ni tarea de este change apunta a ella. En un despliegue contra la base real de tickets, la existencia de estos objetos la confirma el usuario.

### D5. Base de OAuth: por defecto la misma de tickets
- `MCP_OAUTH_DB_HOST/PORT/PATH/USER/PASSWORD`, si están definidas, abren un pool aparte (como la v1). Si no, el login usa el mismo pool `FIREBIRD_*`.
- **Por qué:** en la v1 las dos bases suelen coincidir. Exigir duplicar la configuración solo agrega errores.

### D6. Identidad en HTTP
- `Sesion.codUsuario` = `Number(COD_USUARIO)`; `Sesion.codDesarrollador` = `Number(COD_DESARROLLADOR)` o `null` si está vacía. No se consulta la base: el procedure ya lo resolvió al hacer login.
- Claim requerida vacía (en tickets, `COD_USUARIO`) → 403 `insufficient_scope` con mensaje explicativo (spec "Token sin la identidad que exige el servidor"). La alternativa (aceptar y fallar en cada tool) da errores confusos al agente.
- Si el token trae `COD_CREDENCIAL_MCP`, en cada request se verifica que su `COD_USUARIO` tenga una fila con `ACTIVO = 1` en `MCP_OAUTH_CREDENCIALES`. Igual que la v1 (`FindActiveByCodUsuarioAsync`), se busca por `COD_USUARIO` y no por el código de credencial del token, así un token federado recibe la misma respuesta en los dos servidores. Es una consulta más por request y se acepta por paridad.
- `Sesion` sigue con la misma forma. Las tools no cambian.

### D7. Página de login
- HTML generado en el servidor con plantilla literal y escape propio (`& < > " '`) en todo texto configurable o que venga del request: títulos, `client_id`, `redirect_uri`, `state`, `code_challenge` y el mensaje de error. Es el mismo layout mínimo de la v1 (`<h2>`, campos, botón "Autorizar"). El `<title>` es "{título} — Iniciar sesión".
- El primer campo visible lleva `autofocus`. Los campos ocultos (`client_id`, `redirect_uri`, `state`, `code_challenge`) viajan en el POST.
- `MCP_AUTH_*_REQUERIDO` se parsea con zod: acepta `true/false/1/0` sin distinguir mayúsculas. Cualquier otro valor corta el arranque (spec `transporte-servidor`).

### D8. Configuración (`src/config.ts`)
Esquema zod con validación condicional: si `MCP_TRANSPORTE=stdio`, se exige `MCP_COD_USUARIO`; si es `http`, se exige `MCP_JWT_SIGNING_KEY`.

| Variable | Default | Uso |
|---|---|---|
| `MCP_TRANSPORTE` | `stdio` | `stdio` \| `http` |
| `MCP_HTTP_PUERTO` | `3000` | Puerto HTTP |
| `MCP_URL_PUBLICA` | — | Base para metadata y `WWW-Authenticate` (si falta: esquema + host del request) |
| `MCP_AUTH_TIPO` | `alias/clave` | 1.er parámetro de `PROC_GET_AUTH_CREDENCIAL` |
| `MCP_AUTH_TITULO_AUTORIZACION` | `Autorizar acceso al MCP` | Encabezado/título de la página |
| `MCP_AUTH_APIKEY_REQUERIDO` / `_TITULO` | `true` / `Usuario` | Campo `apikey` |
| `MCP_AUTH_APISECRET_REQUERIDO` / `_TITULO` | `true` / `Clave` | Campo `apisecret` |
| `MCP_JWT_SIGNING_KEY` | — | Secreto HS256 (obligatorio en http) |
| `MCP_JWT_EXPIRACION_SOBRE_DIAS` | `15` | Vigencia del JWT |
| `MCP_OAUTH_DB_*` | `FIREBIRD_*` | Base de OAuth (D5) |

### D9. Estructura de código
```
src/auth/sesion.ts            (sin cambios)
src/auth/configuracion-auth.ts  subconjunto tipado de Config para OAuth
src/auth/credenciales.ts      PROC_GET_AUTH_CREDENCIAL + gate + revocados (usa AccesoDatos)
src/auth/jwt.ts               emitir / validar sobre (jose)
src/auth/codigos.ts           códigos de autorización en memoria (TTL 5 min, un uso)
src/auth/pagina-login.ts      render HTML + escape
src/auth/rutas-oauth.ts       router express: well-known, register, authorize, token, token/renovar
src/auth/middleware-bearer.ts valida Bearer → Sesion en res.locals; 401/403
src/http.ts                   arma express + /mcp stateless
src/index.ts                  elige stdio o http según config
```
- `AccesoDatos` (`src/db/firebird.ts`) se amplía con `ejecutarConsulta` genérico, o se agrega un acceso chico en `credenciales.ts` sobre el mismo pool. Se define al implementar, sin efecto en specs.

### D10. Errores y logging
- Respuestas OAuth en JSON `{ error, error_description? }` con los mismos códigos y status de la v1.
- Errores no controlados en rutas OAuth → 500 JSON `{ error: "server_error" }`, nunca body vacío (lección de la v1).
- Logs con Pino: `login` (tipo, apikey, resultado), `token emitido/renovado` (sin el token), `bearer rechazado` (motivo). Nunca la clave, el token ni el código.

## Risks / Trade-offs

- **[`SANTAROSA64_IA` no tiene los SP `_AG` de tickets]** → No se pueden invocar las tools de tickets por `/mcp` contra datos reales. Acá el login se prueba de punta a punta solo hasta el token (emitir, renovar, Bearer en `/mcp` con acceso simulado). La prueba completa con tools reales, que incluye un login `tlfvendedor` sin clave, se hace con el catálogo de prospección del change `agregar-mcp-prospeccion`, que depende de este.
- **[La claim requerida varía por MCP]** → El middleware Bearer recibe por parámetro el nombre de la claim requerida (acá, fijo `COD_USUARIO`). El change `agregar-mcp-prospeccion` hace que lo aporte el catálogo activo (`COD_VENDEDOR` en prospección), sin cambiar este requisito.
- **[Charset]** El proyecto conecta en UTF8 y la v1 usa la conexión .NET por defecto. Un `apikey`/`apisecret` con acentos podría llegar distinto al procedure → test de integración con una credencial con caracteres no ASCII, si existe alguna.
- **[Secreto compartido = federación total]** Cualquiera con `MCP_JWT_SIGNING_KEY` emite tokens para cualquier usuario → mismo riesgo que ya acepta la v1. El secreto va solo en variables de entorno del servicio, nunca en el repo ni en `.env.example`.
- **[Stateless crea un `Server` por request]** Costo menor (registrar 4 tools) frente a la consulta a Firebird. Se acepta.
- **[Códigos en memoria]** Si el proceso se reinicia en medio de un login, el usuario reintenta. Igual que la v1.
- **[Revierte en parte la decisión del 2026-10-17]** → Queda documentado en `openspec/config.yaml` y en el README que HTTP + OAuth vuelve como modo opcional.

## Migration Plan

1. Sin cambios para quien usa stdio: la configuración actual sigue funcionando.
2. Para publicar en HTTP: definir `MCP_TRANSPORTE=http`, `MCP_HTTP_PUERTO`, `MCP_JWT_SIGNING_KEY` (el mismo de la v1 si se quiere federación), `MCP_AUTH_*` y, detrás de un proxy, `MCP_URL_PUBLICA`. Agregarlo en Claude Code con `claude mcp add --transport http tickets-v2 <url>/mcp`.
3. Rollback: volver a `MCP_TRANSPORTE=stdio` (o quitar la variable).
