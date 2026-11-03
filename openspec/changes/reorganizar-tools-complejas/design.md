# Design

## Context

La motivación está en proposal.md. Estado de partida (después de `agregar-catalogo-funciones-json`):

- **Tools complejas:** se crean con funciones `crearX(deps)` que devuelven una `DefinicionSinTextos`.
  - Tickets: un archivo por tool en `src/catalogos/tickets/`.
  - Prospección: agrupadas en `src/catalogos/prospeccion/consultas.ts` (5), `registro.ts` (3) y `sesion.ts` (`user_info`).
  - Comunes: `user_info` y `obtener_instrucciones` en `src/funciones/handlers-comunes.ts`.
- **Registro manual:** `tickets/handlers.ts` y `prospeccion/handlers.ts` mapean `"<catalogo>.<tool>"` → `{ crear }`, y `src/catalogos/index.ts` los junta en `REGISTRO`. `construirCatalogo(archivo, ruta, registro, deps)` busca cada handler en ese registro.
- **Compartido, por catálogo:** `tickets/sp.ts`, `esquemas.ts`, `filtros-tickets.ts` y `mapeo-comun.ts`; `prospeccion/comun.ts` y `sp.ts`.
- **Agrupadora:** es una tool compleja con `"handler": "listar_catalogo"`. El motor genérico está en `src/funciones/listar-catalogo.ts`.
- **Red de seguridad:** `test/captura-contrato.test.ts` compara el `tools/list` y las respuestas de `listar_catalogo` con lo capturado antes de cualquier migración.

## Goals / Non-Goals

**Goals:**
- Que una tool compleja se agregue con su archivo y su entrada en el JSON, sin tocar ningún otro archivo de código.
- Una sola regla de ubicación: tools complejas en `src/catalogos/<handler>.ts`, compartido en `src/comunes/`, motor en `src/funciones/`.
- Cero cambios visibles.

**Non-Goals:**
- Recargar en caliente el código de una tool (los módulos ESM quedan cacheados: cambiar un `.ts` requiere build y reinicio).
- Mover la infraestructura (`auth/`, `db/`, `busqueda/`, `mapeo/`, `nucleo/`, `funciones/`). `src/comunes/` es para lo que comparten las tools complejas, no para el motor.

## Decisions

### D1. Ubicación de cada archivo

| Hoy | Después |
|---|---|
| `catalogos/tickets/obtener-contexto-ticket.ts`, `listar-tickets.ts`, `listar-tareas.ts`, `resumir-tickets.ts` (+ tests) | `catalogos/` con el mismo nombre (+ tests) |
| `catalogos/prospeccion/consultas.ts` | `catalogos/resumen-prospeccion.ts`, `totales-resultado-prospeccion.ts`, `buscar-prospectos-vendedor.ts`, `agendas-prospectos-vendedor.ts`, `historial-mensajes-prospecto.ts` |
| `catalogos/prospeccion/registro.ts` | `catalogos/registrar-gestion-prospecto.ts`, `registrar-prospecto.ts`, `modificar-prospecto.ts`; lo común a las tres (campos, armado de datos, ejecución con `SALIDA`) en `comunes/registro-prospeccion.ts` |
| `catalogos/prospeccion/sesion.ts` | `catalogos/user-info-vendedor.ts` |
| `funciones/handlers-comunes.ts` | `catalogos/user-info.ts` y `catalogos/obtener-instrucciones.ts` |
| `funciones/listar-catalogo.ts` | `funciones/agrupadora.ts` (motor, no handler) |
| `catalogos/tickets/sp.ts` (+ test), `esquemas.ts`, `filtros-tickets.ts`, `mapeo-comun.ts` | `comunes/sp-tickets.ts` (+ test), `esquemas-tickets.ts`, `filtros-tickets.ts`, `mapeo-tickets.ts` |
| `catalogos/tickets/handlers.ts` → `completarSesionTickets` | `comunes/completar-sesion-tickets.ts` |
| `catalogos/prospeccion/comun.ts`, `sp.ts` | `comunes/campos-prospeccion.ts`, `comunes/sp-prospeccion.ts` |
| `catalogos/index.ts` (`REGISTRO`), `tickets/handlers.ts`, `prospeccion/handlers.ts`, `tickets/index.ts`, `prospeccion/index.ts` | se eliminan; `cargarCatalogo` y `rutaCatalogo` pasan a `funciones/catalogo.ts` |

- **Corrección del usuario (2026-11-03): carpeta por MCP.** La tabla de arriba es la primera versión, que dejó todas las tools sueltas en `src/catalogos/` y lo compartido en `src/comunes/`. La ubicación final es:
  - `src/catalogos/tickets/` (4 tools) y `tickets/comunes/` (`sp-tickets`, `esquemas-tickets`, `filtros-tickets`, `mapeo-tickets`, `completar-sesion-tickets`);
  - `src/catalogos/prospeccion/` (9 tools, con `user-info-vendedor`) y `prospeccion/comunes/` (`campos-prospeccion`, `sp-prospeccion`, `registro-prospeccion`);
  - `src/catalogos/compartidas/` (`user-info`, `obtener-instrucciones`); lo que compartan varios MCP iría en `compartidas/comunes/`;
  - `src/comunes/` deja de existir. Los archivos conservan su nombre (con el sufijo del MCP), así el `completarSesion` de los JSON no cambia.
- El handler se llama igual que la tool, en kebab-case (`listar_tickets` → `listar-tickets`), salvo `user-info-vendedor`. Así, buscar un nombre de tool lleva al archivo.

### D2. Contrato de un archivo de `src/catalogos/`

```ts
// src/catalogos/registrar-prospecto.ts
export const handler: HandlerCompleja = { crear: ({ deps }) => ({ inputSchema, outputSchema, annotations, entrada, ejecutar }) };
```

- `handler` es el único export que usa el cargador. El archivo MAY exportar además tipos o la función `crear…` para sus tests.
- `HandlerCompleja` no cambia (`crear(contexto)`, `requiereInstrucciones?`). Sale el flag `agrupa`, porque la agrupadora deja de ser un handler.

### D3. Carga automática
- `funciones/handlers.ts` exporta `resolverHandlers(archivo): Promise<RegistroHandlers>`:
  - Junta los `handler` de las tools `compleja` y el `servidor.completarSesion`.
  - Valida cada nombre con `^[a-z0-9]+(-[a-z0-9]+)*$`.
  - El MCP sale del nombre del archivo de funciones (`mcpDeArchivo`: `tickets-functions.json` → `tickets`; sin esa forma, ninguno).
  - Busca el handler en `catalogos/<mcp>/` y después en `catalogos/compartidas/`; `completarSesion`, en `<mcp>/comunes/` y `compartidas/comunes/`. Si no está en ninguna, el error nombra las dos rutas; si está en las dos, falla por ambiguo.
  - Verifica con `existsSync` (así el error lleva la ruta, no un mensaje de Node) y hace `import(pathToFileURL(ruta).href)`.
  - Verifica que el módulo exporte `handler` con `crear`, o `completarSesion` como función.
- `EXT` es `.ts` si el cargador corre desde fuente (tsx, vitest) y `.js` si corre desde `dist/`. Se decide con `import.meta.url.endsWith('.ts')`. Que `import()` de un `.ts` por URL funcione en tsx y vitest queda A CONFIRMAR en la tarea 2.1 (vitest seguro; tsx resuelve `.ts` por ruta absoluta).
- **`construirCatalogo` sigue siendo síncrono y puro:** recibe el `RegistroHandlers` ya resuelto. Lo asíncrono queda en `cargarCatalogo(ruta, deps)`, que lee, resuelve y construye. Las validaciones y los tests de construcción actuales no cambian.
- **Recarga en caliente:** `crearRegistroTools` pasa a ser asíncrono y `recargar()` devuelve una `Promise<boolean>`. Un `import()` de un módulo ya cargado sale del caché, así que recargar el JSON es barato, y un handler recién compilado se toma recién al reiniciar.
- Alternativa descartada, el registro manual: obliga a tocar dos archivos más por tool, carga el código de todas las tools aunque el MCP no las use y genera conflictos en un archivo central. Su ventaja (el compilador detecta un import mal escrito) se cubre con los tests de D5.

### D4. Tipo agrupadora
- `esquema.ts` agrega `"tipo": "agrupadora"` (`nombre`, `titulo?`, `descripcion`, `parametros?` de texto) a la unión discriminada, y saca `handler` de esa variante.
- `cargar.ts` construye las agrupadoras con `funciones/agrupadora.ts` y valida que `grupo` apunte a una agrupadora y que cada agrupadora tenga variantes. Los mensajes de error actuales se mantienen.
- `funciones/*.json`: `listar_catalogo` pasa de `"tipo": "compleja", "handler": "listar_catalogo"` a `"tipo": "agrupadora"`.

### D5. Convención verificada
`test/convencion-catalogos.test.ts`:
1. Para cada `funciones/*-functions.json`, `resolverHandlers` (con su MCP) no falla.
2. Cada `src/catalogos/<carpeta>/*.ts` que no es `.test.ts` exporta `handler` con `crear`.
3. Cada tool de `<mcp>/` la usa ese MCP, y cada una de `compartidas/` algún MCP. Una sin usar falla, con su carpeta y nombre.
4. `src/catalogos/` solo tiene carpetas, y cada carpeta que no es `compartidas` tiene su `<mcp>-functions.json`.

`validar-funciones` llama a `resolverHandlers` antes de ir a la base, e informa cada handler que no resuelve como `ERROR`.

### D6. Tests y helpers
- Los tests de cada tool se mueven junto a su archivo. `consultas.test.ts` y `registro.test.ts` se parten por tool:
  - Los datos simulados y el `invocar` compartidos van a `test/datos/prospeccion-consultas.ts` y `test/datos/prospeccion-registro.ts`.
  - Los tests que cruzan tools (ningún `inputSchema` pide el vendedor, annotations) van a `test/prospeccion-consultas.test.ts` y `test/prospeccion-registro.test.ts`.
  - El de la firma de `MM_PROC_SET_PROSPECCION_MOVILB2` va a `src/comunes/sp-prospeccion.test.ts`.
- El test de `listar_catalogo` de prospección (`catalogos.test.ts`) pasa a `test/listar-catalogo-prospeccion.test.ts`, porque ya no es de un archivo de `catalogos/`.
- Se borra `scripts/capturar-contrato.ts`, el script de un solo uso que generó la captura: correrlo ahora pisaría la línea base con la salida del código nuevo.
- `toolsDe` y `toolDe` de `test/apoyo.ts` pasan a ser asíncronos, y `catalogoDePrueba` (`test/funciones-apoyo.ts`) resuelve los handlers del archivo de prueba con `resolverHandlers`.
- Los tests de integración y `scripts/agente/base.ts`, que importaban `crearTools`, pasan a `toolsDe('tickets', …)`.

## Risks / Trade-offs

- [Un nombre de handler mal escrito recién falla al cargar, no al compilar] → los tests de D5 lo detectan en cualquier corrida de `npm test`, y `validar-funciones` también.
- [Un `import()` armado con un texto del JSON podría cargar cualquier módulo] → regex de nombre más ruta forzada dentro de `catalogos/` o `comunes/`, validadas antes de importar.
- [El editor no sigue el vínculo JSON → archivo] → el handler se llama igual que la tool, así que buscar el nombre lo encuentra.
- [No se puede empaquetar en un solo archivo] → hoy no se empaqueta (`tsc` archivo por archivo). Si algún día hiciera falta, se puede generar un índice de handlers en el build.
- [Partir `consultas.ts` y `registro.ts` puede cambiar algo sin querer] → la captura de `tools/list` y de las respuestas, más los tests de cada tool, que se mueven sin cambiar sus aserciones.

## Migration Plan

1. Correr la captura en verde.
2. Crear `src/comunes/` y mover lo compartido, con los imports ajustados.
3. Partir y mover las tools a `src/catalogos/`, cada una con `export const handler`.
4. Escribir el cargador automático y el tipo agrupadora, y eliminar los registros manuales.
5. Actualizar los tres JSON y `functions.schema.json`.
6. Mover y adaptar los tests, y escribir los de la convención.

En cada paso, la captura tiene que seguir en verde. Para volver atrás, se revierte el commit: los JSON viejos no son compatibles con el cargador nuevo, por el nombre de los handlers.
