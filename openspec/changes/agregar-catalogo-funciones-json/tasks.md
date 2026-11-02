## 1. Red de seguridad y base

- [x] 1.1 Test de captura: guardar el `tools/list` actual de `tickets` y `prospeccion` en `test/datos/tools-list-<catalogo>.json` y compararlo byte a byte (D3). Debe pasar antes de tocar código.
- [x] 1.2 `Sesion.claims` con las 7 claves más `COD_CREDENCIAL_MCP` (D7): desde el token en `sesionDesdeClaims` y desde `MCP_COD_*` en stdio. Variables nuevas en `config.ts` (`MCP_COD_DESARROLLADOR`, `MCP_COD_PROVEEDOR`, `MCP_COD_CLIENTE`, `MCP_COD_EMPRESA`, `MCP_SECUENCIAL_EMPRESA`, `MCP_FUNCIONES_ARCHIVO`, `MCP_WEBSERVICE_CACHE_SEGUNDOS`), con `MCP_CATALOGO` libre.
- [x] 1.3 `AccesoDatos.enTransaccionConContexto` (D6, alternativa C): reescribir las 8 claves en una sentencia, con conexión del pool o exclusiva. Tests con el acceso simulado, incluido el de no fuga con un pool de una conexión.

## 2. Archivo de funciones y textos fuera del código

- [x] 2.1 `src/funciones/esquema.ts` (zod del archivo) y `funciones/functions.schema.json` generado, con un test que verifica que esté al día (D1).
- [x] 2.2 Carga y validaciones cruzadas: nombres únicos en snake_case, `campo*` y `busqueda` contra `parametros`, handlers existentes, descripciones completas de las `compleja`, `buscar` reservado y títulos generados. Un test por cada error de los specs.
- [x] 2.3 Registro de handlers (D2/D3): `HandlerCompleja`, los comunes `user_info` y `obtener_instrucciones`, y la inyección de las descripciones del archivo (también de propiedades anidadas) en el `inputSchema`.
- [x] 2.4 Convertir las tools de tickets y prospección en handlers (`tickets.*`, `prospeccion.*`, `tickets.completar_sesion`) sin cambiar su lógica.
- [x] 2.5 `scripts/extraer-textos.ts`: generar `funciones/tickets-functions.json` y `funciones/prospeccion-functions.json` con los textos actuales. Mover `instrucciones.md` a `funciones/prospeccion-instructions.md` y quitar el `postbuild`.
- [x] 2.6 `RegistroTools` y arranque desde el archivo: `index.ts`, `http.ts`, handshake con `serverInfo.name` e `instructions`, `claimRequerida` y la validación de la variable stdio requerida. Borrar del código los textos movidos y `DefinicionCatalogo`. El test 1.1 tiene que dar igual, y un test verifica que ninguna descripción publicada aparezca en `src/`.
- [x] 2.7 Recarga en caliente (D10) con debounce y conservación del catálogo anterior ante un error. Tests con un directorio temporal, incluido el de editar una descripción sin compilar.

## 3. Sanitización (D13)

- [x] 3.1 Agregar la dependencia `sanitize-html`. Sanitizador recursivo con detección de marcado, parseo de textos JSON, `sanitizar: false` y exención por categoría, aplicado en `src/nucleo/ejecutar.ts` a toda tool.
- [x] 3.2 Tests: `script`, `img onerror`, `javascript:`, JSON anidado en un objeto y en un texto, `Pérez & Hijos` y `monto < 500` intactos, y parámetro excluido.

## 4. Parámetros y tools `procedure`

- [x] 4.1 `resolverParametros` (D8): alias, default, valorFijo, tipo `json`, campos forzados y autocompletados, y `NO_AUTORIZADO` cuando la sesión no tiene el dato. Generar el zod y el `inputSchema` desde los parámetros visibles. Tests de la tabla de D8.
- [x] 4.2 Salida común: camelCase, `trimEnd` de CHAR, `salida` (proyección, renombre y tipos) con `ERROR_INTERNO` si falta una columna, `maxFilas` con `hayMas`, resumen con la cantidad de filas, y `outputSchema` genérico o tipado.
- [ ] 4.3 Tipo `procedure` (D4): metadata de `RDB$PROCEDURE_PARAMETERS` cacheada, parámetros verificados y SQL sin `()` cuando no hay entradas. Confirmar contra `SANTAROSA64_IA` si `EXECUTE PROCEDURE` devuelve la fila de salida.
- [x] 4.4 `escritura`, `destructiva`, annotations, `rechazo` con rollback, y excepción de usuario de Firebird como `OPERACION_RECHAZADA` (D9).
- [x] 4.5 `busqueda` sobre `src/busqueda/`: parámetro virtual `buscar`, caché por usuario o global, `similitud` y objeto `busqueda`.

## 5. Tools `webservice` y `listar_catalogo` genérico

- [x] 5.1 Lectura de la definición del método con `PROC_GET_METODO_WEBSERV_X_NOMB` y `PROC_GET_PARAMS_METODOS_WEBSERV`, con la caché de `MCP_WEBSERVICE_CACHE_SEGUNDOS` (D5).
- [x] 5.2 Verificación de los parámetros de la tool contra la definición, y conversión por tipo (mapeo de `DirectDbHelper`, booleanos 1/0 y `+` en fechas con `T`).
- [x] 5.3 Tokenizador de `@NOMBRE` que respeta literales, identificadores entre comillas y comentarios. Tests con parámetros repetidos, `@` dentro de un literal y nombres en otro caso.
- [x] 5.4 Ejecución de `DATASET_*` y `EXECUTE_*` dentro de `enTransaccionConContexto`, más el error por TIPO desconocido.
- [x] 5.5 Handler genérico `listar_catalogo` (D12): variantes ocultas, `inputSchema` con `catalogo`, `codPadre` y `buscar`, descripción generada, salida uniforme compuesta desde la `salida` de cada variante, `orden`, `outputSchema` generado, resolución con `avisos` y validaciones de carga. Tests portados de los casos de `GrupoCatalogo` de la v1.
- [x] 5.6 Migrar `listar_catalogo` de prospección: antes de tocarlo, capturar las respuestas de los 8 catálogos con la base simulada. Declarar las variantes de la tabla de D12 en `funciones/prospeccion-functions.json`, borrar `src/catalogos/prospeccion/catalogos.ts` y verificar la captura de respuestas y la de `tools/list` (con `outputSchema` equivalente).

## 6. Herramientas y documentación

- [x] 6.1 `npm run validar-funciones` (D11), con la advertencia por `USER_SESSION`.
- [x] 6.2 README: sección "Archivo de funciones" con los tres tipos, la tabla de opciones de parámetros, cómo agregar un catálogo a `listar_catalogo`, la equivalencia campo por campo con `functions.json` de la v1 (incluidos `CATALOGO`/`COD_PADRE`/`BUSCAR` → `catalogo`/`codPadre`/`buscar`) y cómo montar un MCP nuevo. Actualizar `docs/instalacion.md` y `.env.example` con las variables nuevas.
- [x] 6.3 Lint, typecheck, tests unitarios y `openspec validate agregar-catalogo-funciones-json --strict`.

## 7. Verificación contra SANTAROSA64_IA (nunca CREAR_JK3)

- [ ] 7.1 `funciones/demo-functions.json` con:
  - `user_info`.
  - `listar_catalogo` (handler genérico) con `barrios` y `localidades` (procedures sin parámetros, con búsqueda), y `categorias` y `resultados` (webservices `getCategoriasMensEncProsp` y `ws_crm_mostrar_resultado`, con padre).
  - `historial_mensajes` (webservice `ws_crm_mostrar_msj_x_cliente`).

  El contexto de sesión se verifica leyendo `RDB$GET_CONTEXT` directo en la transacción de la tool (test 7.2) y no con una tool propia: ningún procedure de `SANTAROSA64_IA` lee `USER_SESSION`, y crear uno es DDL que requiere confirmación.

  El archivo ya está escrito y carga. Falta que `npm run validar-funciones` (con `MCP_CATALOGO=demo`) termine sin errores contra la base.
- [ ] 7.2 Test de integración `test/integracion/funciones.test.ts`: validar-funciones de demo y prospección, contexto de sesión, ausencia de fuga en un pool de una conexión (solo `FIREBIRD_*`), y login real con las tools procedure, webservice y `listar_catalogo` (con `PROSPECCION_PRUEBA_*`). La sanitización está cubierta por los tests unitarios. El test ya está escrito; falta correrlo con la base.
- [ ] 7.3 Medir el costo de reescribir el contexto frente a una conexión exclusiva y anotarlo en el design (D6).
- [ ] 7.4 Prueba manual con Claude Code sobre el catálogo de demostración por HTTP, incluida la edición de una descripción en caliente.
- [ ] 7.5 Antes de archivar: archivar primero `agregar-mcp-prospeccion` y convertir en MODIFIED de `catalogos-servidor` el requisito "Selección del catálogo por archivo".
