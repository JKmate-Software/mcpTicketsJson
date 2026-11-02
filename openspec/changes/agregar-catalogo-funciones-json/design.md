# Design

## Context

La motivación está en proposal.md. Estado actual que condiciona el diseño:

- Cada tool es un `DefinicionTool` en TypeScript (`src/nucleo/definicion.ts`). Tiene nombre, título, descripción, `inputSchema` y `outputSchema` como JSON Schema, un validador zod y `ejecutar`. Las descripciones de los parámetros están en los `.describe()` del zod o en los JSON Schema escritos a mano. Los catálogos (`src/catalogos/{tickets,prospeccion}`) las arman en `crearTools`, y `MCP_CATALOGO` elige uno entre esos dos.
- El acceso a Firebird (`src/db/firebird.ts`) usa un pool de `node-firebird` con `blobAsText: true`:
  - `enTransaccion`: REPEATABLE READ de solo lectura.
  - `enTransaccionEscritura`: READ COMMITTED de escritura.
  - Los parámetros son posicionales (`?`).
- `Sesion` hoy es `{ codUsuario, codDesarrollador, codVendedor, transporte }`. El token HTTP ya trae las 7 claves de identidad (change `agregar-inicio-sesion-oauth`).
- En la v1 (`mcp-server/`), cada entrada de `*-functions.json` es un método de webservice:
  - `WebserviceFunctionExecutor` resuelve los parámetros (alias, default, valorFijo, campos de sesión).
  - `DirectDbHelper` lee la definición del método y ejecuta su SSQL en una conexión sin pool, con las claims cargadas en `RDB$SET_CONTEXT('USER_SESSION', ...)`.
  - `GrupoCatalogo` publica las variantes de un grupo como una sola tool.
- Verificado en `SANTAROSA64_IA` el 2026-11-02:
  - Existen `PROC_GET_METODO_WEBSERV_X_NOMB` y `PROC_GET_PARAMS_METODOS_WEBSERV`.
  - `METODOS_WEBSERVICES` tiene 5691 métodos `DATASET_SQL`, 960 `DATASET_PROCEDURE`, 90 `EXECUTE_PROCEDURE` y 29 `EXECUTE_SQL`. Todos guardan en SSQL una sentencia completa con parámetros `@NOMBRE`.
  - De los 9613 procedures, ninguno lee ni escribe `USER_SESSION`. Solo `SEMI_JSON_ERROR` y `MCP_PREVISION_CARGAR_CONTRATO` usan `RDB$SET_CONTEXT`, y en `USER_TRANSACTION`.
  - No hay triggers de base `ON CONNECT`.
  - Ejemplos para las pruebas: `ws_crm_mostrar_msj_x_cliente` (`SELECT * FROM PROC_GET_MENSAJES_X_CLIENTEP(@COD_CLIENTE_ING, @COD_PROSPECTO_ING)`), `ws_crm_mostrar_resultado` (un parámetro, `COD_CATEGORIA_MENSAJE`), y `PROC_GET_BARRIOS` y `PROC_GET_LOCALIDADES`, seleccionables y sin parámetros de entrada.

## Goals / Non-Goals

**Goals:**
- Ningún texto publicado en el código fuente: ajustar una descripción no requiere recompilar.
- Un único camino de publicación: toda tool sale del archivo, y el tipo decide solo cómo se ejecuta.
- Paridad con la v1 en el contexto de sesión, los campos de sesión, `listar_catalogo` (grupos de la v1), la sanitización y la composición del SSQL, para que un `functions.json` de la v1 se pueda traducir casi uno a uno.
- Que la migración de tickets y prospección no cambie su `tools/list`.

**Non-Goals:**
- Traducir automáticamente los `*-functions.json` de la v1. El README documenta la equivalencia campo por campo.
- Las tools de reporte PDF, la paginación `_PAGE_`/`_ROWS_` de `wsmetodo` y los parámetros `Binary`. La v1 tampoco implementa estos dos últimos.
- Generar `outputSchema` tipado para `webservice` sin `salida`: el SSQL no expone los tipos de sus columnas sin ejecutarlo.

## Decisions

### D1. Formato y ubicación del archivo
- `funciones/<catalogo>-functions.json` en la raíz del proyecto, con el mismo nombre que en la v1. Se resuelve desde `import.meta.url`, así funciona igual con `tsx` y con `dist/`, y se edita sin compilar.
- Las instrucciones `.md` van al lado (`funciones/prospeccion-instructions.md`). `src/catalogos/prospeccion/instrucciones.md` se mueve allí y se elimina el `postbuild` que lo copiaba.
- El esquema del archivo se escribe en zod (`src/funciones/esquema.ts`) y se publica como `funciones/functions.schema.json`, generado con `z.toJSONSchema`. Un test verifica que el publicado esté al día. Cada archivo lo referencia con `"$schema"`, así VS Code autocompleta y valida al editar.
- La carga hace tres pasos: JSON, zod y validaciones cruzadas (nombres únicos, `campo*` y `busqueda` contra `parametros`, handlers existentes, descripciones completas, variantes de `listar_catalogo`, `buscar` reservado). Devuelve un `CatalogoCargado` inmutable con la info del servidor y las `DefinicionTool[]` ya construidas.

Ejemplo (catálogo de demostración, tarea 7.1):

```json
{
  "$schema": "./functions.schema.json",
  "servidor": { "nombre": "mcp-demo-funciones", "claimRequerida": "COD_VENDEDOR" },
  "tools": [
    { "tipo": "compleja", "nombre": "user_info", "handler": "user_info",
      "descripcion": "Identidad de la sesión." },
    { "tipo": "compleja", "nombre": "listar_catalogo", "handler": "listar_catalogo",
      "titulo": "📚 Consultando el catálogo",
      "descripcion": "Catálogos de referencia. Elegí el catálogo con catalogo.",
      "parametros": [
        { "nombre": "catalogo", "descripcion": "Catálogo a listar." },
        { "nombre": "codPadre", "descripcion": "Código del catálogo padre (ver descripción)." },
        { "nombre": "buscar", "descripcion": "Texto aproximado, tal como lo dijo el usuario." } ] },
    { "tipo": "procedure", "nombre": "barrios", "grupo": "listar_catalogo",
      "procedure": "PROC_GET_BARRIOS", "descripcion": "Barrios.",
      "uso": "codigo → registrar_*.codBarrio",
      "salida": [ { "columna": "COD_BARRIO", "nombre": "codigo" }, { "columna": "NOMBRE", "nombre": "nombre" },
                  { "columna": "COD_LOCALIDAD", "nombre": "codLocalidad" } ],
      "orden": [ { "campo": "nombre" } ],
      "busqueda": { "campos": ["nombre"], "cacheMinutos": 60, "cacheAlcance": "global" } },
    { "tipo": "webservice", "nombre": "resultados", "grupo": "listar_catalogo",
      "metodo": "ws_crm_mostrar_resultado", "descripcion": "Resultados de una categoría de mensaje.",
      "uso": "codigo → registrar_*.codResultado; si exigeAgendamiento, pedir fechaHoraAgenda",
      "padre": { "parametro": "COD_CATEGORIA_MENSAJE", "catalogo": "categorias" },
      "parametros": [ { "nombre": "COD_CATEGORIA_MENSAJE", "tipo": "entero", "requerido": true,
                        "descripcion": "Categoría de mensaje." } ],
      "salida": [ { "columna": "COD_RESULTADO_RECLAMO", "nombre": "codigo" },
                  { "columna": "DESCRIPCION", "nombre": "nombre" },
                  { "columna": "EXIGE_AGENDAMIENTO", "nombre": "exigeAgendamiento", "tipo": "booleano" } ] },
    { "tipo": "webservice", "nombre": "historial_mensajes", "metodo": "ws_crm_mostrar_msj_x_cliente",
      "descripcion": "Mensajes de un prospecto.", "maxFilas": 50,
      "parametros": [
        { "nombre": "COD_CLIENTE_ING", "alias": "codCliente", "tipo": "entero", "requerido": true,
          "descripcion": "Cliente del prospecto." },
        { "nombre": "COD_PROSPECTO_ING", "alias": "codProspecto", "tipo": "entero", "requerido": true,
          "descripcion": "Prospecto." } ] }
  ]
}
```

Respuesta de ejemplo de `listar_catalogo` con `catalogo: "barrios"` y `buscar: "alberdi"`:

```json
{ "catalogo": "barrios",
  "elementos": [ { "codigo": 311, "nombre": "B° ALBERDI", "codLocalidad": 1, "similitud": 92 } ],
  "avisos": [],
  "busqueda": { "texto": "alberdi", "totalCatalogo": 1840, "devueltos": 1, "mensaje": null } }
```

Los valores son ilustrativos (A CONFIRMAR al correr contra `SANTAROSA64_IA`).

### D2. Un solo camino de publicación
- Nuevo `src/funciones/construir.ts` con `construirTool(entrada, deps): DefinicionTool`, que despacha por `tipo`. El servidor MCP (`src/nucleo/servidor-mcp.ts`) sigue recibiendo `DefinicionTool[]`. Cambia solo quién las arma.
- `DefinicionCatalogo` se reemplaza por el archivo más un registro de handlers. `src/catalogos/index.ts` pasa a ser `HANDLERS: Record<string, HandlerCompleja>`, que reúne los comunes (`user_info`, `obtener_instrucciones`) y los de cada catálogo (`tickets.*`, `prospeccion.*`).
- Para la recarga, el servidor consulta un `RegistroTools` (`actual(): CatalogoCargado`) en cada `tools/list` y `tools/call`. Una invocación toma la referencia al empezar y la usa hasta terminar.

### D3. Tools `compleja`: textos fuera del código
- `HandlerCompleja` es un `DefinicionTool` sin `nombre`, `titulo` ni `descripcion`, y sin las descripciones de sus propiedades. Una fábrica `(deps) => ...` recibe `acceso`, `zonaHoraria`, la caché y la info del servidor.
- El código conserva lo que es contrato de la lógica: tipos, enums, rangos y defaults del zod. El archivo aporta los textos, también los de las propiedades anidadas (`filtros.estado`). Al publicarse, la descripción del archivo se inyecta en `inputSchema.properties[...].description`.
- Al cargar se verifica que el `inputSchema` del handler no traiga descripciones (si las trae, la carga falla) y que el archivo no describa propiedades que no existen. Una propiedad que el archivo no describe se publica sin descripción, como pasa hoy con varias de tickets: exigir una para todas habría cambiado el `tools/list`.
- **Migración sin cambios visibles:**
  1. Antes de tocar nada, un test captura `tools/list` de `tickets` y `prospeccion` en `test/datos/tools-list-<catalogo>.json`.
  2. Un script (`scripts/extraer-textos.ts`, de un solo uso) vuelca a los JSON los textos actuales del código.
  3. Se borran los textos del código, y el test de captura tiene que dar igual.

### D4. Tools `procedure`
- La metadata sale de `RDB$PROCEDURES.RDB$PROCEDURE_TYPE` y de `RDB$PROCEDURE_PARAMETERS` cruzado con `RDB$FIELDS` (`RDB$FIELD_TYPE`, `RDB$FIELD_SCALE`, `RDB$FIELD_SUB_TYPE`). Se cachea por nombre de procedure dentro del `CatalogoCargado`, así una recarga la invalida.
- SQL armado:
  - Seleccionable: `SELECT * FROM P` o `SELECT * FROM P(?, ?, ...)`, sin `()` si no tiene entradas.
  - Ejecutable: `EXECUTE PROCEDURE P(?, ...)`. Que `node-firebird` devuelva la fila de salida queda A CONFIRMAR en la tarea 4.3. Si no la devuelve, se responde `{ resultado: [] }`.
- Tipos de salida: DATE se emite `AAAA-MM-DD`, TIMESTAMP en ISO con offset (`src/mapeo/fecha.ts`), los enteros y los NUMERIC con escala como número, y `CHAR` con `trimEnd`.

### D5. Tools `webservice`: la definición del método compone la llamada
- No hay llamada HTTP. La definición se lee con `PROC_GET_METODO_WEBSERV_X_NOMB(?)` (TIPO, SSQL y categoría) y `PROC_GET_PARAMS_METODOS_WEBSERV(?)` (nombre, tipo y longitud de cada parámetro), por el pool. Se cachea con vencimiento de `MCP_WEBSERVICE_CACHE_SEGUNDOS` (por defecto 60). La v1 la lee en cada llamada: con 60 segundos, un cambio en JK3 tarda como mucho un minuto en verse. `0` reproduce el comportamiento de la v1.
- **Verificación de los parámetros:**
  - Cada parámetro declarado en la tool tiene que existir en la definición, sin distinguir mayúsculas. Si no existe, se responde `ERROR_INTERNO` y no se ejecuta nada.
  - Un parámetro de la definición que la tool no declara va NULL, como en JKMate3 cuando el request no lo trae.
  - El valor ya pasó por el zod de la tool, que surge de los `tipo` del archivo. Además se convierte según el tipo de la definición (`MapearTipo` de `DirectDbHelper` en Node): un `Integer` que llega como texto numérico se envía como número, y un texto que no es número responde `PARAMETRO_INVALIDO`.
- **Traducción de `@NOMBRE`:** un tokenizador recorre el SSQL salteando los literales `'...'` (con `''` escapado), los identificadores `"..."` y los comentarios `--` y `/* */`. Cada `@NOMBRE` se reemplaza por `?` y su valor se agrega en el orden de aparición.
- `Boolean` va como 1/0. En `Date`/`Time`/`Timestamp` con `T` se reemplazan los espacios por `+`, como `wsmetodo`.
- **Ejecución:** `DATASET_*` devuelve filas y `EXECUTE_*` ejecuta y devuelve `[]`. Sin `salida`, un `Date` se emite como timestamp ISO con offset. Con `salida` y `tipo: "fecha"`, se emite `AAAA-MM-DD`.

### D6. Contexto de sesión: qué conexión usar

Las claims se cargan con `RDB$SET_CONTEXT('USER_SESSION', ...)`. Ese contexto vive en la conexión (attachment): no lo limpia el fin de la transacción, y sigue ahí hasta que la conexión se cierra. Con un pool, la conexión que usó un usuario la toma después otro. Por eso hay que decidir.

| Alternativa | Seguridad | Costo por invocación | Observaciones |
|---|---|---|---|
| A. Conexión propia por invocación (la de la v1) | Total: el contexto muere con la conexión | Un attach completo: TCP, autenticación SRP y carga del attachment. Del orden de decenas de ms en LAN, más por WAN | La más simple de razonar, y la que menos rinde |
| B. Pool y borrar al terminar las claves que se escribieron | Frágil: si el proceso falla entre la tool y la limpieza, la clave queda escrita | Una sentencia | Descartada |
| **C. Pool y reescribir todas las claves de identidad al empezar cada invocación** (valor o NULL) | Total para la identidad: el conjunto de claves es fijo (7 más `COD_CREDENCIAL_MCP`) y se pisa siempre antes de ejecutar | Una sentencia: `SELECT RDB$SET_CONTEXT('USER_SESSION','COD_USUARIO',?), ... FROM RDB$DATABASE` | Solo podría filtrarse una clave que escribiera un procedure por su cuenta |
| D. Usar `USER_TRANSACTION` en lugar de `USER_SESSION` | Total: se limpia sola con la transacción | Igual que C | Obliga a cambiar los procedures que lean el contexto, y la v1 y JKMate3 usan `USER_SESSION`. Descartada |
| E. `ALTER SESSION RESET` al devolver la conexión al pool | Total | Una sentencia | Recién existe en Firebird 4, y la base es Firebird 3. Descartada |

**Recomendación: C**, más `conexionExclusiva: true` por tool (que equivale a A) para el caso raro.
- C resuelve el riesgo real, que la identidad de un usuario la vea otro, con una sola sentencia y sin perder el pool.
- El único hueco de C (un procedure que escribe en `USER_SESSION` claves propias) hoy no existe en `SANTAROSA64_IA`: ningún procedure escribe ni lee `USER_SESSION`. Si aparece, `npm run validar-funciones` lo detecta leyendo el código del procedure y sugiere `conexionExclusiva`.
- La v1 eligió A porque el proveedor ADO.NET no permite controlar con certeza qué conexión física reutiliza. En Node el pool es nuestro, y la sentencia se ejecuta en la misma conexión y transacción que la tool.
- Implementación: `AccesoDatos.enTransaccionConContexto(contexto, escritura, trabajo, medidor)`. Toma una conexión del pool, o una propia si `exclusiva`; abre la transacción; reescribe las 8 claves en una sentencia; ejecuta, y hace commit o rollback. El aislamiento es READ COMMITTED, de solo lectura salvo en las escrituras, como `cDBHelperFB` de JKMate3.

### D7. Sesión con todas las claims
- `Sesion` suma `claims: Record<ClaveIdentidad, string>` con las 7 claves más `COD_CREDENCIAL_MCP`, y conserva los campos actuales para no tocar las tools `compleja`. En HTTP sale de `sesionDesdeClaims`, y en stdio de las variables `MCP_COD_*`.
- `MCP_COD_USUARIO` y `MCP_COD_VENDEDOR` mantienen su nombre. Que esté la variable de `claimRequerida` se valida después de cargar el archivo.
- `completarSesion` es un handler opcional. `tickets.completar_sesion` contiene la consulta a `USUARIOS` que hoy está en `CATALOGO_TICKETS.sesionStdio`.

### D8. Resolución de parámetros
Es un port de `WebserviceFunctionExecutor`, en una función pura (`resolverParametros(entrada, args, sesion)`) con su propio test:

| Opción | En el `inputSchema` | Valor que recibe la base |
|---|---|---|
| `valorFijo` | oculto | siempre el valor fijo |
| `campoUsuario` | oculto | siempre el de la sesión |
| `campo*` con parámetro requerido (forzado) | oculto | siempre el de la sesión |
| `campo*` con parámetro no requerido (autocompletado) | visible | el del cliente o, si no lo mandó, el de la sesión |
| `default` | visible | el del cliente o el default |
| `alias` | visible con el alias | se envía con el nombre real |
| tipo `json` | visible, objeto o array | el JSON serializado como texto |

El zod de entrada se genera desde los parámetros visibles: `entero` es `z.number().int()`, `decimal` es `z.number()`, `texto` es `z.string()`, `booleano` es `z.boolean()`, `fecha` es `AAAA-MM-DD`, `fechaHora` es un ISO y `json` es un objeto o array. El `inputSchema` se genera del mismo zod con `z.toJSONSchema`, así nunca se desincronizan.

### D9. Errores
- Los errores de Firebird con `gdscode` 335544517 (excepción de usuario) devuelven `OPERACION_RECHAZADA` con el texto de la excepción. El resto devuelve `ERROR_INTERNO`, con el detalle solo en el log.
- `rechazo` se evalúa sobre la primera fila y fuerza el rollback.
- Una columna de `salida` inexistente devuelve `ERROR_INTERNO` con las columnas disponibles en el log, igual que `ProyeccionSalida.Validar` de la v1.

### D10. Recarga en caliente
- `fs.watch` sobre el archivo y su `.md`, con un debounce de 300 ms. Se carga, se valida y recién entonces se reemplaza el `CatalogoCargado`. Ante un error se loguea `error` y se sigue con el anterior.
- No se envía `notifications/tools/list_changed`, igual que en la v1. En HTTP sin estado cada request ya crea su `Server`.

### D11. `npm run validar-funciones`
Es un script que carga el archivo, se conecta a la base configurada y verifica:

- `procedure`: que exista y que sus parámetros declarados existan.
- `webservice`: que el método exista y que cada parámetro declarado figure en su definición.
- Advertencia: un procedure (directo, o el que aparece en el SSQL) que escribe en `USER_SESSION`, sin `conexionExclusiva`.

Informa todos los problemas juntos y no ejecuta ninguna tool.

### D12. `listar_catalogo`: compleja genérica con variantes en el JSON
- Es un handler común (`src/funciones/listar-catalogo.ts`), escrito una sola vez y registrado como `listar_catalogo`. Cualquier catálogo lo publica con una tool `compleja` que lo nombra. Sus variantes son entradas `procedure` o `webservice` con `"grupo": "<nombre de esa tool>"`: se construyen como cualquier tool (parámetros, sesión, contexto), pero no se publican sueltas.
- Es el equivalente de `GrupoCatalogo.cs` de la v1, con dos diferencias:
  - Los nombres de la entrada pasan de `CATALOGO`/`COD_PADRE`/`BUSCAR` a `catalogo`/`codPadre`/`buscar`, por el contrato de camelCase.
  - La salida es uniforme (`{ catalogo, elementos, avisos, busqueda? }`), la que ya usa prospección, y no `{ resultado }`. El agente ve siempre la misma forma, sea cual sea el catálogo.
- **Composición de la salida:** cada variante declara en su `salida` qué columna va a qué campo y con qué tipo. `codigo` y `nombre` son obligatorios en todas, y el resto es libre (`exigeAgendamiento`, `fechaFin`, `codProvincia`...).
  - El `outputSchema` se genera uniendo las `salida` de todas las variantes: `codigo` y `nombre` obligatorios, y los demás opcionales y nulables con su tipo. Si dos variantes declaran el mismo campo con tipos distintos, el archivo es inválido.
  - `orden` (lista de `{ campo, desc? }`) ordena antes de la búsqueda, con la colación `es`. Reemplaza al `ordenar` que hoy está en código.
- **Entrada y descripción:**
  - El `inputSchema` publica `catalogo` (enum en el orden del archivo), `codPadre` (entero positivo, solo si alguna variante tiene `padre`) y `buscar` (máximo 200 caracteres, solo si alguna tiene `busqueda`).
  - La descripción es la del archivo más una línea por variante, con el mismo formato que genera hoy `descripcionListarCatalogo()`, así la migración de prospección conserva el texto.
- **Resolución:** elige la variante, envía `codPadre` a `padre.parametro`, reporta en `avisos` lo que no aplica, ejecuta la variante, compone los elementos, ordena y aplica la búsqueda sobre los elementos compuestos (campos de `busqueda.campos`), con la caché de `src/busqueda/`. `cacheAlcance: "usuario"` usa como clave la identidad de la sesión, que reemplaza al alcance `vendedor` actual de `canales`.
- **Validaciones de carga:**
  - Hay al menos una variante.
  - El grupo nombrado existe y usa este handler.
  - `padre.catalogo` es una variante del mismo grupo.
  - Las variantes no tienen parámetros requeridos visibles fuera del padre, no tienen `escritura: true` y su `salida` define `codigo` y `nombre`.
- **Migración de prospección:** los 8 catálogos de `src/catalogos/prospeccion/catalogos.ts` se traducen a variantes `procedure` (procedures y parámetros verificados en `SANTAROSA64_IA`):

| Variante | Procedure | Parámetros | `salida` (columna → campo) |
|---|---|---|---|
| `grupos` | `PROC_GET_GRUPOS_PROSP_X_VEND` | `COD_VENDEDOR_IN` con `campoVendedor`, forzado | `COD_GRUPO_PROSPECTO`→codigo, `NOMBRE`→nombre, `ESTADO_GRUPO_PROSPECTO`→estado |
| `canales` | `PROC_GET_ENTIDADES_X_MCCATEG` | `MACRO` con `valorFijo` `"PROSPECCIO"` | `COD_ENTIDAD`→codigo, `NOMBRE`→nombre |
| `categorias` | `PROC_GET_CAT_MENS_ENC_PROSP` | `SEGUIMIENTO` con `valorFijo` 0; `COD_RESULT_RECL_ORIGEN` como padre opcional (`resultados`) | `COD_CATEGORIA_MENSAJE`→codigo, `CATEGORIA`→nombre |
| `resultados` | `PROC_GET_RESULTADOS_RECL_X_CAT` | `COD_CATEGORIA_MENSAJE` como padre requerido (`categorias`) | `COD_RESULTADO_RECLAMO`→codigo, `DESCRIPCION`→nombre, `EXIGE_AGENDAMIENTO`→exigeAgendamiento (booleano) |
| `acciones` | `PROC_GET_CAT_MENSAJES_PROSP` | `SEGUIMIENTO` con `valorFijo` 1 | `COD_CATEGORIA_MENSAJE`→codigo, `CATEGORIA`→nombre |
| `campanias` | `PROC_GET_CAMPANIAS` | — | `COD_CAMPANIA`→codigo, `CAMPANIA`→nombre, `FECHA_INICIO`→fechaInicio, `FECHA_FIN`→fechaFin; `orden` fechaFin desc; búsqueda global |
| `localidades` | `PROC_GET_LOCALIDADES` | — | `COD_LOCALIDAD`→codigo, `NOMBRE`→nombre, `COD_PROVINCIA`→codProvincia, `CODIGO_POSTAL`→codigoPostal; búsqueda global |
| `barrios` | `PROC_GET_BARRIOS` | — | `COD_BARRIO`→codigo, `NOMBRE`→nombre, `COD_LOCALIDAD`→codLocalidad, `CODIGO_POSTAL`→codigoPostal; `orden` nombre; búsqueda global |

  `canales` conserva la búsqueda con alcance `usuario`. Un test captura antes del cambio las respuestas de cada catálogo contra la base simulada, y las compara después.
- Diferencia de ejecución: hoy estas lecturas usan el pool en REPEATABLE READ sin contexto. Como variantes `procedure`, pasan a READ COMMITTED con el contexto de sesión (D6). Para catálogos de referencia no cambia el resultado.

### D13. Sanitización de la entrada
- Se aplica en el ejecutor común (`src/nucleo/ejecutar.ts`) a toda tool, antes de validar con zod. Así cubre los cuatro tipos, también las `compleja` existentes.
- Recorre en profundidad los objetos y arrays. Un texto que es JSON válido (empieza con `{` o `[`) se parsea, se sanitiza y se vuelve a serializar.
- Un texto solo se procesa si contiene marcado: `<` seguido de una letra, `/`, `!` o `?`, un atributo `on…=`, `javascript:` o una entidad `&#`. Si no, se deja intacto. Así `Pérez & Hijos` o `monto < 500` no se convierten en `&amp;` o `&lt;`, que sí cambiaría una búsqueda.
- Con marcado, se aplica `sanitize-html` sin etiquetas permitidas (solo queda el texto, y `script` y `style` se descartan con su contenido) y después se decodifican las entidades del texto resultante.
- Exclusiones: `sanitizar: false` por parámetro en el archivo (también para las `compleja`), y los métodos webservice de categoría 100 o 200, como en JKMate3.
- Diferencia con JKMate3: `HtmlSanitizer` conserva las etiquetas que considera seguras (`<b>`) y escapa el texto. Acá se quita todo el marcado. Para datos que van a un procedure, y no a una página, el texto plano es lo correcto. Un test fija los casos: `script`, `img onerror`, `javascript:`, JSON anidado y texto plano intacto.

## Risks / Trade-offs

- [Un procedure futuro escribe sus propias claves en `USER_SESSION` y se usa sin `conexionExclusiva`] → `npm run validar-funciones` lo advierte. El README explica cuándo usar la opción.
- [Quitar todo el marcado puede borrar un texto legítimo que contenga algo como `<algo>`] → Ese parámetro se marca `sanitizar: false`. El test de "texto común intacto" fija el criterio.
- [Un nombre de procedure o de parámetro mal escrito recién falla al invocar] → `npm run validar-funciones` lo detecta antes. El README pide correrlo al editar el archivo.
- [La caché de 60 segundos puede ejecutar un SSQL viejo justo después de editarlo en JK3] → `MCP_WEBSERVICE_CACHE_SEGUNDOS=0` lo resuelve en cada llamada, como la v1.
- [La migración puede cambiar sin querer el `tools/list` de tickets o prospección] → El test de captura compara byte a byte y se escribe antes de mover nada.

## Migration Plan

1. Capturar el `tools/list` actual de los dos catálogos (test de captura).
2. Introducir el archivo, el registro y los handlers. Migrar tickets y prospección a `compleja`, mover los textos y verificar la captura.
3. Agregar la sanitización, los tipos `procedure` y `webservice` y el handler `listar_catalogo`, migrar a él los catálogos de prospección, y agregar el catálogo `funciones/demo-functions.json`, y probarlo contra `SANTAROSA64_IA`.
4. Para volver atrás antes de archivar: revertir el commit. Las variables existentes (`MCP_CATALOGO=tickets|prospeccion`, `MCP_COD_USUARIO`, `MCP_COD_VENDEDOR`) siguen valiendo, así que las instalaciones de Claude Desktop no cambian.

## Open Questions

- Si `node-firebird` devuelve la fila de salida en `EXECUTE PROCEDURE` (D4). Se resuelve en la tarea 4.3 y no cambia el spec: en el peor caso, la tool responde `resultado` vacío.
