# Spec Delta

## ADDED Requirements

### Requirement: Sanitización de textos recibidos
Antes de ejecutar cualquier tool, de cualquier tipo, el servidor MUST quitar de cada texto de la entrada el HTML y el JavaScript ejecutable (etiquetas `script`, atributos `on*`, URLs `javascript:`). MUST recorrer también los objetos y arrays anidados y los textos que contienen un JSON. Un texto sin marcado MUST llegar sin cambios.

#### Scenario: Script en un texto
- **WHEN** se invoca una tool con `mensaje: "Hola <script>alert(1)</script>"`
- **THEN** la base recibe `Hola ` sin la etiqueta ni su contenido

#### Scenario: JSON anidado
- **GIVEN** un parámetro `json` que recibe `{ "titular": { "nombre": "<img src=x onerror=alert(1)>Ana" } }`
- **WHEN** se invoca la tool
- **THEN** la base recibe un JSON cuyo `titular.nombre` no contiene `onerror`

#### Scenario: Texto común intacto
- **WHEN** se invoca una búsqueda con `cliente: "Pérez & Hijos"` y otra con `texto: "monto < 500"`
- **THEN** el handler recibe exactamente `Pérez & Hijos` y `monto < 500`

### Requirement: Excepciones a la sanitización
Un parámetro MAY excluirse de la sanitización con `sanitizar: false` en el archivo de funciones. Los textos de los métodos webservice de categoría 100 o 200 MUST NOT sanitizarse, igual que en JKMate3.

#### Scenario: Parámetro excluido
- **GIVEN** un parámetro con `sanitizar: false`
- **WHEN** se invoca la tool con `<b>hola</b>` en ese parámetro
- **THEN** la base recibe `<b>hola</b>`

## MODIFIED Requirements

### Requirement: Campos camelCase, estables y sin duplicados
Los nombres de campo de `structuredContent` MUST estar en camelCase y en español, y MUST NOT depender de los nombres de columna de los SP. Una misma respuesta MUST NOT incluir dos campos con el mismo dato ni datos de presentación (colores, íconos, estilos). Excepción: en las tools `procedure` y `webservice` del archivo de funciones, los nombres se derivan automáticamente de las columnas convertidas a camelCase (`COD_BARRIO` → `codBarrio`), salvo que `salida` les dé otro nombre. Elegir qué columnas exponer es responsabilidad de quien escribe el archivo, con `salida`.

#### Scenario: Sin columnas crudas ni datos de UI
- **GIVEN** el ticket #74836
- **WHEN** se invoca `obtener_contexto_ticket` con `ticketId` 74836
- **THEN** ningún nombre de campo de la respuesta está en mayúsculas con guiones bajos (por ejemplo `COD_RECLAMO`)
- **AND** la respuesta no contiene ningún campo de color de perfil ni equivalente
- **AND** cada mensaje del historial tiene una sola fecha

#### Scenario: Columnas de un procedure en camelCase
- **GIVEN** una tool `procedure` sobre `PROC_GET_BARRIOS` sin `salida`
- **WHEN** se invoca
- **THEN** ninguna propiedad de las filas está en mayúsculas con guiones bajos

### Requirement: Paginación con total
Toda tool de listado de tipo `compleja` MUST aceptar `limite` (por defecto 20, máximo 100) y `desplazamiento` (por defecto 0). MUST devolver `total` (cantidad de elementos que cumplen los filtros, sin contar la paginación), `limite`, `desplazamiento` y `hayMas`. Las tools `procedure` y `webservice` no paginan: cuando declaran `maxFilas`, MUST informar `hayMas`.

#### Scenario: Segunda página
- **GIVEN** 45 tickets que cumplen los filtros
- **WHEN** se invoca `listar_tickets` con `limite: 20` y `desplazamiento: 20`
- **THEN** la respuesta trae 20 elementos, `total: 45` y `hayMas: true`

#### Scenario: Límite fuera de rango
- **WHEN** se invoca un listado con `limite: 500`
- **THEN** la tool responde con un error de código `PARAMETRO_INVALIDO`
