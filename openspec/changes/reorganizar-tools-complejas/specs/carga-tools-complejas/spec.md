# Spec Delta

## Purpose

Dónde vive el código de una tool compleja y cómo se carga: el archivo de funciones nombra el handler, el handler es un archivo de `src/catalogos/` con ese nombre, y se levanta solo, sin registros manuales.

## ADDED Requirements

### Requirement: Un archivo por tool compleja
El código de cada tool compleja MUST estar en un archivo propio dentro de la carpeta de su MCP, `src/catalogos/<mcp>/<handler>.ts`, donde `<mcp>` es el nombre de su archivo de funciones sin `-functions.json`, y MUST exportar `handler`. Una tool que sirve a cualquier MCP MUST estar en `src/catalogos/compartidas/<handler>.ts`. Su test, si lo tiene, va al lado (`<handler>.test.ts`). `src/catalogos/` MUST NOT tener archivos sueltos.

#### Scenario: Tool de un archivo
- **GIVEN** el archivo `src/catalogos/prospeccion/registrar-prospecto.ts` que exporta `handler`
- **WHEN** `funciones/prospeccion-functions.json` declara una tool compleja con `"handler": "registrar-prospecto"`
- **THEN** la tool se publica con la lógica de ese archivo y los textos del JSON

### Requirement: Carga automática desde el archivo de funciones
Al cargar un archivo de funciones, el servidor MUST importar, para cada tool `compleja`, el archivo cuyo nombre es su `handler`, buscándolo en `src/catalogos/<mcp>/` y después en `src/catalogos/compartidas/`, inicializarlo y publicarlo. MUST NOT haber un registro de handlers que mantener a mano, y MUST cargarse solo el código de las tools que el archivo declara.

#### Scenario: Tool nueva sin registro
- **GIVEN** un archivo nuevo `src/catalogos/prevision/cotizar-plan.ts` que exporta `handler`, ya compilado
- **WHEN** `funciones/prevision-functions.json` declara `"handler": "cotizar-plan"`
- **THEN** la tool se publica sin haber modificado ningún otro archivo de código

#### Scenario: Tool de otro MCP
- **GIVEN** `src/catalogos/tickets/listar-tickets.ts`
- **WHEN** `funciones/prospeccion-functions.json` declara `"handler": "listar-tickets"`
- **THEN** la carga falla porque no existe en `prospeccion/` ni en `compartidas/`

#### Scenario: Solo lo declarado
- **GIVEN** un catálogo cuyo archivo declara una sola tool compleja
- **WHEN** se carga
- **THEN** se importa solo el archivo de ese handler

### Requirement: Nombre de handler seguro
El `handler` MUST tener la forma `[a-z0-9]+(-[a-z0-9]+)*`. Un nombre con otra forma (con `/`, `.`, `\` o mayúsculas) MUST invalidar el archivo antes de intentar cualquier importación, y la ruta resuelta MUST quedar dentro de `src/catalogos/<mcp>/` o `src/catalogos/compartidas/` (o de su equivalente compilado).

#### Scenario: Intento de salir de la carpeta
- **GIVEN** una tool con `"handler": "../db/firebird"`
- **WHEN** se carga el archivo
- **THEN** la carga falla con un error que nombra la tool y el handler, sin importar ningún módulo

### Requirement: Handler inexistente o inválido
Si el archivo del handler no existe, o existe pero no exporta un `handler` con `crear`, la carga del archivo de funciones MUST fallar con un error que nombre la tool, el handler y la ruta buscada. En la recarga en caliente, el servidor MUST seguir con la versión anterior.

#### Scenario: Handler que no existe
- **GIVEN** una tool con `"handler": "no-existe"`
- **WHEN** se lanza el servidor
- **THEN** el proceso termina con un error que nombra `no-existe` y la ruta buscada

### Requirement: Compartido en la carpeta comunes del MCP
El código que comparten las tools complejas de un MCP (llamadas a procedures, esquemas, campos, mapeos) MUST estar en `src/catalogos/<mcp>/comunes/`; lo que compartan varios MCP, en `src/catalogos/compartidas/comunes/`. `servidor.completarSesion` MUST resolverse por archivo: `"completarSesion": "completar-sesion-tickets"` importa `src/catalogos/tickets/comunes/completar-sesion-tickets.ts`, que exporta `completarSesion`, con la misma regla de nombre seguro.

#### Scenario: completarSesion por archivo
- **GIVEN** `funciones/tickets-functions.json` con `"completarSesion": "completar-sesion-tickets"`
- **WHEN** se lanza tickets por stdio con `MCP_COD_USUARIO=15169`
- **THEN** la sesión trae el desarrollador del usuario, igual que antes de este cambio

### Requirement: Tools comunes como cualquier compleja
`user_info` y `obtener_instrucciones` MUST ser tools complejas en `src/catalogos/compartidas/user-info.ts` y `compartidas/obtener-instrucciones.ts`. El `user_info` de prospección, que devuelve solo `codUsuario`, `codVendedor` y `transporte`, MUST estar en `src/catalogos/prospeccion/user-info-vendedor.ts`.

#### Scenario: Prospección sin cambios en user_info
- **WHEN** un vendedor invoca `user_info` en prospección
- **THEN** recibe `{ codUsuario, codVendedor, transporte }`, como antes de este cambio

### Requirement: Convención verificada por tests
La suite de tests MUST fallar ante cualquier desvío de la estructura de carpetas: un handler o `completarSesion` que no resuelve, un archivo de tool sin `handler`, una tool que su MCP no usa, archivos sueltos en `src/catalogos/` o una carpeta de MCP sin archivo de funciones. `npm run validar-funciones` MUST informar los handlers que no resuelven.

#### Scenario: Archivo suelto
- **GIVEN** un archivo `src/catalogos/listar-algo.ts` fuera de toda carpeta
- **WHEN** se corre la suite de tests
- **THEN** falla un test que nombra `listar-algo.ts`

#### Scenario: Carpeta sin MCP
- **GIVEN** una carpeta `src/catalogos/prevision/` sin `funciones/prevision-functions.json`
- **WHEN** se corre la suite de tests
- **THEN** falla un test que nombra `prevision`

#### Scenario: Archivo de tool sin usar
- **GIVEN** un archivo `src/catalogos/tickets/vieja.ts` que `tickets-functions.json` no referencia
- **WHEN** se corre la suite de tests
- **THEN** falla un test que nombra `tickets/vieja`

### Requirement: Migración sin cambios visibles
La reorganización MUST NOT cambiar nada de lo que ven los clientes. El `tools/list` de tickets y prospección y las respuestas capturadas de `listar_catalogo` MUST quedar idénticos a los de `test/datos/`.

#### Scenario: Captura intacta
- **WHEN** se corre `test/captura-contrato.test.ts` después de la reorganización
- **THEN** pasa sin cambios en los archivos de captura
