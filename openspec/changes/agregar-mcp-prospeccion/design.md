# Design

## Context

- **Lo que ya sirve para varios MCP:** `crearServidorMcp(tools[], deps)` recibe una lista cualquiera de `DefinicionTool`. `ejecutarTool` (validación zod, errores uniformes, log por invocación), `errores.ts`, `logger.ts` y `AccesoDatos.ejecutarSp` son genéricos.
- **Lo que está atado a tickets:**
  - `NOMBRE_SERVIDOR` es fijo (`mcp-tickets-json`).
  - `index.ts` siempre registra `crearTools()` de tickets.
  - `Sesion` solo tiene `codUsuario`/`codDesarrollador`.
  - `src/db/sp.ts` mezcla `aplicarContrato` (genérico) con funciones de tickets.
  - `src/tools/` mezcla el núcleo con las tools de tickets.
  - Por eso hoy no hay forma de publicar otro MCP sin tocar el arranque.
- **Fuente de la migración:** `mcp-server/src/McpTicketsServer/prospeccion-functions.json` y `prospeccion-instructions.md` de la v1, más el comportamiento de `GrupoCatalogo.cs` y `Busqueda/*.cs` (SimilitudTexto, BusquedaPostProceso, CatalogoCache).
- **Base:** `SANTAROSA64_IA` (10.0.0.32), base de pruebas. `CREAR_JK3` es producción y no se usa.
- Depende del change `agregar-inicio-sesion-oauth` (transporte HTTP, middleware Bearer con claim requerida por parámetro).

## Goals / Non-Goals

**Goals:**
- Hacer que el proyecto aloje N catálogos con un refactor chico, sin cambiar el comportamiento de tickets.
- Migrar prospección completo, incluidas las escrituras, como banco de pruebas real del login.
- Respetar el contrato del proyecto (JSON tipado, camelCase, `outputSchema`, annotations, errores uniformes).

**Non-Goals:**
- No se construye un intérprete genérico de `functions.json`: es una decisión vigente del proyecto, y cada tool se escribe a mano. Cómo sacar descripciones y metadatos a JSON se explora en otro change.
- Sin medición v1/v2 para prospección.
- Sin publicar varios catálogos en el mismo proceso (una instalación = un catálogo, como la v1).
- No se migran los otros catálogos de la v1 (prenecesidad, previsión, documentación).

## Decisions

### D1. Estructura por catálogos
```
src/nucleo/            definicion.ts, ejecutar.ts, servidor-mcp.ts (genéricos, movidos desde src/tools y src/)
src/catalogos/tipos.ts DefinicionCatalogo { nombre, nombreServidor, claimRequerida, crearTools(deps), instrucciones? }
src/catalogos/index.ts registro: { tickets, prospeccion } → elegido por MCP_CATALOGO
src/catalogos/tickets/      tools, filtros y sp.ts de tickets (movidos, sin cambios de lógica)
src/catalogos/prospeccion/  tools, sp.ts, instrucciones.md
src/busqueda/          similitud.ts, cache.ts (genéricos, sirven a cualquier catálogo)
```
- `crearServidorMcp(catalogo, tools, deps)` toma `name` de `catalogo.nombreServidor`. La versión sale de `package.json`.
- **Por qué mover a `src/nucleo/` y `src/catalogos/tickets/`:** deja claro qué es compartido y qué no. Los tests de tickets se mueven con su código y deben seguir pasando sin cambios de aserciones.
- **Alternativa:** dejar tickets en `src/tools/` y sumar `src/prospeccion/`. Es menos movimiento, pero deja el núcleo mezclado con un catálogo y confunde al sumar el tercero.

### D2. Sesión ampliada
`Sesion { codUsuario: number | null; codDesarrollador: number | null; codVendedor: number | null; transporte: 'stdio' | 'http' }`.
- `codUsuario` pasa a admitir `null`. En tickets nunca es `null`: lo garantizan el 403 y la validación de stdio. Las tools de tickets lo leen con un helper `usuarioRequerido(sesion)` que tira `ERROR_INTERNO` si fuera `null`, una red de seguridad que no debería dispararse.
- Stdio: `tickets` exige `MCP_COD_USUARIO`; `prospeccion` exige `MCP_COD_VENDEDOR` y toma `MCP_COD_USUARIO` si está. Validación condicional en `config.ts` por `MCP_CATALOGO` × `MCP_TRANSPORTE`.

### D3. Procedures de cada tool (verificados en `SANTAROSA64_IA`, 2026-10-29)
Se llaman **directo**, sin pasar por `METODOS_WEBSERVICES`, con el mismo SQL que el `SSQL` registrado en la v1:

| Tool | Procedure | Entrada desde sesión |
|---|---|---|
| `resumen_prospeccion` | `PROC_MCP_RESUMEN_PROSPECCION(vend, usu, fecha)` | vendedor, usuario |
| `totales_resultado_prospeccion` | `PROC_GET_EST_PROSP_X_REC(vend, usu, fecha, intervalo)` | vendedor, usuario |
| `buscar_prospectos_vendedor` | `PROC_MCP_BUSCAR_PROSPECTOS(vend, campania, fechaAgenda, filtroFecha, cliente, barrio, archivado, accion, maxFilas)` | vendedor |
| `agendas_prospectos_vendedor` | `PROC_AGENDA_PROSPECTOS(vend, desde, hasta)` | vendedor |
| `historial_mensajes_prospecto` | `PROC_GET_MENSAJES_X_CLIENTEP(cliente, prospecto)` | — |
| `registrar_gestion_prospecto` / `registrar_prospecto` / `modificar_prospecto` | `MM_PROC_SET_PROSPECCION_MOVILB2` (35 entradas; salida `COD_PROSPECTACION_MOVIL, SALIDA, MENSAJE_SALIDA`) | usuario, vendedor |
| `listar_catalogo` grupos | `PROC_GET_GRUPOS_PROSP_X_VEND(vend)` | vendedor |
| canales | `PROC_GET_ENTIDADES_X_MCCATEG('PROSPECCIO')` | — |
| categorias | `PROC_GET_CAT_MENS_ENC_PROSP(0, codPadre)` | — |
| resultados | `PROC_GET_RESULTADOS_RECL_X_CAT(codPadre)` | — |
| acciones | `PROC_GET_CAT_MENSAJES_PROSP(1)` | — |
| campanias | `PROC_GET_CAMPANIAS ORDER BY FECHA_FIN DESC` | — |
| localidades | `PROC_GET_LOCALIDADES` | — |
| barrios | `PROC_GET_BARRIOS ORDER BY NOMBRE` | — |

- Los procedures sin parámetros se invocan **sin `()`** (`SELECT * FROM PROC_GET_LOCALIDADES`). Firebird rechaza los paréntesis vacíos.
- Ninguno de estos procedures usa `RDB$GET_CONTEXT` (verificado), así que no hace falta cargar las claims como contexto de sesión, a diferencia de la v1.
- Las tres escrituras usan el mismo procedure, como en la v1. `modificar_prospecto` manda `NULL` en categoría, resultado, comercializadora, grupo y agenda, y el procedure entra en su rama "solo datos del prospecto". `COD_CLIENTE_SQLITE`, `COD_RECLAMO_SQLITE`, `GEO_X/Y`, `APELLIDO_MATERNO` y `CUIT` van en `NULL`, igual que la v1, que no los expone.
- **`SALIDA`: `0` = éxito, `-1` = rechazo** (verificado leyendo el procedure completo en `SANTAROSA64_IA`, tarea 3.1). El rechazo sale como error `OPERACION_RECHAZADA` con `MENSAJE_SALIDA` (código nuevo en `CODIGOS_ERROR`). Como el procedure puede devolver `-1` después de haber insertado (cuando falla `PROC_SET_MENSAJE_RECLAMO_MOVIL`), las escrituras corren en una transacción de lectura-escritura propia y **un rechazo hace rollback**: nunca quedan datos a medias. Con `modificar_prospecto`, `COD_PROSPECTACION_MOVIL` vuelve `NULL` y `MENSAJE_SALIDA` = "Datos del prospecto actualizados".
- Los parámetros `TIMESTAMP` (`FECHA_HORA`, `FECHA_HORA_AGENDA`, `FECHA_NACIMIENTO`) y `DATE` (`FECHA_CIERRE_POSIBLE`) se reciben en ISO 8601 y se pasan como texto `AAAA-MM-DD HH:MM:SS` en la hora de la base (`ZONA_HORARIA_BASE`). Si traen offset, se convierten a esa zona. `MONTO_COTIZACION` es `INTEGER` en el procedure: se redondea.
- Las proyecciones de salida son las `salida` de la v1, en camelCase y con tipos: booleanos reales (`ARCHIVADO`, `EXIGE_AGENDAMIENTO`), fechas ISO con offset y enteros. Cada tool documenta su `outputSchema` en el código y lo valida un test de contrato.

### D4. `listar_catalogo` sin intérprete
Las 8 variantes se escriben como una tabla tipada en `src/catalogos/prospeccion/catalogos.ts`: procedure, mapeo a `{ codigo, nombre, ...extras }`, padre (requerido u opcional), búsqueda (campos, alcance de caché) y texto de `uso`. La descripción de la tool se **genera** desde esa tabla, igual que la v1, así no se desincroniza.
- **Alternativa:** una tool por catálogo, que serían 8 tools más. Se descarta: va contra "pocas tools compuestas" y la v1 ya mostró que la agrupada funciona.

### D5. Búsqueda aproximada
Se porta `SimilitudTexto.cs` a `src/busqueda/similitud.ts` con los mismos pasos: normalización (minúsculas, sin tildes) y reglas fonéticas (b/v, s/z/c, ll/y, h muda), con puntaje combinado de distancia de edición y coincidencia de tokens sin importar el orden. Se mantienen los defaults de la v1: umbral 60, 10 resultados, máximo 50 sin `buscar` y caché de 60 minutos.
- Los tests se portan desde los casos de los tests de la v1 (`mcp-server/test/`), así ambos servidores puntúan igual.
- Caché: `Map` en memoria con vencimiento y tope de filas (`MCP_BUSQUEDA_CACHE_MAX_FILAS`, default 200.000). La clave es catálogo + parámetros + (vendedor si el alcance es por usuario). Un error no se cachea. Un acierto de caché no suma a `medidor.llamadasBase`.

### D6. Instrucciones
`src/catalogos/prospeccion/instrucciones.md` se adapta del texto de la v1 con los nombres de parámetros nuevos. Se copia a `dist/` en el build (script `postbuild`) y se lee al arrancar. No hay recarga en caliente: cambiar el texto requiere reiniciar. Cómo se gestiona este tipo de texto se revisa en el change de "descripciones en JSON".

### D7. Pruebas contra `SANTAROSA64_IA`
- Hacen falta un vendedor de prueba con teléfono (para `tlfvendedor`) y un usuario `alias/clave` con fila activa en `MCP_OAUTH_CREDENCIALES` y vendedor asociado. Los provee el usuario.
- Los tests de escritura crean registros reales y se marcan claramente: `MENSAJE` con el prefijo `[TEST MCP]` y prospectos con apellido `TEST-MCP`. No se borran desde el test: en la base no hay borrado expuesto y no se escribe DDL ni DML ad hoc. Quedan identificables para limpiarlos a mano si el usuario lo pide.
- Los tests unitarios usan acceso a datos simulado. Los de integración van en `npm run test:integracion` y se saltean si no hay `.env` de `SANTAROSA64_IA`.

## Risks / Trade-offs

- **[Refactor de carpetas rompe imports de scripts `medir*`]** → Moverlos con el refactor y verificar `npm run typecheck` y `npm test` antes de agregar prospección (grupo 1 de tareas, separado).
- **[Escrituras en la base de pruebas]** → Datos marcados (D7). Si el usuario no quiere escrituras automáticas, los tests de escritura quedan detrás de `PRUEBAS_ESCRITURA=1`.
- **[Diferencias de puntaje con la v1]** → Tests con los mismos casos que la v1. Si hay diferencias, gana la v1.
- **[Valor de éxito de `SALIDA` no confirmado]** → A CONFIRMAR en la tarea 3.1, antes de escribir la validación.
- **[Cambio de nombres de parámetros frente a la v1]** → El skill `usar-mcp-prospeccion` del workspace usa los nombres de la v1. Se documenta la tabla de equivalencias en el README del catálogo.

## Migration Plan

1. Refactor a catálogos con tickets intacto: ningún cambio visible con `MCP_CATALOGO` sin definir.
2. Agregar prospección.
3. Publicar prospección: `MCP_CATALOGO=prospeccion`, `MCP_TRANSPORTE=http`, `MCP_AUTH_*` del login elegido y la base `SANTAROSA64_IA`.
4. Rollback: quitar `MCP_CATALOGO`; vuelve a tickets.
