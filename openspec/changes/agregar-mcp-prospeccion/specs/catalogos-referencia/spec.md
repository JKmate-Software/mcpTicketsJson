# Spec Delta

## Purpose

Una sola tool, `listar_catalogo`, resuelve todos los códigos de referencia de prospección (grupos, canales, acciones, resultados, campañas, localidades, barrios). Los catálogos grandes admiten una búsqueda aproximada tolerante a errores de tipeo.

## ADDED Requirements

### Requirement: Selección de catálogo
`listar_catalogo` MUST exigir `catalogo`, con uno de los valores `grupos`, `canales`, `categorias`, `resultados`, `acciones`, `campanias`, `localidades` o `barrios`. Un valor faltante o desconocido MUST dar `PARAMETRO_INVALIDO` con la lista de valores válidos. La descripción de la tool MUST incluir una línea por catálogo con qué código va a qué parámetro de qué tool, si requiere `codPadre` y si admite `buscar`.

#### Scenario: Catálogo inválido
- **WHEN** se llama con `catalogo: "provincias"`
- **THEN** la respuesta es un error `PARAMETRO_INVALIDO` que lista los 8 catálogos

#### Scenario: Descripción con uso por catálogo
- **WHEN** un cliente consulta `tools/list`
- **THEN** la descripción de `listar_catalogo` menciona que `codGrupoProspecto` de `grupos` va a `registrar_*`

### Requirement: Respuesta uniforme de catálogo
Toda respuesta de `listar_catalogo` MUST tener `catalogo`, `elementos` (lista de `{ codigo, nombre, ... }` con los campos extra propios de cada catálogo en camelCase), `avisos` (lista de textos) y, si se usó o aplica búsqueda, `busqueda`. Los campos de presentación (por ejemplo `COLOR`) MUST NOT incluirse.

#### Scenario: Resultados con exige agendamiento
- **WHEN** se llama con `catalogo: "resultados"` y un `codPadre` válido
- **THEN** cada elemento tiene `codigo`, `nombre` y `exigeAgendamiento` booleano

#### Scenario: Grupos del vendedor de la sesión
- **WHEN** se llama con `catalogo: "grupos"`
- **THEN** los elementos son solo los grupos del vendedor de la sesión

### Requirement: Código padre
`resultados` MUST exigir `codPadre` (la categoría elegida); si falta, MUST dar `PARAMETRO_INVALIDO` indicando que hay que mandar un código de `categorias`. En `categorias`, `codPadre` (un resultado previo) MUST ser opcional y acotar las acciones siguientes. En los demás catálogos, un `codPadre` enviado MUST ignorarse y dejar un aviso en `avisos`.

#### Scenario: Resultados sin padre
- **WHEN** se llama con `catalogo: "resultados"` sin `codPadre`
- **THEN** la respuesta es un error `PARAMETRO_INVALIDO` que menciona `categorias`

#### Scenario: Padre que no aplica
- **WHEN** se llama con `catalogo: "barrios"` y `codPadre: 5`
- **THEN** la respuesta es exitosa y `avisos` indica que `codPadre` no aplica a `barrios`

### Requirement: Búsqueda aproximada
`canales`, `campanias`, `localidades` y `barrios` MUST aceptar `buscar` (texto libre). Con `buscar`, cada elemento recibe `similitud` de 0 a 100 y solo se devuelven los que superan 60, ordenados de mayor a menor, hasta 10. La comparación MUST tolerar mayúsculas, tildes, errores de tipeo, palabras en otro orden y las confusiones b/v, s/z/c, ll/y y h muda. 100 queda reservado a la igualdad exacta normalizada. En los demás catálogos, `buscar` MUST ignorarse con un aviso.

#### Scenario: Error de tipeo
- **GIVEN** existe la localidad "Villa Allende"
- **WHEN** se llama con `catalogo: "localidades"` y `buscar: "bila aiende"`
- **THEN** "Villa Allende" está entre los elementos con `similitud` mayor a 60

#### Scenario: Igualdad exacta
- **WHEN** se busca un barrio por su nombre exacto con otras mayúsculas y sin tildes
- **THEN** ese barrio aparece primero con `similitud` 100

### Requirement: Catálogo grande sin búsqueda
En los catálogos con búsqueda, si no viene `buscar` y el catálogo tiene más de 50 elementos, la respuesta MUST traer `elementos` vacío. Además, `busqueda.mensaje` MUST pedir que se use `buscar`. `busqueda` MUST informar `texto`, `totalCatalogo` y `devueltos`.

#### Scenario: Barrios sin buscar
- **GIVEN** más de 50 barrios en la base
- **WHEN** se llama con `catalogo: "barrios"` sin `buscar`
- **THEN** `elementos` está vacío y `busqueda.mensaje` pide usar `buscar`

### Requirement: Caché de catálogos de búsqueda
Los catálogos con búsqueda MUST cachear en memoria el resultado completo del procedure por 60 minutos. `campanias`, `localidades` y `barrios` comparten la caché entre todos los usuarios; `canales`, por vendedor. Un error de la base MUST NOT quedar cacheado.

#### Scenario: Segunda búsqueda sin ir a la base
- **GIVEN** una búsqueda de barrios hecha hace menos de 60 minutos
- **WHEN** otro usuario busca otro barrio
- **THEN** la respuesta sale sin llamar a la base (el evento de log informa `llamadasBase: 0`)
