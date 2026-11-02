# Proposal

## Why

Hoy el servidor corre solo por stdio y la identidad es fija por proceso (`MCP_COD_USUARIO`): no se puede publicar una única instancia para varios usuarios ni usarlo desde clientes remotos (Claude web/Desktop vía URL, Claude Code con `claude mcp add --transport http`). El MCP de tickets v1 (`mcp-server/`, .NET) ya resuelve esto con un inicio de sesión OAuth 2.1 propio contra Firebird, probado en producción; queremos el **mismo mecanismo** acá, configurable por variables, para que la v2 pueda reemplazar a la v1 también en despliegue y no solo en diseño de tools.

## What Changes

- Nuevo modo de transporte **HTTP (Streamable HTTP)** en `/mcp`, seleccionable por configuración. El modo **stdio sigue siendo el default** y se comporta igual que hoy (sin login, identidad por `MCP_COD_USUARIO`); la medición v1/v2 no cambia.
- En modo HTTP, inicio de sesión **OAuth 2.1** idéntico al de la v1:
  - Descubrimiento (`/.well-known/oauth-protected-resource`, `/.well-known/oauth-authorization-server`) y registro dinámico de cliente (`/register`).
  - Página de login en `/authorize` (Authorization Code + PKCE S256).
  - Emisión de token en `/token` (`authorization_code` y `client_credentials`): un JWT HS256 con las claims de identidad que devuelve `PROC_GET_AUTH_CREDENCIAL`.
  - Renovación en `/token/renovar`: emite un JWT nuevo con las mismas claims.
  - `/mcp` exige `Authorization: Bearer`; sin token responde 401 con `WWW-Authenticate` que apunta a la metadata.
- **Configuración por variables de entorno**, con los mismos nombres que la v1: tipo de inicio de sesión (`MCP_AUTH_TIPO`), título de la página de login, títulos y visibilidad de los dos campos del formulario, secreto y vigencia del JWT, y conexión a la base de OAuth.
- **Tokens federados con la v1**: mismo formato de JWT y mismo secreto (`MCP_JWT_SIGNING_KEY`), así que un token emitido por un MCP sirve en el otro.
- En modo HTTP, la identidad de cada invocación sale del token y no de `MCP_COD_USUARIO`.

## Capabilities

### New Capabilities
- `transporte-servidor`: elegir entre stdio y HTTP por configuración y qué se valida al arrancar en cada modo.
- `autenticacion-oauth`: el inicio de sesión OAuth 2.1 en modo HTTP. Cubre descubrimiento, registro, página de login configurable, emisión, renovación y validación del token Bearer, y el formato del JWT compatible con la v1.

### Modified Capabilities
- `contrato-tools`: el requisito "Identidad desde la configuración del proceso" pasa a depender del modo. En stdio sigue saliendo de `MCP_COD_USUARIO`; en HTTP, de las claims del token. Nunca de un parámetro de tool.

## Impact

- **Código**: `src/index.ts` (selección de transporte), `src/config.ts` (variables nuevas), `src/auth/` (OAuth, JWT, página de login, validación Bearer), un acceso Firebird para credenciales y revocación. Las tools no cambian: siguen recibiendo una `Sesion`.
- **Dependencias nuevas**: un servidor HTTP (`express`) y una librería de JWT (`jose`).
- **Base de datos**: sin DDL nuevo. Se reutilizan `PROC_GET_AUTH_CREDENCIAL`, `MCP_OAUTH_CREDENCIALES` y `MCP_OAUTH_TOKENS_REVOCADOS` de la v1, verificados en `SANTAROSA64_IA`, la base de desarrollo y pruebas. `CREAR_JK3` es producción y no se usa.
- **Pruebas de punta a punta**: con tools reales se hacen en el change `agregar-mcp-prospeccion` (MCP de prospección migrado a este proyecto), porque `SANTAROSA64_IA` no tiene los SP de tickets.
- **Contexto del proyecto**: revierte en parte la decisión del 2026-10-17 ("stdio reemplazó a Streamable HTTP + OAuth"). Stdio queda como default y HTTP + OAuth vuelve como modo opcional. Hay que actualizar `openspec/config.yaml`, `README.md` y `docs/instalacion.md`.
- **Seguridad**: el servidor pasa a manejar credenciales y secretos. Nunca se loguean la clave del formulario ni los tokens.
