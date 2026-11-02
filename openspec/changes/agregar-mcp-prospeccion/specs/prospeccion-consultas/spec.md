# Spec Delta

## Purpose

Tools de lectura del CRM de prospección: la cartera, la agenda, el historial y las estadísticas del vendedor de la sesión, con respuestas tipadas para agentes.

## ADDED Requirements

### Requirement: Siempre sobre el vendedor de la sesión
Las tools de prospección MUST operar sobre el vendedor de la sesión (y su usuario, cuando el procedure lo pide). MUST NOT declarar en su `inputSchema` ningún parámetro de vendedor ni de usuario.

#### Scenario: Sin parámetro de vendedor
- **GIVEN** `MCP_CATALOGO=prospeccion`
- **WHEN** un cliente consulta `tools/list`
- **THEN** ningún `inputSchema` declara un parámetro de vendedor ni de usuario

#### Scenario: Dos vendedores, misma instancia
- **GIVEN** dos tokens de vendedores distintos contra el mismo servidor HTTP
- **WHEN** cada uno llama a `buscar_prospectos_vendedor` sin filtros
- **THEN** cada uno recibe solo prospectos de su propia cartera

### Requirement: Resumen de la cartera
`resumen_prospeccion` MUST devolver una fila por intervalo (día, semana, mes) con `intervalo`, `fechaDesde`, `fechaHasta`, `asignados`, `nuevos`, `agendados` y `gestionados`. Acepta `fechaReferencia` opcional (`AAAA-MM-DD`, por defecto hoy).

#### Scenario: Resumen de hoy
- **WHEN** se llama a `resumen_prospeccion` sin parámetros
- **THEN** la respuesta tiene tres filas con los contadores como enteros y `fechaDesde`/`fechaHasta` como fechas `AAAA-MM-DD` (son DATE en la base)

### Requirement: Totales por resultado
`totales_resultado_prospeccion` MUST exigir `intervalo` con uno de los valores `Día`, `Sem`, `Mes` o `Año`, y aceptar `fechaReferencia` opcional. MUST devolver por resultado `codResultado`, `resultado` y `cantidad`. Un `intervalo` fuera de esos valores MUST dar error `PARAMETRO_INVALIDO` antes de consultar la base.

#### Scenario: Intervalo inválido
- **WHEN** se llama con `intervalo: "semana"`
- **THEN** la respuesta es un error `PARAMETRO_INVALIDO` que lista los valores admitidos

### Requirement: Búsqueda de prospectos
`buscar_prospectos_vendedor` MUST aceptar filtros opcionales combinables: `codCampania`, `fechaAgenda` + `filtroFecha`, `cliente` (texto), `codBarrio`, `codAccion`, `archivado` (default `false`) y `maxFilas` (default 50). MUST devolver una fila por gestión, la más reciente primero, con los campos de la proyección de la v1 en camelCase. Si vuelven exactamente `maxFilas` filas, MUST indicar `hayMas: true`.

#### Scenario: Tope alcanzado
- **GIVEN** un vendedor con más de 5 gestiones
- **WHEN** se llama con `maxFilas: 5`
- **THEN** la respuesta tiene 5 elementos y `hayMas` es `true`

#### Scenario: Archivados
- **WHEN** se llama con `archivado: true`
- **THEN** todos los elementos devueltos tienen `archivado` igual a `true` (booleano, no 0/1)

### Requirement: Agenda del vendedor
`agendas_prospectos_vendedor` MUST exigir `fechaDesde` y `fechaHasta` (`AAAA-MM-DD`). MUST devolver las citas en ese rango con `fechaHoraCita`, `fechaHoraFin`, `codCliente`, `codProspecto`, `cliente`, `telefonoMovil` y `titulo`.

#### Scenario: Falta una fecha
- **WHEN** se llama solo con `fechaDesde`
- **THEN** la respuesta es un error `PARAMETRO_INVALIDO` sobre `fechaHasta`

### Requirement: Historial de un prospecto
`historial_mensajes_prospecto` MUST exigir `codCliente` y `codProspecto`. MUST devolver las gestiones previas con `fechaHora`, `fechaHoraAgenda`, `categoria`, `resultado`, `estado`, `mensaje`, `entidad`, `usuario` y `nroTramite`.

#### Scenario: Historial de un prospecto existente
- **GIVEN** un prospecto obtenido con `buscar_prospectos_vendedor`
- **WHEN** se pide su historial con su `codCliente` y `codProspecto`
- **THEN** la respuesta lista sus gestiones con fechas en ISO 8601 con offset

### Requirement: Anotaciones de lectura
Las cinco tools de consulta MUST declarar `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true` y `openWorldHint: false`.

#### Scenario: Consultas anotadas
- **WHEN** un cliente consulta `tools/list` con `MCP_CATALOGO=prospeccion`
- **THEN** `resumen_prospeccion`, `totales_resultado_prospeccion`, `buscar_prospectos_vendedor`, `agendas_prospectos_vendedor` e `historial_mensajes_prospecto` tienen `readOnlyHint` igual a `true`
