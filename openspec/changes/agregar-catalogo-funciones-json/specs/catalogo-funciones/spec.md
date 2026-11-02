# Spec Delta

## Purpose

Define el archivo de funciones que describe un catálogo (un servidor MCP publicable), equivalente a los `*-functions.json` de la v1: la info del servidor y sus tools, cómo se elige, cómo se valida y cómo se recarga. Así las descripciones se ajustan sin recompilar y un MCP nuevo se monta editando un JSON.

## ADDED Requirements

### Requirement: Archivo de funciones por catálogo
Cada catálogo MUST definirse en un archivo `funciones/<catalogo>-functions.json` con una sección `servidor` y una lista `tools`. Cada tool MUST declarar `tipo` (`procedure`, `webservice` o `compleja`), `nombre` y `descripcion`, y MAY declarar `titulo`. Una tool `procedure` o `webservice` MAY declarar `grupo` para publicarse como variante de una tool `compleja` genérica, como `listar_catalogo`, en lugar de publicarse suelta. Sin `titulo`, MUST publicarse uno generado desde el nombre.

#### Scenario: Servidor y tools desde el archivo
- **GIVEN** un archivo con `servidor.nombre` igual a `mcp-barrios` y una tool `procedure` llamada `listar_barrios`
- **WHEN** un cliente hace `initialize` y después `tools/list`
- **THEN** `serverInfo.name` es `mcp-barrios`
- **AND** `tools/list` contiene `listar_barrios` con la descripción del archivo

### Requirement: Textos fuera del código fuente
Todo texto que el servidor publica MUST salir del archivo de funciones o de su archivo de instrucciones, nunca del código fuente, cualquiera sea el tipo de tool. Esto incluye el nombre del servidor, las instrucciones, y el título y la descripción de cada tool y de cada parámetro. Cambiar uno de esos textos MUST NOT requerir recompilar.

#### Scenario: Ajuste de una descripción sin recompilar
- **GIVEN** el servidor corriendo con el catálogo `prospeccion`
- **WHEN** se edita en `funciones/prospeccion-functions.json` la descripción del parámetro `cliente` de `buscar_prospectos_vendedor`
- **THEN** el siguiente `tools/list` muestra la descripción nueva, sin haber corrido `npm run build`

#### Scenario: Sin descripciones en el código
- **WHEN** se busca en `src/` el texto de la descripción de cualquier tool o parámetro publicado
- **THEN** no aparece

### Requirement: Info del servidor desde el archivo
`servidor` MUST declarar `nombre` y `claimRequerida`, y MAY declarar `version`, `instrucciones` (ruta de un `.md` relativa al archivo, que entrega la tool `obtener_instrucciones`) e `instruccionesEnHandshake`. El `serverInfo.name` del handshake MUST ser `servidor.nombre`. Con `instruccionesEnHandshake: true`, el contenido de las instrucciones MUST enviarse además como `instructions` del handshake.

#### Scenario: Instrucciones en el handshake
- **GIVEN** `servidor.instrucciones` igual a `prospeccion-instructions.md` e `instruccionesEnHandshake: true`
- **WHEN** un cliente hace `initialize`
- **THEN** `instructions` tiene el contenido de ese archivo

#### Scenario: Título generado
- **GIVEN** una tool `cotizar_planes_prevision` sin `titulo`
- **WHEN** un cliente consulta `tools/list`
- **THEN** su `title` es `Cotizar planes prevision`

### Requirement: Validación del archivo
El archivo MUST validarse completo antes de publicarse: estructura según `funciones/functions.schema.json`, nombres de tool únicos y en snake_case, campos propios de cada tipo, parámetros referidos por `campo*` o `busqueda` existentes y handlers de `compleja` registrados. Un error MUST describir la tool y el campo con problemas. Al arrancar, un archivo inválido MUST impedir el arranque, con el error en stderr y sin escribir en stdout.

#### Scenario: Tool duplicada
- **GIVEN** un archivo con dos tools llamadas `listar_barrios`
- **WHEN** se lanza el servidor
- **THEN** el proceso termina con un error que nombra `listar_barrios`

#### Scenario: Handler inexistente
- **GIVEN** una tool `compleja` con `handler` igual a `prospeccion.no_existe`
- **WHEN** se lanza el servidor
- **THEN** el proceso termina con un error que nombra el handler y lista los disponibles

### Requirement: Recarga en caliente
Mientras el servidor corre, un cambio en el archivo de funciones o en su archivo de instrucciones MUST recargarse sin reiniciar el proceso. Los `tools/list` y `tools/call` posteriores MUST usar la versión nueva. Si la versión nueva es inválida, el servidor MUST seguir con la anterior y loguear el error. Una invocación ya en curso MUST terminar con la definición con la que empezó.

#### Scenario: Tool agregada sin reiniciar
- **GIVEN** el servidor corriendo en modo http
- **WHEN** se agrega una tool al archivo y se guarda
- **THEN** el siguiente `tools/list` la incluye

#### Scenario: Edición inválida
- **GIVEN** el servidor corriendo con un archivo válido
- **WHEN** se guarda el archivo con un JSON mal formado
- **THEN** `tools/list` sigue devolviendo las tools anteriores
- **AND** se registra un evento de log de nivel `error` con el motivo

### Requirement: Selección del catálogo por archivo
`MCP_CATALOGO` MUST nombrar un archivo de la carpeta `funciones/` (`MCP_CATALOGO=barrios` usa `funciones/barrios-functions.json`). Sin la variable MUST usar `tickets`. `MCP_FUNCIONES_ARCHIVO`, si está definida, MUST tener prioridad e indicar la ruta del archivo. Un catálogo inexistente MUST impedir el arranque con un error que liste los archivos disponibles.

#### Scenario: Catálogo nuevo sin código
- **GIVEN** un archivo `funciones/barrios-functions.json` con tools `procedure` solamente
- **WHEN** se lanza el servidor con `MCP_CATALOGO=barrios`
- **THEN** publica las tools de ese archivo sin haber modificado código TypeScript

#### Scenario: Catálogo inexistente
- **WHEN** se lanza el servidor con `MCP_CATALOGO=ventas` y no existe `funciones/ventas-functions.json`
- **THEN** el proceso termina con un error que nombra los catálogos disponibles, entre ellos `tickets` y `prospeccion`

### Requirement: Claim requerida declarada por el catálogo
`servidor.claimRequerida` MUST ser una de las 7 claves de identidad. En HTTP, un token con esa claim vacía MUST rechazarse con 403, según el requisito "Token sin la identidad que exige el servidor" de `autenticacion-oauth`.

#### Scenario: Catálogo que exige cliente
- **GIVEN** un catálogo con `claimRequerida: "COD_CLIENTE"` y un token con `COD_CLIENTE` vacío
- **WHEN** se usa en `/mcp`
- **THEN** recibe 403 con un mensaje que nombra `COD_CLIENTE`

### Requirement: Identidad en stdio por variables
En stdio, cada clave de identidad MUST tomarse de su variable (`MCP_COD_USUARIO`, `MCP_COD_VENDEDOR`, `MCP_COD_DESARROLLADOR`, `MCP_COD_PROVEEDOR`, `MCP_COD_CLIENTE`, `MCP_COD_EMPRESA`, `MCP_SECUENCIAL_EMPRESA`). Todas son opcionales salvo la de `claimRequerida`: sin ella, el proceso MUST terminar con un error que la nombre.

#### Scenario: Catálogo de clientes por stdio
- **GIVEN** un catálogo con `claimRequerida: "COD_CLIENTE"` y transporte stdio
- **WHEN** se lanza el servidor sin `MCP_COD_CLIENTE`
- **THEN** el proceso termina con un error en stderr que nombra `MCP_COD_CLIENTE`

### Requirement: Sesión completada desde la base
Un catálogo MAY declarar en `servidor.completarSesion` un handler registrado en código que complete la sesión stdio desde la base. El catálogo `tickets` MUST usarlo para resolver el desarrollador desde `USUARIOS`, como hoy.

#### Scenario: Tickets sin cambios
- **GIVEN** `MCP_CATALOGO=tickets` por stdio con `MCP_COD_USUARIO=15169`
- **WHEN** se invoca `listar_tareas` con `desarrollador: "yo"`
- **THEN** se resuelve el desarrollador del usuario 15169 como antes de este cambio
