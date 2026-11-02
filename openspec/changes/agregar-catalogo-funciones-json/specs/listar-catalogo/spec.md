# Spec Delta

## Purpose

`listar_catalogo` es una tool `compleja` genérica: su código se escribe una sola vez y cualquier catálogo (MCP) la reutiliza. Todas las tools de listado simple de opciones se declaran en el archivo de funciones como variantes agrupadas bajo ella (`procedure` o `webservice` con `"grupo": "listar_catalogo"`), y pasan por ese mismo código para ejecutarse y componer la salida. Así un catálogo de referencia nuevo se agrega con unas líneas de JSON. Es el equivalente de `tipo: "grupo"` de la v1.

## ADDED Requirements

### Requirement: Handler genérico declarado una vez
El handler común `listar_catalogo` MUST estar disponible para cualquier catálogo. Se publica con una tool `compleja` (`"handler": "listar_catalogo"`) cuyo nombre, título y descripción salen del archivo. Sus variantes son las tools `procedure` o `webservice` con `grupo` igual al nombre de esa tool, y MUST NOT publicarse sueltas. Una tool con este handler sin variantes, o una variante cuyo grupo no existe, MUST invalidar el archivo.

#### Scenario: Catálogos agrupados
- **GIVEN** una tool `listar_catalogo` con `handler: "listar_catalogo"` y las variantes `barrios`, `localidades` y `resultados`
- **WHEN** un cliente consulta `tools/list`
- **THEN** aparece `listar_catalogo` y no aparece ninguna tool llamada `barrios`, `localidades` ni `resultados`

#### Scenario: Catálogo nuevo sin código
- **GIVEN** un catálogo que agrega la variante `provincias` sobre un procedure existente
- **WHEN** se guarda el archivo
- **THEN** `listar_catalogo` acepta `catalogo: "provincias"` sin haber modificado código

### Requirement: Entrada de listar_catalogo
El `inputSchema` MUST tener `catalogo`, obligatorio y con un enum de los nombres de las variantes en el orden del archivo. Si alguna variante declara `padre`, MUST tener además `codPadre` (entero positivo). Si alguna declara `busqueda`, MUST tener además `buscar` (texto de hasta 200 caracteres). Un `catalogo` desconocido MUST responder `PARAMETRO_INVALIDO` con la lista de catálogos disponibles.

#### Scenario: Catálogo desconocido
- **WHEN** se invoca `listar_catalogo` con `catalogo: "provincias"` y esa variante no existe
- **THEN** la respuesta es un error `PARAMETRO_INVALIDO` que nombra los catálogos disponibles

### Requirement: Salida compuesta desde la definición de la variante
La respuesta MUST tener la forma `{ catalogo, elementos, avisos, busqueda? }`, la misma para todas las variantes. Cada elemento MUST armarse con la `salida` de la variante: la columna, el nombre de campo y el tipo de cada valor. Toda variante MUST declarar en su `salida` los campos `codigo` y `nombre`, y MAY agregar otros. El `outputSchema` MUST generarse desde las `salida` de todas las variantes: `codigo` y `nombre` obligatorios, y los demás opcionales, con su tipo.

#### Scenario: Elemento con campo propio
- **GIVEN** la variante `resultados` con `salida: [{ "columna": "COD_RESULTADO_RECLAMO", "nombre": "codigo" }, { "columna": "DESCRIPCION", "nombre": "nombre" }, { "columna": "EXIGE_AGENDAMIENTO", "nombre": "exigeAgendamiento", "tipo": "booleano" }]`
- **WHEN** se invoca `listar_catalogo` con `catalogo: "resultados"` y `codPadre` de una categoría
- **THEN** cada elemento tiene `codigo`, `nombre` y `exigeAgendamiento` booleano

#### Scenario: Variante sin codigo
- **GIVEN** una variante cuya `salida` no define `codigo`
- **WHEN** se carga el archivo
- **THEN** la carga falla con un error que nombra la variante y `codigo`

### Requirement: Orden del resultado
Una variante MAY declarar `orden` con una lista de campos de su `salida`, cada uno ascendente o descendente (`{ "campo": "fechaFin", "desc": true }`). Si lo declara, los elementos MUST ordenarse así antes de aplicar la búsqueda. Los textos se comparan con la colación `es`.

#### Scenario: Campañas más recientes primero
- **GIVEN** la variante `campanias` con `orden: [{ "campo": "fechaFin", "desc": true }]`
- **WHEN** se invoca `listar_catalogo` con `catalogo: "campanias"`
- **THEN** los elementos vienen ordenados por `fechaFin` descendente

### Requirement: Descripción generada
La descripción publicada MUST ser la `descripcion` de la tool, seguida de una línea por variante generada desde el archivo, con la forma `• <nombre>[ — requiere|opcional: codPadre = codigo de '<catalogo padre>'] — <uso>[ [buscar]]`. `uso` es el campo de la variante, o su descripción si no lo tiene.

#### Scenario: Línea de una variante con padre requerido
- **GIVEN** la variante `resultados` con `padre: { "parametro": "COD_CATEGORIA_MENSAJE", "catalogo": "categorias" }` y `uso: "codigo → registrar_*.codResultado"`
- **WHEN** un cliente consulta `tools/list`
- **THEN** la descripción contiene la línea `• resultados — requiere codPadre = codigo de 'categorias' — codigo → registrar_*.codResultado`

### Requirement: Código padre
Una variante MAY declarar `padre` con `parametro` (uno de sus parámetros), `catalogo` (otra variante del mismo grupo, para la descripción) y `requerido` (por defecto `true`). `codPadre` MUST enviarse a `padre.parametro`. Si el padre es requerido y falta `codPadre`, MUST responder `PARAMETRO_INVALIDO` indicando de qué catálogo sale. En una variante sin `padre`, un `codPadre` recibido MUST ignorarse y avisarse en `avisos`. Lo mismo vale para `buscar` en una variante sin búsqueda.

#### Scenario: Falta el padre
- **WHEN** se invoca `listar_catalogo` con `catalogo: "resultados"` sin `codPadre`
- **THEN** la respuesta es un error `PARAMETRO_INVALIDO` que menciona `categorias`

#### Scenario: Padre que no aplica
- **WHEN** se invoca `listar_catalogo` con `catalogo: "barrios"` y `codPadre: 3`, y `barrios` no tiene padre
- **THEN** la respuesta trae los barrios
- **AND** `avisos` contiene un mensaje que dice que `codPadre` no aplica a `barrios`

### Requirement: Variantes sin parámetros imposibles
Una variante MUST NOT tener parámetros requeridos visibles, salvo el de `padre`, porque `listar_catalogo` solo transmite `codPadre` y `buscar`. Los demás datos deben resolverse con `valorFijo` o con campos de sesión. Si no, el archivo MUST ser inválido. Una variante con `escritura: true` también MUST invalidarlo, y las annotations de `listar_catalogo` MUST ser de solo lectura.

#### Scenario: Variante con un parámetro obligatorio de más
- **GIVEN** una variante con un parámetro requerido `FECHA` que no es su padre
- **WHEN** se carga el archivo
- **THEN** la carga falla con un error que nombra la variante y `FECHA`

### Requirement: Ejecución de la variante
La variante elegida MUST ejecutarse con las reglas de su tipo: `procedure` o `webservice`, campos de sesión, `valorFijo`, contexto de sesión y caché de `busqueda`. La búsqueda aproximada MUST aplicarse sobre los elementos ya compuestos, comparando contra los campos de `busqueda.campos` (nombres de la `salida`).

#### Scenario: Grupos del vendedor de la sesión
- **GIVEN** la variante `grupos` sobre `PROC_GET_GRUPOS_PROSP_X_VEND` con `campoVendedor: "COD_VENDEDOR_IN"` forzado
- **WHEN** el vendedor 12 invoca `listar_catalogo` con `catalogo: "grupos"`
- **THEN** el procedure recibe `COD_VENDEDOR_IN = 12`

#### Scenario: Barrios con búsqueda
- **GIVEN** la variante `barrios` sobre `PROC_GET_BARRIOS` con `busqueda: { "campos": ["nombre"], "cacheMinutos": 60, "cacheAlcance": "global" }`
- **WHEN** se invoca con `catalogo: "barrios"` y `buscar: "alberdi"`
- **THEN** los elementos vienen ordenados por `similitud` descendente, junto con el objeto `busqueda`

### Requirement: Prospección migrada al handler genérico
El `listar_catalogo` de prospección MUST pasar al handler genérico, con sus 8 catálogos declarados como variantes `procedure` en `funciones/prospeccion-functions.json` y sin código propio. Su nombre, título, descripción e `inputSchema` MUST quedar idénticos, su `outputSchema` equivalente, y sus respuestas iguales a las anteriores.

#### Scenario: Mismo resultado que antes
- **GIVEN** la captura de las respuestas de `listar_catalogo` de prospección para cada catálogo, tomada antes del cambio contra la base simulada
- **WHEN** se repiten las mismas llamadas después del cambio
- **THEN** las respuestas son iguales
