# Proposal

## Why

En los MCP ya desarrollados en este proyecto (tickets y prospección), las descripciones del servidor, de cada tool y de cada parámetro están escritas en el código fuente. Ajustar un texto, que es lo que más se toca al afinar un MCP para que el agente lo use bien, obliga a recompilar y redesplegar. En el MCP de tickets v1 (`mcp-server/`), en cambio, todo eso vive en un `*-functions.json` que se edita en caliente, y además una tool nueva se publica sin código: alcanza con relacionarla con un método de webservice registrado en la base. Así se armaron rápido los MCP de tickets, prospección, previsión, prenecesidad y documentación.

Queremos el mismo mecanismo acá. Cada tool del archivo declara un **tipo** que define cómo se ejecuta:

- **procedure:** pasamano de parámetros directo a un stored procedure.
- **webservice:** usa la definición de un método guardada en `METODOS_WEBSERVICES`.
- **compleja:** lógica escrita en código. Puede ser propia de un MCP, como las tools ya desarrolladas, o genérica y reutilizable, como `listar_catalogo`: se escribe una sola vez y todos los listados simples de opciones de cualquier MCP pasan por ella.

## What Changes

- **Archivo de funciones por catálogo** (`funciones/<catalogo>-functions.json`, como en la v1).
  - Contiene la info del servidor (nombre, versión, claim requerida, instrucciones) y la lista de tools.
  - Cada tool lleva nombre, título, descripción, tipo y parámetros con su descripción.
  - Ningún texto publicado queda en el código fuente.
  - El archivo se valida con un esquema publicado (`funciones/functions.schema.json`) y se recarga en caliente cuando cambia en disco. Si la versión nueva es inválida, se loguea el error y se sigue con la anterior.
- **Catálogos definidos por archivo.** `MCP_CATALOGO` deja de ser una lista fija (`tickets|prospeccion`) y nombra un archivo de `funciones/`. `MCP_FUNCIONES_ARCHIVO` permite indicar otra ruta. Un MCP nuevo hecho con tools `procedure`, `webservice` y los handlers genéricos se monta sin tocar código.
- **Tool tipo `procedure`.** Arma `SELECT * FROM <PROCEDURE>(...)`, o `EXECUTE PROCEDURE` si el procedure es ejecutable, con los parámetros en el orden y con los tipos que tienen en la base (`RDB$PROCEDURE_PARAMETERS`). Un procedure sin parámetros se invoca sin paréntesis. Los parámetros declarados se verifican contra el procedure.
- **Tool tipo `webservice`.** No invoca ningún webservice: lee la definición del método (`METODOS_WEBSERVICES` y sus parámetros, con `PROC_GET_METODO_WEBSERV_X_NOMB` y `PROC_GET_PARAMS_METODOS_WEBSERV`) y compone la llamada directo en Firebird.
  - Verifica que los parámetros que recibe la tool existan en el método.
  - Convierte cada valor según el tipo que la definición le asigna, igual que `DirectDbHelper` de la v1.
  - Ejecuta los cuatro tipos `DATASET_*`/`EXECUTE_*`.
- **Tool tipo `compleja`.** Las tools ya desarrolladas de tickets y prospección siguen con su lógica en código, pero el archivo pasa a tener sus textos: título y descripción de la tool y descripción de cada parámetro, con una entrada `handler` que indica qué lógica usar. `tools/list` queda idéntico al actual. También quedan como handlers reutilizables por cualquier catálogo `user_info` y `obtener_instrucciones`.
- **`listar_catalogo` genérico.** Es una tool `compleja` cuyo código se escribe una sola vez y queda como handler común.
  - Cada listado simple de opciones se declara en el JSON como una variante `procedure` o `webservice` con `"grupo": "listar_catalogo"`, sin código propio.
  - Todas las variantes pasan por el mismo código: elige la variante con `catalogo` (enum), le pasa `codPadre` y `buscar`, la ejecuta y compone una salida uniforme `{ catalogo, elementos, avisos, busqueda? }` con la `salida` (columna → campo y tipo) que declara cada variante.
  - La descripción se genera con una línea por catálogo. Es el equivalente de `tipo: "grupo"` de la v1.
  - El `listar_catalogo` de prospección se migra a este handler: sus 8 catálogos pasan a ser variantes en el JSON y se borra su código propio.
- **Parámetros como en la v1** (`procedure`, `webservice` y variantes de `listar_catalogo`):
  - `alias`, `default`, `valorFijo`, `requerido` y el tipo `json` para objetos anidados.
  - Campos de sesión: `campoUsuario`, `campoVendedor`, `campoDesarrollador`, `campoProveedor`, `campoCliente`, `campoEmpresa` y `campoSecuencialEmpresa`, en modo forzado o autocompletado.
  - `salida`, `busqueda` (búsqueda aproximada con caché, sobre `src/busqueda/`) y `maxFilas`.
  - `escritura` y `rechazo` (columna de resultado que, con un valor de error, responde `OPERACION_RECHAZADA` y hace rollback).
- **Contexto de sesión en la base**, como en la v1. Antes de ejecutar, las claves de identidad de la sesión se escriben en `RDB$SET_CONTEXT('USER_SESSION', ...)` en la conexión que va a usar la tool. Se reescriben todas en cada invocación, así una conexión reutilizada del pool nunca conserva la identidad de otro usuario. Una tool puede pedir `conexionExclusiva`.
- **Sanitización de la entrada en todas las tools.** Se quitan el HTML y el JavaScript ejecutable de cada texto recibido, también dentro de objetos anidados y de textos que contienen un JSON. Los textos sin marcado no se tocan. Se puede excluir un parámetro con `sanitizar: false`, y los métodos de categoría 100 y 200 quedan exentos, como en JKMate3.
- **Respuesta con el contrato del proyecto.** Las columnas salen en camelCase y las fechas en ISO 8601, dentro de `{ resultado: [...] }`. `salida` permite elegir, renombrar y tipar columnas.
- **Identidad en stdio generalizada.** Cada clave de identidad se puede fijar con `MCP_COD_<CLAVE>`. La que el catálogo declara como requerida es obligatoria.

## Capabilities

### New Capabilities
- `catalogo-funciones`: archivo de funciones por catálogo, textos fuera del código, validación, recarga en caliente, selección por configuración e identidad en stdio.
- `tools-procedure`: tools que pasan sus parámetros a un stored procedure.
- `tools-webservice`: tools que componen la llamada con la definición del método guardada en `METODOS_WEBSERVICES`.
- `tools-compleja`: tools con lógica en código cuyos textos viven en el archivo.
- `listar-catalogo`: handler genérico `listar_catalogo` y sus variantes declaradas en el archivo, más la migración del de prospección.
- `parametros-funciones`: resolución de parámetros, campos de sesión, contexto de sesión, salida, búsqueda, escritura y rechazo, comunes a `procedure`, `webservice` y las variantes de `listar_catalogo`.

### Modified Capabilities
- `contrato-tools`:
  - Se agrega la sanitización de la entrada para todas las tools.
  - "Campos camelCase, estables y sin duplicados" admite la conversión automática de columnas en las tools `procedure` y `webservice`.
  - "Paginación con total" deja de exigir `total` a esas tools: informan `hayMas` cuando declaran `maxFilas`.

## Impact

- **Código:**
  - `src/funciones/` (nuevo): esquema del archivo, carga, recarga, los tipos `procedure` y `webservice` y el handler genérico `listar_catalogo`.
  - `src/nucleo/`: el registro de tools se construye desde el archivo, y la sanitización va en el ejecutor común.
  - `src/catalogos/`: las tools pasan a exportar handlers sin textos, `catalogos.ts` de prospección se elimina, y los textos y los catálogos de prospección se mueven a `funciones/tickets-functions.json` y `funciones/prospeccion-functions.json`.
  - `src/config.ts`: `MCP_CATALOGO` libre, `MCP_FUNCIONES_ARCHIVO` y `MCP_COD_*`.
  - `src/auth/sesion.ts`: la sesión lleva todas las claims.
  - `src/db/firebird.ts`: ejecución con contexto de sesión.
- **Dependencias:** `sanitize-html`.
- **Base de datos:** sin objetos nuevos. Usa `PROC_GET_METODO_WEBSERV_X_NOMB`, `PROC_GET_PARAMS_METODOS_WEBSERV`, `METODOS_WEBSERVICES` y `RDB$PROCEDURE_PARAMETERS`, verificados en `SANTAROSA64_IA`. Las pruebas van contra `SANTAROSA64_IA`, nunca contra `CREAR_JK3`, que es producción.
- **Compatibilidad:** las tools de tickets y prospección mantienen nombre, título, descripción, `inputSchema`, `outputSchema` y annotations. Lo verifica un test que compara `tools/list` antes y después.
- **Dependencia entre changes:** se apoya en `agregar-mcp-prospeccion` (catálogos, `src/busqueda/`, `OPERACION_RECHAZADA`). Su requisito "Selección del catálogo por configuración" queda reemplazado por el de este change: al archivar, `agregar-mcp-prospeccion` va primero y este delta se ajusta a MODIFIED.
- **Fuera de alcance:** las tools de reporte PDF de la v1, que quedan para un change posterior.
- **Segunda etapa, en un change aparte y después de este:** montar en este proyecto el MCP de previsión.
  - Sus tools `webservice` se traducen desde `prevision-functions.json` de la v1 y siguen funcionando igual.
  - La tool que hoy aplana la carga del contrato en un JSON y la delega al procedure `MCP_PREVISION_CARGAR_CONTRATO` (`cargar_contrato_prevision`) pasa a ser una tool `compleja` que hace en código lo que hoy hace ese procedure.
