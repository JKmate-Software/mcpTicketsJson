# Spec Delta

## MODIFIED Requirements

### Requirement: Identidad desde la configuración del proceso
La identidad de quien llama depende del transporte. En stdio (un proceso por usuario, sin autenticación) MUST salir de `MCP_COD_USUARIO`. En HTTP MUST salir de las claims del token de cada request: `COD_USUARIO` y `COD_DESARROLLADOR`. En ningún modo MUST aceptarse como parámetro de tool. Los filtros que nombran a otra persona (desarrollador, responsable, asignado) MUST aceptar un id explícito o `"yo"`, que se resuelve desde la sesión.

#### Scenario: Sin parámetro de identidad
- **WHEN** un cliente consulta `tools/list`
- **THEN** ningún `inputSchema` declara un parámetro que represente al usuario que llama

#### Scenario: "yo" resuelto por sesión
- **GIVEN** una sesión cuyo desarrollador asociado es 100936
- **WHEN** se invoca `listar_tareas` con `desarrollador: "yo"`
- **THEN** el resultado es el mismo que con `desarrollador: 100936`

#### Scenario: Proceso sin usuario configurado
- **GIVEN** el transporte stdio
- **WHEN** se lanza el servidor sin `MCP_COD_USUARIO`
- **THEN** el proceso termina con un error que lo explica en stderr, sin escribir nada en stdout ni atender tools

#### Scenario: Identidad por token en HTTP
- **GIVEN** el transporte HTTP y dos usuarios con tokens propios (`COD_USUARIO` 15169 y 20001)
- **WHEN** cada uno invoca `listar_tickets` con `asignadoA: "yo"`
- **THEN** cada uno recibe los tickets de su propio usuario, aunque los atienda el mismo proceso

#### Scenario: Desarrollador desde el token
- **GIVEN** el transporte HTTP y un token con `COD_DESARROLLADOR` vacío
- **WHEN** se invoca `listar_tareas` con `desarrollador: "yo"`
- **THEN** la respuesta es el mismo error que hoy da una sesión sin desarrollador asociado
