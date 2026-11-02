# Spec Delta

## Purpose

Reglas comunes a las tools `procedure` y `webservice`, también cuando son variantes de `listar_catalogo`: cómo se declaran y resuelven los parámetros, cómo entra la identidad de la sesión, cómo se arma la respuesta y cómo se manejan las escrituras y los rechazos. Son las mismas opciones que ofrece `functions.json` en la v1.

## ADDED Requirements

### Requirement: Declaración de parámetros
Cada parámetro MUST declarar `nombre` (el nombre real en el procedure o el método) y `tipo` (`entero`, `decimal`, `texto`, `booleano`, `fecha`, `fechaHora`, `json`, o los de la v1). Un parámetro `json` recibe un objeto o un array y llega a la base serializado como texto. MAY declarar `alias`, `descripcion`, `requerido` (por defecto `false`), `default` y `valorFijo`. El `inputSchema` MUST exponer el parámetro con su `alias` si lo tiene, y MUST NOT exponer los que tienen `valorFijo`.

#### Scenario: Alias
- **GIVEN** un parámetro `{ "nombre": "PORDEN", "alias": "orden", "tipo": "entero" }`
- **WHEN** se invoca la tool con `orden: 2`
- **THEN** el procedure recibe `PORDEN = 2`
- **AND** el `inputSchema` declara `orden` y no `PORDEN`

#### Scenario: Valor fijo oculto
- **GIVEN** un parámetro `{ "nombre": "COD_ORIGEN_MENSAJE", "tipo": "entero", "valorFijo": 7 }`
- **WHEN** un cliente consulta `tools/list` y después invoca la tool
- **THEN** el `inputSchema` no declara `COD_ORIGEN_MENSAJE`
- **AND** el procedure recibe 7

### Requirement: Validación de la entrada
La entrada MUST validarse contra el `inputSchema` publicado, que incluye `descripcion` y `default` y no admite propiedades extra. Un fallo MUST responder `PARAMETRO_INVALIDO`.

#### Scenario: Tipo inválido
- **GIVEN** un parámetro `entero`
- **WHEN** se invoca la tool con el texto `"abc"`
- **THEN** la respuesta es un error `PARAMETRO_INVALIDO` que nombra el parámetro

### Requirement: Campos de sesión forzados
Una tool MAY declarar `campoUsuario`, `campoVendedor`, `campoDesarrollador`, `campoProveedor`, `campoCliente`, `campoEmpresa` o `campoSecuencialEmpresa`, cada uno con el `nombre` de un parámetro. `campoUsuario` y todo campo cuyo parámetro sea `requerido: true` están en modo forzado: MUST NOT aparecer en el `inputSchema` y MUST tomar siempre el valor de la sesión.

#### Scenario: Vendedor forzado
- **GIVEN** una tool con `campoVendedor: "COD_VENDEDOR_IN"`, ese parámetro con `requerido: true` y una sesión del vendedor 12
- **WHEN** se invoca la tool
- **THEN** el procedure recibe `COD_VENDEDOR_IN = 12`
- **AND** el `inputSchema` no declara `COD_VENDEDOR_IN`

### Requirement: Campos de sesión autocompletados
Un campo de sesión cuyo parámetro no es requerido MUST aparecer en el `inputSchema`. Se usa el valor del cliente si lo mandó y, si no, el de la sesión.

#### Scenario: Desarrollador autocompletado
- **GIVEN** una tool con `campoDesarrollador` sobre un parámetro no requerido y una sesión del desarrollador 100936
- **WHEN** se invoca una vez sin ese parámetro y otra con el valor 200
- **THEN** el procedure recibe primero 100936 y después 200

### Requirement: Sesión sin el dato requerido
Si un campo de sesión necesita el valor de la sesión y la sesión no lo tiene, la tool MUST responder `NO_AUTORIZADO` con un mensaje que nombra la clave que falta, en lugar de enviar NULL.

#### Scenario: Sesión sin el dato
- **GIVEN** una tool con `campoVendedor` forzado y una sesión sin vendedor
- **WHEN** se invoca
- **THEN** la respuesta es un error `NO_AUTORIZADO` que nombra `COD_VENDEDOR`

### Requirement: Contexto de sesión en la base
Antes de ejecutar una tool `procedure` o `webservice`, el servidor MUST escribir en `USER_SESSION` todas las claves de identidad (las 7 más `COD_CREDENCIAL_MCP`), en la misma conexión en que corre la tool. Cada clave lleva el valor de la sesión, o NULL si en la sesión está vacía, así `RDB$GET_CONTEXT` devuelve NULL. Como cada invocación reescribe todas las claves, una conexión reutilizada del pool MUST NOT conservar la identidad de otra sesión.

#### Scenario: Procedure que lee el contexto
- **GIVEN** un procedure que devuelve `RDB$GET_CONTEXT('USER_SESSION', 'COD_VENDEDOR')` y una sesión del vendedor 12
- **WHEN** se invoca la tool
- **THEN** el resultado contiene 12

#### Scenario: Sin fuga entre usuarios
- **GIVEN** un pool de una sola conexión, una invocación del vendedor 12 y después una de una sesión sin vendedor
- **WHEN** la segunda invocación lee `RDB$GET_CONTEXT('USER_SESSION', 'COD_VENDEDOR')`
- **THEN** obtiene NULL

### Requirement: Conexión exclusiva opcional
Una tool con `conexionExclusiva: true` MUST ejecutarse en una conexión propia, fuera del pool, que se cierra al terminar. Es para procedures que escriben en `USER_SESSION` claves distintas de las de identidad. `npm run validar-funciones` MUST advertir si una tool sin esa opción usa un procedure cuyo código contiene `RDB$SET_CONTEXT('USER_SESSION'`.

#### Scenario: Advertencia por contexto propio
- **GIVEN** una tool `procedure` sin `conexionExclusiva` sobre un procedure que escribe `RDB$SET_CONTEXT('USER_SESSION', 'FILTRO', ...)`
- **WHEN** se ejecuta `npm run validar-funciones`
- **THEN** el reporte advierte sobre esa tool y sugiere `conexionExclusiva: true`

### Requirement: Forma de la respuesta
La respuesta exitosa MUST ser `{ resultado: [filas] }`, con cada columna en camelCase (`COD_BARRIO` → `codBarrio`) y sin espacios de relleno al final de los textos `CHAR`. El resumen de texto MUST indicar la cantidad de filas.

#### Scenario: Columnas en camelCase
- **GIVEN** una tool sobre `PROC_GET_BARRIOS` sin `salida`
- **WHEN** se invoca
- **THEN** cada fila tiene `codBarrio`, `codLocalidad`, `nombre`, `codigoPostal` y `codZonaGeografica`

### Requirement: Proyección con salida
`salida` MAY listar columnas, como texto (`"NOMBRE"`) u objeto con `columna`, `nombre` y `tipo`. Con `salida`, MUST devolverse solo esas columnas, en ese orden, con su nombre y tipo, y `booleano` convierte 0/1 en `true`/`false`. Una columna que la consulta no devuelve MUST responder `ERROR_INTERNO`, con las columnas disponibles en el log.

#### Scenario: Proyección y renombre
- **GIVEN** una tool con `salida: [{ "columna": "COD_BARRIO", "nombre": "id" }, "NOMBRE"]`
- **WHEN** se invoca
- **THEN** cada fila tiene exactamente las propiedades `id` y `nombre`

### Requirement: Tope de filas
Con `maxFilas`, la respuesta MUST traer como máximo esa cantidad de filas y agregar `hayMas`.

#### Scenario: Tope de filas
- **GIVEN** una tool con `maxFilas: 50` cuyo procedure devuelve 120 filas
- **WHEN** se invoca
- **THEN** `resultado` tiene 50 filas y `hayMas` es `true`

### Requirement: Búsqueda aproximada
Una tool MAY declarar `busqueda` con las mismas opciones que la v1 (`campos`, `columnas`, `maxResultados`, `umbral`, `maxSinBusqueda`, `cacheMinutos`, `cacheAlcance`). Expone entonces el parámetro virtual `buscar`, que no llega a la base, y MUST responder con `similitud` en cada fila y un objeto `busqueda`, rankeando con `src/busqueda/`. Un parámetro real llamado `buscar` MUST invalidar el archivo.

#### Scenario: Barrios con búsqueda
- **GIVEN** una tool sobre `PROC_GET_BARRIOS` con `busqueda: { "campos": ["NOMBRE"], "cacheMinutos": 60, "cacheAlcance": "global" }`
- **WHEN** se invoca con `buscar: "alberdi"`
- **THEN** las filas vienen ordenadas por `similitud` descendente
- **AND** una segunda búsqueda dentro de los 60 minutos no consulta la base

### Requirement: Escritura
Una tool con `escritura: true` MUST ejecutarse en una transacción de escritura que se confirma al terminar bien, y MUST publicar `readOnlyHint: false` y `destructiveHint` según `destructiva` (por defecto `false`). Sin `escritura`, MUST correr en una transacción de solo lectura y publicar `readOnlyHint: true`.

#### Scenario: Annotations de una escritura
- **GIVEN** una tool con `escritura: true`
- **WHEN** un cliente consulta `tools/list`
- **THEN** sus annotations tienen `readOnlyHint: false` y `destructiveHint: false`

### Requirement: Rechazo de la operación
`rechazo` MAY declarar `columna`, `valoresExito` y `columnaMensaje`. Si la primera fila trae en `columna` un valor fuera de `valoresExito`, la tool MUST responder `OPERACION_RECHAZADA` con el texto de `columnaMensaje` y deshacer la transacción. Una excepción de usuario de Firebird MUST responder `OPERACION_RECHAZADA` con su mensaje, y los demás errores de la base, `ERROR_INTERNO`.

#### Scenario: Rechazo por SALIDA
- **GIVEN** una tool `escritura: true` con `rechazo: { "columna": "SALIDA", "valoresExito": [0], "columnaMensaje": "MENSAJE" }`
- **WHEN** el procedure devuelve `SALIDA = -1` y `MENSAJE = "Falta el teléfono"`
- **THEN** la respuesta es un error `OPERACION_RECHAZADA` con el mensaje `Falta el teléfono`
- **AND** no queda ningún cambio en la base

#### Scenario: Excepción del procedure
- **WHEN** el procedure lanza una excepción de usuario con el texto "Prospecto inexistente"
- **THEN** la respuesta es un error `OPERACION_RECHAZADA` cuyo mensaje contiene "Prospecto inexistente"
