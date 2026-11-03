# Proposal

## Why

Con el archivo de funciones (change `agregar-catalogo-funciones-json`), las tools `procedure`, `webservice` y la agrupadora ya se levantan solo desde el JSON, pero las `compleja` todavía no. Hoy su código está repartido de dos maneras: tickets tiene un archivo por tool y prospección las agrupa por tema (`consultas.ts` con 5 tools, `registro.ts` con 3). Para publicarlas hay que registrarlas a mano en un `handlers.ts` por MCP y en el `REGISTRO` central, y lo compartido no tiene un lugar fijo. Para sumar una tool compleja hay que saber en qué tres lugares tocar, y con la etapa 2 (MCP de previsión) y el de varios MCP por proceso esto se va a repetir.

Queremos que cada tipo se levante por la estructura: el JSON nombra la tool compleja, su código está en un archivo con ese nombre, y no hay registros que mantener.

## What Changes

- **Una carpeta por MCP y un archivo por tool compleja: `src/catalogos/<mcp>/<handler>.ts`**, donde `<mcp>` es el nombre de su `<mcp>-functions.json` (`tickets/`, `prospeccion/`). Las tools que sirven a cualquier MCP van en `src/catalogos/compartidas/`. Cada archivo exporta `handler` y tiene su test al lado (`<handler>.test.ts`). (Corrección del usuario, 2026-11-03: la primera versión las dejó todas sueltas en una carpeta plana.)
- **Carga automática desde el JSON:** al cargar un `functions.json`, por cada tool `"tipo": "compleja"` con `"handler": "registrar-prospecto"` se importa `src/catalogos/registrar-prospecto.ts`, se inicializa y se publica con los textos del archivo. Solo se carga el código que el JSON usa.
  - El nombre del handler MUST ser `[a-z0-9-]` y resolverse dentro de `src/catalogos/<mcp>/` o `src/catalogos/compartidas/`.
  - Un handler inexistente, o un archivo que no exporta `handler`, invalida el archivo de funciones con un error que lo nombra.
- **Se eliminan los registros manuales:** `src/catalogos/index.ts` (`REGISTRO`), `tickets/handlers.ts`, `prospeccion/handlers.ts`, los `index.ts` de cada catálogo y `src/funciones/handlers-comunes.ts`. **BREAKING** para el formato de los JSON: `"handler": "tickets.listar_tickets"` pasa a `"handler": "listar-tickets"`, y se actualizan los tres archivos del proyecto.
- **`user_info` y `obtener_instrucciones`** pasan a ser tools complejas como cualquier otra (`src/catalogos/user-info.ts` y `obtener-instrucciones.ts`). El `user_info` propio de prospección, que devuelve solo usuario y vendedor, pasa a `user-info-vendedor.ts` para no cambiar su respuesta.
- **Agrupadora como tipo propio:** `listar_catalogo` deja de ser `"tipo": "compleja"` con `"handler": "listar_catalogo"` y pasa a `"tipo": "agrupadora"`. El motor genérico sigue en `src/funciones/` y no cambia su comportamiento. Las variantes apuntan con `grupo` a una tool `agrupadora`.
- **Lo compartido de cada MCP en `src/catalogos/<mcp>/comunes/`:** procedures, esquemas, campos, mapeos y el `completarSesion` de tickets. `servidor.completarSesion` también se resuelve por archivo: `"completar-sesion-tickets"` → `src/catalogos/tickets/comunes/completar-sesion-tickets.ts`.
- **Tests que hacen cumplir la convención:**
  - todo `funciones/*.json` resuelve sus handlers;
  - todo `src/catalogos/<carpeta>/*.ts` que no es test exporta `handler`;
  - toda tool de `<mcp>/` la usa ese MCP, y toda tool de `compartidas/` algún MCP (sin código muerto);
  - toda carpeta de MCP tiene su archivo de funciones.
- **`npm run validar-funciones`** también informa los handlers que no resuelven.

## Capabilities

### New Capabilities
- `carga-tools-complejas`: ubicación, nombre y carga automática de las tools complejas desde el archivo de funciones, sus validaciones y la convención verificada por tests.
- `tool-agrupadora`: `"tipo": "agrupadora"` en el archivo de funciones como forma de declarar la tool genérica que agrupa variantes.

### Modified Capabilities
<!-- Los requisitos que este change reemplaza (handler `<catalogo>.<nombre>`, listar_catalogo como compleja con handler fijo) están en capacidades del change agregar-catalogo-funciones-json, todavía no archivado: no existen en openspec/specs/ y no se pueden declarar como MODIFIED. Ver Impact. -->

## Impact

- **Código:**
  - Se mueve o se parte: `src/catalogos/tickets/*`, `src/catalogos/prospeccion/*` y `src/funciones/handlers-comunes.ts`.
  - Se crean `src/catalogos/<mcp>/`, `<mcp>/comunes/` y `compartidas/`.
  - Cambia el loader (`src/funciones/cargar.ts`, `tipos.ts`, `registro-tools.ts`), que pasa a ser asíncrono por los `import()`.
  - Cambian el esquema del archivo (`esquema.ts` y `functions.schema.json`), los tres `funciones/*.json`, `src/index.ts` y `scripts/validar-funciones.ts`.
- **Tests:** se mueven junto a cada tool. Los helpers `toolDe`/`toolsDe` de `test/apoyo.ts` pasan a ser asíncronos, y cambian los tests que los usan y los de integración que importaban `crearTools`.
- **Comportamiento visible:** ninguno. El `tools/list` y las respuestas tienen que quedar idénticos, y lo verifica la captura de `test/captura-contrato.test.ts`.
- **Dependencia entre changes:** se apoya en `agregar-catalogo-funciones-json`. Al archivar, ese change va primero, y los requisitos de este que reemplazan a los de `tools-compleja` (cómo se nombra y registra un handler) y `listar-catalogo` (cómo se declara la agrupadora) se convierten en MODIFIED de esas capacidades. Va antes del change de varios MCP por proceso.
- **Fuera de alcance:** recargar en caliente el código de una tool compleja (cambiar un `.ts` sigue requiriendo `npm run build` y reiniciar) y empaquetar en un solo archivo (los `import()` por nombre lo impiden).
