# Spec Delta

## Purpose

Tools que usan la definición de un método de webservice guardada en la base (`METODOS_WEBSERVICES` y sus parámetros en `PARAMS_METODOS_WEBSERVICES`) para componer y ejecutar la llamada directo en Firebird. No se invoca ningún webservice por HTTP. Es el mismo comportamiento que tienen hoy las tools de `functions.json` en la v1.

## ADDED Requirements

### Requirement: Definición del método desde la base
Una tool `webservice` MUST declarar `metodo` con el nombre de un método registrado. El servidor MUST leer su definición (TIPO, SSQL y categoría) con `PROC_GET_METODO_WEBSERV_X_NOMB`, y sus parámetros (nombre, tipo y longitud) con `PROC_GET_PARAMS_METODOS_WEBSERV`, los mismos procedures que usan JKMate3 y la v1. MUST NOT invocar el webservice por HTTP. Un método inexistente MUST responder `ERROR_INTERNO` con un mensaje que lo nombre.

#### Scenario: Método existente
- **GIVEN** una tool `historial_mensajes_prospecto` con `metodo: "ws_crm_mostrar_msj_x_cliente"`
- **WHEN** se invoca con el cliente y el prospecto de un prospecto existente
- **THEN** la respuesta trae en `resultado` las filas de `PROC_GET_MENSAJES_X_CLIENTEP` en camelCase

#### Scenario: Método inexistente
- **GIVEN** una tool con `metodo: "noExiste"`
- **WHEN** se invoca
- **THEN** la respuesta es un error `ERROR_INTERNO` cuyo mensaje nombra `noExiste`

### Requirement: Parámetros verificados contra la definición
Cada parámetro declarado en la tool (por `nombre`) MUST existir entre los parámetros del método, sin distinguir mayúsculas. Si no existe, la tool MUST responder `ERROR_INTERNO`, nombrando el parámetro y los parámetros que el método acepta, y MUST NOT ejecutar el SSQL. Un parámetro del método que la tool no declara MUST enviarse como NULL. `npm run validar-funciones` MUST detectar los dos casos sin ejecutar nada.

#### Scenario: Parámetro que el método no tiene
- **GIVEN** una tool sobre `ws_crm_mostrar_resultado`, que solo tiene `COD_CATEGORIA_MENSAJE`, y que declara además `COD_RESULTADO`
- **WHEN** se invoca
- **THEN** la respuesta es un error `ERROR_INTERNO` que nombra `COD_RESULTADO` y `COD_CATEGORIA_MENSAJE`

#### Scenario: Reporte previo
- **GIVEN** la misma tool
- **WHEN** se ejecuta `npm run validar-funciones`
- **THEN** el reporte nombra la tool, `COD_RESULTADO` y el método

### Requirement: Composición de la llamada desde el SSQL
El SSQL del método MUST ejecutarse como SQL, reemplazando cada `@NOMBRE` fuera de literales por un parámetro posicional con el valor resuelto para `NOMBRE`. Con `DATASET_SQL` o `DATASET_PROCEDURE` MUST devolver las filas. Con `EXECUTE_SQL` o `EXECUTE_PROCEDURE` MUST ejecutar y devolver `resultado` vacío. Un TIPO desconocido MUST responder `ERROR_INTERNO`.

#### Scenario: Parámetro repetido en el SSQL
- **GIVEN** un SSQL que usa `@FILTRO` dos veces
- **WHEN** se invoca con `FILTRO: 5`
- **THEN** los dos parámetros posicionales reciben 5

#### Scenario: Método de ejecución
- **GIVEN** un método `EXECUTE_PROCEDURE` y una tool con `escritura: true`
- **WHEN** se invoca
- **THEN** se ejecuta en una transacción de escritura que se confirma
- **AND** la respuesta es `{ resultado: [] }`

### Requirement: Conversión de valores como JKMate3
Cada valor MUST convertirse según el tipo del parámetro en la definición del método (`VarChar`, `Integer`, `Decimal`, `Date`, `Timestamp`, `Boolean`, entre otros), con el mismo mapeo que `DirectDbHelper` de la v1. Los booleanos MUST enviarse como `1` o `0`. En un parámetro de fecha o fecha-hora con `T`, los espacios MUST reemplazarse por `+`, como hace `wsmetodo`.

#### Scenario: Booleano
- **GIVEN** un parámetro `Boolean` del método
- **WHEN** se invoca la tool con `true`
- **THEN** el SSQL recibe 1

### Requirement: Categorías exentas de sanitización
Los textos que reciben los métodos de categoría 100 o 200 MUST llegar sin sanitizar, igual que en JKMate3. En el resto de los métodos aplica la sanitización de textos del contrato de tools.

#### Scenario: Categoría exenta
- **GIVEN** un método de categoría 100
- **WHEN** se invoca con un texto que contiene `<b>`
- **THEN** el SSQL recibe el texto sin cambios
