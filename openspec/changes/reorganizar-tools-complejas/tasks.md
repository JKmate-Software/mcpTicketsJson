## 1. Lo compartido en src/comunes

- [x] 1.1 Correr `test/captura-contrato.test.ts` en verde como punto de partida.
- [x] 1.2 Crear `src/comunes/` y mover lo compartido según D1: `sp-tickets.ts` (+ test), `esquemas-tickets.ts`, `filtros-tickets.ts`, `mapeo-tickets.ts`, `campos-prospeccion.ts`, `sp-prospeccion.ts`, y `completar-sesion-tickets.ts`, que exporta `completarSesion`. Ajustar los imports. La captura sigue en verde.

## 2. Un archivo por tool compleja

- [x] 2.1 Mover las 4 tools de tickets a `src/catalogos/<handler>.ts` con `export const handler`. Confirmar que `import()` de un `.ts` por ruta funciona en vitest y en tsx (D3).
- [x] 2.2 Partir `consultas.ts` en las 5 tools de consulta de prospección y `registro.ts` en las 3 de registro. Lo común de las escrituras va a `comunes/registro-prospeccion.ts`.
- [x] 2.3 `user-info-vendedor.ts` (desde `prospeccion/sesion.ts`), y `user-info.ts` y `obtener-instrucciones.ts` (desde `funciones/handlers-comunes.ts`).
- [x] 2.4 Mover `funciones/listar-catalogo.ts` a `funciones/agrupadora.ts` como motor (sin `HandlerCompleja` ni flag `agrupa`).

## 3. Carga automática y tipo agrupadora

- [x] 3.1 `funciones/handlers.ts` con `resolverHandlers`: regex de nombre, ruta forzada, `existsSync`, `import()` y verificación del export. Tests de nombre inseguro, inexistente y sin export.
- [x] 3.2 `"tipo": "agrupadora"` en `esquema.ts`, construcción y validaciones en `cargar.ts` (`grupo` → agrupadora, agrupadora sin variantes, agrupadora con `handler`). Regenerar `functions.schema.json`.
- [x] 3.3 `cargarCatalogo` asíncrono en `funciones/catalogo.ts`; `crearRegistroTools` y `recargar` asíncronos; `src/index.ts` y `scripts/validar-funciones.ts` adaptados. Eliminar `catalogos/index.ts`, los `handlers.ts` y los `index.ts` de cada catálogo, y `funciones/handlers-comunes.ts`.
- [x] 3.4 Actualizar `funciones/tickets-functions.json`, `prospeccion-functions.json` y `demo-functions.json` (nombres de handler, `listar_catalogo` como agrupadora, `completarSesion`).

## 4. Tests

- [x] 4.1 Mover los tests de cada tool junto a su archivo, partiendo `consultas.test.ts` y `registro.test.ts`. Datos compartidos en `test/datos/prospeccion.ts`, y `catalogos.test.ts` → `test/listar-catalogo-prospeccion.test.ts`.
- [x] 4.2 `toolsDe`, `toolDe` y `catalogoDePrueba` asíncronos; tests de integración y `scripts/agente/base.ts` sin `crearTools`.
- [x] 4.3 `test/convencion-catalogos.test.ts` (D5) y `validar-funciones` informando los handlers que no resuelven.
- [x] 4.4 Captura de `tools/list` y de respuestas en verde, sin regenerar los archivos de `test/datos/`.

## 5. Cierre

- [x] 5.1 README: secciones "Archivo de funciones" (tipo `agrupadora`, nombres de handler) y "Estructura", y la convención "dónde va cada cosa" con los pasos para agregar una tool compleja.
- [x] 5.2 Lint, typecheck, tests, build, prueba de humo por stdio desde `dist/` (tickets, prospección y demo) y `openspec validate reorganizar-tools-complejas --strict`.
- [ ] 5.3 Antes de archivar: archivar primero `agregar-catalogo-funciones-json` y convertir en MODIFIED de `tools-compleja` y `listar-catalogo` los requisitos que este change reemplaza.
