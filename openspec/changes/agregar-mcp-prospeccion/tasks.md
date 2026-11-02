# Tasks

> Requiere `agregar-inicio-sesion-oauth` implementado. Toda prueba contra base usa `SANTAROSA64_IA`; nunca `CREAR_JK3` (producción).

## 1. Refactor a catálogos (tickets sin cambios visibles)

- [x] 1.1 Mover el núcleo genérico a `src/nucleo/` y tickets a `src/catalogos/tickets/` (D1), incluidos sus tests y los imports de `scripts/`; verificar `npm run typecheck`, `npm run lint` y `npm test` en verde sin cambiar aserciones
- [x] 1.2 Agregar `DefinicionCatalogo`, el registro y `MCP_CATALOGO` en `config.ts` (default `tickets`, error que lista los válidos); `serverInfo.name` desde el catálogo; tests de los escenarios de `catalogos-servidor` "Default tickets", "Catálogo desconocido" y "Nombre en el handshake"
- [x] 1.3 Ampliar `Sesion` (D2) y la validación de stdio por catálogo (`MCP_COD_VENDEDOR` en prospección); conectar `claimRequerida` del catálogo al middleware Bearer; tests: "Prospección por stdio sin vendedor" y "Token sin vendedor en prospección" (403 que nombra `COD_VENDEDOR`)

## 2. Búsqueda aproximada

- [x] 2.1 Portar `SimilitudTexto.cs` a `src/busqueda/similitud.ts` y los casos de `mcp-server/test/McpTicketsServer.Tests/SimilitudTextoTests.cs` a Vitest; verificar que todos dan el mismo puntaje que en la v1
- [x] 2.2 Implementar el filtrado (umbral, orden, tope, máximo sin búsqueda, mensaje) y la caché con vencimiento, alcance y tope de filas (D5); portar los casos de `BusquedaPostProcesoTests.cs` y agregar un test de "error no cacheado"

## 3. Catálogo de prospección: escrituras primero

- [x] 3.1 Leer el código completo de `MM_PROC_SET_PROSPECCION_MOVILB2` en `SANTAROSA64_IA` y fijar en design.md D3 el valor de éxito de `SALIDA` (quitar el "A CONFIRMAR")
- [x] 3.2 Agregar `OPERACION_RECHAZADA` a `CODIGOS_ERROR` e implementar el acceso a `MM_PROC_SET_PROSPECCION_MOVILB2` en `src/catalogos/prospeccion/sp.ts`, con los 35 parámetros en orden; unit test que verifica el orden y los `NULL` de las tres variantes
- [x] 3.3 Implementar `registrar_gestion_prospecto`, `registrar_prospecto` (contacto obligatorio) y `modificar_prospecto` (al menos un dato) con annotations de escritura; unit tests de cada escenario de `prospeccion-registro` con acceso simulado

## 4. Catálogo de prospección: consultas y catálogos

- [x] 4.1 Implementar `resumen_prospeccion`, `totales_resultado_prospeccion`, `buscar_prospectos_vendedor` (con `hayMas`), `agendas_prospectos_vendedor` e `historial_mensajes_prospecto` (D3); unit tests de cada escenario de `prospeccion-consultas`
- [x] 4.2 Implementar `listar_catalogo` con la tabla de variantes (D4), descripción generada, `codPadre` y `buscar`; tests de cada escenario de `catalogos-referencia` con acceso simulado
- [x] 4.3 Implementar `user_info` y `obtener_instrucciones`, adaptar `instrucciones.md` a los nombres nuevos y copiarlo a `dist/` en `postbuild`; tests de los escenarios de `sesion-instrucciones` (incluido "sin nombres de la v1" y el handshake sin `instructions`)
- [x] 4.4 Test de contrato del catálogo: toda tool valida su `structuredContent` contra su `outputSchema`, campos camelCase, sin `COLOR`, y las annotations correctas (lectura y escritura)

## 5. Integración contra SANTAROSA64_IA y documentación

- [ ] 5.1 Conseguir del usuario las credenciales de prueba (vendedor con teléfono para `tlfvendedor` y usuario `alias/clave` con vendedor asociado) y cargarlas en `.env` local (no versionado)
- [ ] 5.2 Tests de integración de lectura (`test/integracion/prospeccion.test.ts`): login `tlfvendedor` sin clave por `/token` → `resumen_prospeccion`, `buscar_prospectos_vendedor`, `listar_catalogo` barrios con `buscar` (y que la segunda búsqueda no vaya a la base) y "Dos vendedores, misma instancia" si hay dos vendedores de prueba
- [ ] 5.3 Tests de integración de escritura detrás de `PRUEBAS_ESCRITURA=1`: alta `TEST-MCP` → gestión con `[TEST MCP]` → modificación de email → verificación con `buscar_prospectos_vendedor` y `historial_mensajes_prospecto`; dejar anotados en este archivo los `codProspecto` creados
- [ ] 5.4 Prueba manual con Claude Code (`claude mcp add --transport http prospeccion-v2 http://localhost:<puerto>/mcp`): página de login con títulos de `MCP_AUTH_*`, autorizar, `obtener_instrucciones` y un flujo de consulta y registro; anotar el resultado acá
- [x] 5.5 Documentar en `README.md` y `docs/instalacion.md` los catálogos, `MCP_CATALOGO` y `MCP_COD_VENDEDOR`, con la tabla de equivalencias de parámetros v1 → v2 de prospección; actualizar `.env.example`; verificar que los comandos documentados corren tal cual

## Workflow follow-up

- Archivar con `/opsx:archive` después de `agregar-inicio-sesion-oauth`.
- Si se adopta este servidor para prospección, actualizar el skill `usar-mcp-prospeccion` del workspace con los nombres de parámetros nuevos (es un change del workspace raíz, no de este repo).
