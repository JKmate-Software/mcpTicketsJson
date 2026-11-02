# Spec Delta

## Purpose

Las tools que ya están desarrolladas en este proyecto (tickets y prospección) tienen la lógica en código: parseo de la entrada, varias consultas y armado de la respuesta. Ese código se queda, pero sus textos (descripción del MCP, de cada tool y de cada parámetro) pasan al archivo de funciones, como en el `functions.json` de la v1. Así se ajustan sin recompilar.

## ADDED Requirements

### Requirement: Lógica en código, referenciada desde el archivo
Una tool `compleja` MUST declarar `handler` con el identificador de la lógica registrada en código (`<catalogo>.<nombre>`, o solo el nombre para las comunes). El código MUST aportar la validación de la entrada (tipos, enums, rangos, defaults), el `outputSchema`, las annotations y la ejecución. Los textos los aporta el archivo.

#### Scenario: Tool de prospección como compleja
- **GIVEN** `funciones/prospeccion-functions.json` con una tool `registrar_prospecto` de tipo `compleja` y `handler: "prospeccion.registrar_prospecto"`
- **WHEN** se invoca con los mismos argumentos que antes de este cambio
- **THEN** la respuesta es la misma que antes de este cambio

#### Scenario: Una misma lógica con dos nombres
- **GIVEN** dos tools `compleja` de catálogos distintos con el mismo handler
- **WHEN** cada catálogo se publica
- **THEN** cada una usa el nombre, el título y la descripción de su propio archivo

### Requirement: Descripciones de parámetros desde el archivo
Las descripciones de las propiedades del `inputSchema` de una tool `compleja`, incluidas las anidadas (`filtros.estado`), MUST salir de su entrada `parametros` en el archivo. El `inputSchema` del handler MUST NOT traer descripciones propias: si las trae, la carga MUST fallar. Una propiedad que el archivo no describe se publica sin descripción. Describir una propiedad que el handler no tiene MUST invalidar el archivo, con un error que nombre la tool y la propiedad.

#### Scenario: Descripción de parámetro editada
- **GIVEN** la tool `listar_tickets` con `parametros: [{ "nombre": "texto", "descripcion": "Busca en título y mensajes" }]`
- **WHEN** un cliente consulta `tools/list`
- **THEN** `inputSchema.properties.texto.description` es `Busca en título y mensajes`

#### Scenario: Parámetro desconocido
- **GIVEN** una tool `compleja` cuyo archivo describe un parámetro `noExiste`
- **WHEN** se carga el archivo
- **THEN** la carga falla con un error que nombra la tool y `noExiste`

#### Scenario: Descripción escrita en el código
- **GIVEN** un handler cuyo `inputSchema` trae `description` en la propiedad `limite`
- **WHEN** se carga un archivo que lo usa
- **THEN** la carga falla con un error que nombra el handler y `limite`

### Requirement: Migración sin cambios visibles
Las tools actuales de `tickets` y `prospeccion` MUST pasar a tools `compleja` definidas en `funciones/tickets-functions.json` y `funciones/prospeccion-functions.json`, con sus textos movidos al archivo. `listar_catalogo` de prospección pasa al handler genérico (ver `listar-catalogo`). El `tools/list` de cada catálogo MUST quedar igual al anterior: nombres, títulos, descripciones, esquemas, annotations y orden.

#### Scenario: tools/list idéntico
- **GIVEN** la captura de `tools/list` de `tickets` y de `prospeccion` tomada antes del cambio
- **WHEN** se compara con el `tools/list` después del cambio
- **THEN** son iguales

### Requirement: Handlers comunes
`user_info`, `obtener_instrucciones` y `listar_catalogo` MUST estar disponibles como handlers comunes, utilizables desde cualquier catálogo. `user_info` MUST devolver las claves de identidad no vacías de la sesión. `obtener_instrucciones` MUST devolver el contenido de `servidor.instrucciones`, y su uso en un catálogo sin instrucciones MUST invalidar el archivo.

#### Scenario: Catálogo nuevo con user_info
- **GIVEN** un catálogo con solo tools `procedure` más una tool `compleja` con `handler: "user_info"`
- **WHEN** un vendedor la invoca por HTTP
- **THEN** recibe su `codVendedor`
