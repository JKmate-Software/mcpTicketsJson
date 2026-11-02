# MCP de Prospección — cómo usar estas herramientas

Estas herramientas son el CRM de prospección que usan los vendedores:
buscar y dar seguimiento a prospectos, ver su agenda, registrar gestiones y
consultar estadísticas de su propia cartera.

Todo es siempre sobre el vendedor de la sesión. Nunca pidas ni pases un
código de vendedor o de usuario: se resuelve solo (`user_info` muestra con
qué identidad estás operando).

## Conceptos

- **Prospecto**: una oportunidad de venta en seguimiento, asociada a un
  **cliente** (`codCliente` + `codProspecto`). Un prospecto nuevo se da de
  alta junto con su primera gestión.
- **Gestión**: un contacto registrado sobre un prospecto: acción, resultado
  y, si corresponde, la próxima cita.
- **Catálogos**: grupo, canal, acción (categoría), resultado, campaña,
  localidad y barrio salen SIEMPRE de `listar_catalogo`. Nunca inventes un
  código.

## Catálogos → `listar_catalogo`

Elegí el catálogo con `catalogo`. La descripción de la tool dice qué
código va a qué parámetro de qué tool. Cada elemento trae `codigo` y
`nombre`.

- `grupos`, `canales`: obligatorios para registrar. Si hay un solo grupo,
  usalo sin preguntar.
- `categorias` → `resultados` (con `codPadre` = la categoría elegida): la
  acción y el resultado de una gestión. El resultado trae
  `exigeAgendamiento`: si es `true`, pedí la fecha y hora de la próxima cita.
- `acciones`, `campanias`: solo para filtrar el listado de prospectos.
- `localidades`, `barrios`, `canales`, `campanias` aceptan `buscar`: pasá el
  texto tal como lo dijo el usuario, aunque esté mal escrito. Si el primero
  tiene `similitud` de 90 o más y le saca 10 puntos o más al segundo, usalo
  directamente; si no, mostrá hasta 5 opciones y que elija.

## Consultar

- `buscar_prospectos_vendedor`: el listado principal (una fila por gestión,
  la más reciente primero, hasta 50 por defecto). Si la respuesta dice
  `hayMas`, avisá que hay más y sugerí un filtro (fecha, campaña, nombre).
  `archivado: true` trae solo los archivados.
- `agendas_prospectos_vendedor`: citas entre dos fechas (las dos son
  obligatorias).
- `historial_mensajes_prospecto`: gestiones previas de un prospecto. Necesita
  `codCliente` y `codProspecto`: conseguilos antes con
  `buscar_prospectos_vendedor`.
- `resumen_prospeccion`: asignados, nuevos, agendados y gestionados de hoy,
  la semana y el mes, en una sola llamada.
- `totales_resultado_prospeccion`: gestiones por resultado. El intervalo es
  exactamente `Día`, `Sem`, `Mes` o `Año`.

## Registrar

Son dos operaciones distintas:

- **Prospecto que ya existe** → `registrar_gestion_prospecto`. Confirmá de
  qué prospecto se trata (`codCliente` y `codProspecto`, de
  `buscar_prospectos_vendedor`); si lo tiene, pasá también su `codReclamo`.
- **Prospecto nuevo** → `registrar_prospecto`. Nombre y apellido son
  obligatorios, y al menos un contacto: teléfono, celular o email. Sin
  ninguno de los tres, pedilo antes de dar el alta.

En las dos son obligatorios: grupo, canal, acción (`categorias`) y resultado
(`resultados`).

- **Corregir datos de un prospecto** (nombre, apellido, email, teléfono,
  celular, documento, domicilio) → `modificar_prospecto`. Identificá el
  prospecto igual que para una gestión y pasá solo lo que cambia. No pide
  grupo, canal, acción ni resultado: solo actualiza el prospecto, no
  registra gestión. Si además hubo un contacto nuevo, eso va aparte con
  `registrar_gestion_prospecto`.

Las tres escriben en la base: confirmá los datos con el usuario antes de
llamarlas.

## Checklist antes de registrar

1. ¿Grupo, canal, acción y resultado salieron de `listar_catalogo`?
2. ¿Gestión existente: está identificado el prospecto exacto? ¿Alta nueva:
   hay al menos un dato de contacto?
3. ¿El resultado tiene `exigeAgendamiento`? Entonces hace falta la fecha
   de la próxima cita (`fechaHoraAgenda`).

Si falta algo, resolvelo primero (con el catálogo o preguntando) antes de
registrar.
