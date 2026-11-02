# Proposal

## Why

El inicio de sesión OAuth (change `agregar-inicio-sesion-oauth`) necesita una prueba de punta a punta con tools reales. No se puede hacer contra la base de tickets: `CREAR_JK3` es producción y `SANTAROSA64_IA`, la base de pruebas, no tiene los SP de tickets. En cambio, `SANTAROSA64_IA` sí tiene el CRM de prospección completo. Migrar a este proyecto el MCP de prospección de la v1 (`mcp-server/`, catálogo `prospeccion-functions.json`) sirve de banco de pruebas del login, en particular de un login sin clave (`tlfvendedor`). También demuestra que el proyecto puede alojar más de un MCP, igual que la v1 publica varios catálogos con el mismo ejecutable.

## What Changes

- **Varios MCP en el mismo proyecto:** el servidor pasa a tener *catálogos* (`tickets`, `prospeccion`), elegidos por `MCP_CATALOGO` (default `tickets`, sin cambios para quien lo usa hoy). Cada catálogo aporta su nombre de servidor, sus tools, sus instrucciones y la claim de identidad que exige.
- **La sesión suma el vendedor:** `codVendedor`, que sale de la claim `COD_VENDEDOR` del token en HTTP y de `MCP_COD_VENDEDOR` en stdio.
- **Catálogo `prospeccion`**: las 11 tools de la v1, escritas a mano con el contrato de este proyecto (JSON tipado, `outputSchema`, camelCase, annotations, errores uniformes). Los nombres de tool se mantienen iguales a la v1.
  - Consultas: `resumen_prospeccion`, `totales_resultado_prospeccion`, `buscar_prospectos_vendedor`, `agendas_prospectos_vendedor` e `historial_mensajes_prospecto`.
  - Registro (escritura): `registrar_gestion_prospecto`, `registrar_prospecto` y `modificar_prospecto`.
  - Catálogos de referencia: `listar_catalogo`, con 8 catálogos (grupos, canales, categorías, resultados, acciones, campañas, localidades, barrios), código padre y búsqueda aproximada `buscar` con puntaje de similitud.
  - Sesión e instrucciones: `user_info` y `obtener_instrucciones`, con el texto de uso de la v1.
- **Ninguna tool recibe el vendedor ni el usuario como parámetro:** salen de la sesión, igual que en la v1.
- **BREAKING (solo frente a la v1):** los parámetros de entrada pasan de `COD_VENDEDOR_IN`/`MAX_FILAS_IN` a camelCase (`maxFilas`, `codCampania`…) y las respuestas a campos camelCase tipados. Hay que actualizar el skill `usar-mcp-prospeccion` si se usa contra este servidor.

## Capabilities

### New Capabilities
- `catalogos-servidor`: alojar varios MCP en un mismo proyecto. Cubre la selección por configuración, qué aporta cada catálogo (nombre, tools, instrucciones, identidad requerida) y la identidad del vendedor en stdio.
- `prospeccion-consultas`: las tools de lectura de la cartera del vendedor de la sesión (resumen, totales, búsqueda, agenda, historial).
- `prospeccion-registro`: alta de prospecto, registro de gestión y modificación de datos del prospecto, con sus validaciones previas.
- `catalogos-referencia`: `listar_catalogo` con variantes, código padre, proyección de columnas y búsqueda aproximada con caché.
- `sesion-instrucciones`: `user_info` y `obtener_instrucciones` del catálogo de prospección.

### Modified Capabilities
_Ninguna._ El contrato transversal (`contrato-tools`) y el login (`autenticacion-oauth`, aún en su change) se cumplen sin cambiar requisitos. La identidad por vendedor y la anotación de las tools de escritura quedan en las capabilities nuevas.

## Impact

- **Depende de** `agregar-inicio-sesion-oauth`, que se implementa primero.
- **Código:** `src/index.ts` y `src/servidor-mcp.ts` (catálogo activo), `src/auth/sesion.ts` (`codVendedor`), los módulos nuevos `src/catalogos/tickets/` (mueve los actuales) y `src/catalogos/prospeccion/`, y la búsqueda aproximada en `src/busqueda/`.
- **Base de datos:** sin DDL. Se usan 14 procedures ya existentes, verificados el 2026-10-29 en `SANTAROSA64_IA`. `CREAR_JK3` no se usa (producción).
- **Datos de prueba:** las pruebas de escritura crean prospectos y gestiones reales en `SANTAROSA64_IA` (base de pruebas), con un vendedor de prueba que indica el usuario.
- **Medición:** este catálogo no se mide contra la v1 en este change. Los scripts `medir*` siguen apuntando a tickets.
