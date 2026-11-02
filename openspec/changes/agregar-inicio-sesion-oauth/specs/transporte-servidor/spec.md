# Spec Delta

## Purpose

Define cómo se elige el transporte del servidor MCP (stdio local o HTTP con inicio de sesión) y qué configuración exige cada modo al arrancar.

## ADDED Requirements

### Requirement: Selección de transporte por configuración
El servidor MUST elegir el transporte según `MCP_TRANSPORTE`, con valores `stdio` o `http`. Sin la variable, MUST usar `stdio`. Cualquier otro valor MUST impedir el arranque con un error que lo explique.

#### Scenario: Default stdio
- **GIVEN** la configuración no define `MCP_TRANSPORTE`
- **WHEN** se lanza el servidor con `MCP_COD_USUARIO` y la base configurados
- **THEN** atiende MCP por stdin/stdout igual que antes de este cambio, sin endpoints HTTP ni login

#### Scenario: Valor inválido
- **WHEN** se lanza el servidor con `MCP_TRANSPORTE=websocket`
- **THEN** el proceso termina con un error en stderr que indica los valores admitidos

### Requirement: Modo HTTP
Con `MCP_TRANSPORTE=http` el servidor MUST atender MCP Streamable HTTP en la ruta `/mcp`, en el puerto `MCP_HTTP_PUERTO` (por defecto 3000). En este modo MUST NOT exigir `MCP_COD_USUARIO`, y si la variable está definida MUST ignorarla como identidad.

#### Scenario: Arranque en HTTP
- **GIVEN** `MCP_TRANSPORTE=http`, `MCP_HTTP_PUERTO=7020`, `MCP_JWT_SIGNING_KEY` y la base configurados, sin `MCP_COD_USUARIO`
- **WHEN** se lanza el servidor
- **THEN** queda escuchando en el puerto 7020 y `/mcp` responde a clientes autenticados

### Requirement: Validación de configuración del modo HTTP al arrancar
En modo HTTP el servidor MUST validar al arrancar la configuración de inicio de sesión. Si falta `MCP_JWT_SIGNING_KEY` o un valor es inválido, MUST terminar con un error que lo explique, sin escuchar en el puerto. Un valor inválido puede ser un booleano que no es `true`/`false` o una vigencia no positiva.

#### Scenario: Falta el secreto del JWT
- **GIVEN** `MCP_TRANSPORTE=http` sin `MCP_JWT_SIGNING_KEY`
- **WHEN** se lanza el servidor
- **THEN** el proceso termina con un error que nombra `MCP_JWT_SIGNING_KEY` y no abre el puerto

### Requirement: URL pública configurable
Las URLs que el servidor publica en la metadata OAuth y en `WWW-Authenticate` MUST armarse con `MCP_URL_PUBLICA` cuando esté definida. Si no lo está, MUST armarse con el esquema y el host del request recibido. Esto permite publicarlo detrás de un proxy inverso.

#### Scenario: Detrás de un proxy
- **GIVEN** `MCP_URL_PUBLICA=https://mcp.jkmate.com.ar/tickets-v2`
- **WHEN** un cliente consulta `/.well-known/oauth-authorization-server`
- **THEN** `token_endpoint` es `https://mcp.jkmate.com.ar/tickets-v2/token`
