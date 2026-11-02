# Tasks

## 1. Verificación previa y dependencias

- [x] 1.1 Confirmar en `SANTAROSA64_IA` (base de desarrollo y pruebas; nunca `CREAR_JK3`, que es producción) que existen `PROC_GET_AUTH_CREDENCIAL` (con las 10 columnas de salida de D4), `MCP_OAUTH_CREDENCIALES` y `MCP_OAUTH_TOKENS_REVOCADOS`: verificado el 2026-10-29 durante la planificación y registrado en design.md D4
- [ ] 1.3 Preparar en `.env` local la conexión a `SANTAROSA64_IA` (10.0.0.32) y conseguir del usuario una credencial de prueba `alias/clave` con fila activa en `MCP_OAUTH_CREDENCIALES`; verificar con una llamada manual a `PROC_GET_AUTH_CREDENCIAL` que devuelve `OK=1`
- [x] 1.2 Agregar `express`, `jose` y `@types/express` a `package.json`; verificar con `npm install` y `npm run typecheck`

## 2. Configuración y transporte

- [x] 2.1 Ampliar `src/config.ts` con las variables de D8 y validación condicional por `MCP_TRANSPORTE`; tests en `src/config.test.ts`: default stdio, valor inválido, http sin `MCP_JWT_SIGNING_KEY`, booleanos `true/false/1/0` e inválidos, defaults de títulos, `MCP_OAUTH_DB_*` que cae en `FIREBIRD_*`
- [x] 2.2 Separar en `src/index.ts` el arranque stdio actual del nuevo arranque http (sin cambiar el comportamiento stdio); verificar con `npm test` (incluido `test/stdio.test.ts`) en verde

## 3. Núcleo de autenticación

- [x] 3.1 Implementar `src/auth/jwt.ts` (emitir/validar HS256 con `jose`, 7 claims siempre presentes, `jti`, tolerancia de 60 s); tests: ida y vuelta, firma inválida, vencido, sin `jti`, claims técnicas filtradas, y un JWT de ejemplo emitido por la v1 aceptado (fixture)
- [x] 3.2 Implementar `src/auth/credenciales.ts` (llamada a `PROC_GET_AUTH_CREDENCIAL`, reintento MD5 ante `OK=-66`, gate `MCP_OAUTH_CREDENCIALES` solo para `alias/clave`, consulta de revocados y de credencial activa); unit tests con acceso a datos simulado para cada rama
- [x] 3.3 Implementar `src/auth/codigos.ts` (código aleatorio, TTL de 5 min, un solo uso); tests de vencimiento y reuso
- [x] 3.4 Implementar `src/auth/pagina-login.ts` (render y escape); tests de los escenarios "Formulario por defecto", "Login de un solo campo con títulos propios" y "Textos configurados escapados"

## 4. Endpoints HTTP

- [x] 4.1 Implementar `src/auth/rutas-oauth.ts` con discovery, `/register`, `GET`/`POST /authorize`, `/token` (los dos grants) y `/token/renovar`, con errores JSON y 500 sin body vacío; tests con `supertest` o `fetch` contra el app en memoria, uno por escenario de la spec `autenticacion-oauth`
- [x] 4.2 Implementar `src/auth/middleware-bearer.ts` (401 con `WWW-Authenticate`, revocado, credencial inactiva → 401, claim requerida vacía → 403 (la claim llega por parámetro; en tickets, `COD_USUARIO`), `Sesion` desde claims); tests de cada caso
- [x] 4.3 Implementar `src/http.ts` (express + `/mcp` stateless con un `Server` por request, 405 en GET/DELETE, `MCP_URL_PUBLICA`); test: `tools/list` y `listar_tickets` con `asignadoA: "yo"` para dos tokens distintos devuelven la identidad de cada uno
- [x] 4.4 Verificar que ningún log contiene clave, token ni código (test que captura la salida de Pino durante un login fallido, uno exitoso y una renovación)

## 5. Integración y documentación

- [ ] 5.1 Test de integración contra `SANTAROSA64_IA` (`test/integracion/oauth.test.ts`, en `npm run test:integracion`): `client_credentials` con la credencial de prueba → token con las claims esperadas → `/token/renovar` → `/mcp` acepta el Bearer en `tools/list`; clave incorrecta → 401. Sin invocar tools de tickets, porque esa base no tiene los SP `_AG`
- [ ] 5.2 Prueba manual del navegador contra `SANTAROSA64_IA`: abrir `/authorize` con parámetros PKCE armados a mano, verificar el formulario según las variables `MCP_AUTH_*` y la redirección con `code`; anotar el resultado en este archivo. La prueba con Claude Code y tools reales queda en `agregar-mcp-prospeccion`
- [x] 5.3 Actualizar `README.md`, `docs/instalacion.md` (sección "Publicarlo por HTTP"), `.env.example` (variables nuevas, `MCP_JWT_SIGNING_KEY` vacía) y el contexto de `openspec/config.yaml` (stdio default + HTTP/OAuth opcional, revisando la decisión del 2026-10-17); verificar que los comandos documentados corren tal cual

## Workflow follow-up

- Implementar después el change `agregar-mcp-prospeccion`, que hace la prueba de punta a punta con tools reales sobre `SANTAROSA64_IA`.
- Archivar el change con `/opsx:archive` una vez revisado.
- Después, explorar (`/opsx:explore`) el change siguiente: sacar las descripciones de las tools y la información del MCP del código fuente a un JSON separado.
