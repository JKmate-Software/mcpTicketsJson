# Spec Delta

## Purpose

Permite que un mismo proyecto aloje varios servidores MCP (catálogos) y que cada instalación elija cuál publica, con su propio nombre, tools, instrucciones e identidad requerida.

## ADDED Requirements

### Requirement: Selección del catálogo por configuración
El servidor MUST publicar un único catálogo por proceso, elegido por `MCP_CATALOGO` con valores `tickets` o `prospeccion`. Sin la variable MUST usar `tickets`. Un valor desconocido MUST impedir el arranque con un error que liste los catálogos disponibles.

#### Scenario: Default tickets
- **GIVEN** una configuración sin `MCP_CATALOGO`
- **WHEN** un cliente consulta `tools/list`
- **THEN** recibe exactamente las tools de tickets que se publicaban antes de este cambio

#### Scenario: Catálogo de prospección
- **GIVEN** `MCP_CATALOGO=prospeccion`
- **WHEN** un cliente consulta `tools/list`
- **THEN** recibe solo las tools de prospección y ninguna de tickets

#### Scenario: Catálogo desconocido
- **WHEN** se lanza el servidor con `MCP_CATALOGO=ventas`
- **THEN** el proceso termina con un error que nombra `tickets` y `prospeccion`

### Requirement: Identidad del servidor por catálogo
El `serverInfo.name` del handshake MUST identificar al catálogo: `mcp-tickets-json` para tickets y `mcp-prospeccion-json` para prospección.

#### Scenario: Nombre en el handshake
- **GIVEN** `MCP_CATALOGO=prospeccion`
- **WHEN** un cliente hace `initialize`
- **THEN** `serverInfo.name` es `mcp-prospeccion-json`

### Requirement: Claim de identidad requerida por catálogo
Cada catálogo MUST declarar la claim que exige en modo HTTP: `COD_USUARIO` para tickets y `COD_VENDEDOR` para prospección. El rechazo por claim vacía sigue el requisito "Token sin la identidad que exige el servidor" de `autenticacion-oauth`.

#### Scenario: Token sin vendedor en prospección
- **GIVEN** `MCP_CATALOGO=prospeccion` y un token `alias/clave` con `COD_VENDEDOR` vacío
- **WHEN** se usa en `/mcp`
- **THEN** recibe 403 con un mensaje que nombra `COD_VENDEDOR`

#### Scenario: Login de vendedor por teléfono
- **GIVEN** `MCP_CATALOGO=prospeccion`, `MCP_AUTH_TIPO=tlfvendedor` y `MCP_AUTH_APISECRET_REQUERIDO=false`
- **WHEN** un vendedor inicia sesión con su teléfono y llama a `resumen_prospeccion`
- **THEN** recibe el resumen de su propia cartera

### Requirement: Vendedor en la sesión
La sesión MUST incluir el vendedor. En HTTP sale de la claim `COD_VENDEDOR` del token (vacía → sin vendedor). En stdio, con el catálogo `prospeccion`, MUST salir de `MCP_COD_VENDEDOR`, que es obligatoria; `MCP_COD_USUARIO` pasa a ser opcional. Sin `MCP_COD_VENDEDOR`, el proceso MUST terminar con un error que la nombre.

#### Scenario: Prospección por stdio sin vendedor
- **GIVEN** `MCP_CATALOGO=prospeccion` y transporte stdio
- **WHEN** se lanza el servidor sin `MCP_COD_VENDEDOR`
- **THEN** el proceso termina con un error en stderr que nombra `MCP_COD_VENDEDOR`, sin escribir en stdout
