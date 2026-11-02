# Spec Delta

## Purpose

Tools de escritura del CRM de prospección: dar de alta un prospecto con su primera gestión, registrar una gestión sobre un prospecto existente y corregir sus datos de contacto.

## ADDED Requirements

### Requirement: Registrar gestión sobre un prospecto existente
`registrar_gestion_prospecto` MUST exigir `codCliente`, `codProspecto`, `codGrupoProspecto`, `codComercializadora`, `codCategoriaMensaje` y `codResultado`. MUST aceptar opcionales: `fechaHoraAgenda`, `mensaje`, `fechaHora`, `codReclamo`, `codBarrio`, `codLocalidad`, `codProvincia`, `fechaCierrePosible`, `tipoPlanDisponible`, `codPlanDisponible`, `forecast`, `montoCotizacion` y `cantEmpleados`. MUST registrar la gestión a nombre del vendedor y el usuario de la sesión.

#### Scenario: Gestión registrada
- **GIVEN** un prospecto del vendedor de la sesión y códigos válidos de `listar_catalogo`
- **WHEN** se llama a `registrar_gestion_prospecto`
- **THEN** la respuesta tiene `codProspectacionMovil` del registro creado y un resumen que lo confirma
- **AND** la gestión aparece primera al llamar a `buscar_prospectos_vendedor` con el nombre del cliente

### Requirement: Alta de prospecto nuevo
`registrar_prospecto` MUST exigir `apellido`, `nombre`, `codGrupoProspecto`, `codComercializadora`, `codCategoriaMensaje` y `codResultado`. Además MUST exigir al menos un contacto entre `telefono`, `telefonoMovil` o `email`. Si no hay ninguno, MUST responder `PARAMETRO_INVALIDO` sin escribir nada. MUST aceptar los demás datos opcionales del prospecto (documento, nacimiento, domicilio, ubicación, cita, mensaje y datos comerciales).

#### Scenario: Alta sin contacto
- **WHEN** se llama a `registrar_prospecto` con nombre, apellido y códigos pero sin teléfono, celular ni email
- **THEN** la respuesta es un error `PARAMETRO_INVALIDO` que pide al menos un dato de contacto
- **AND** no se crea ningún registro en la base

#### Scenario: Alta exitosa
- **WHEN** se llama a `registrar_prospecto` con datos completos y un celular
- **THEN** la respuesta tiene `codProspectacionMovil` y el prospecto aparece al buscarlo por nombre

### Requirement: Modificar datos del prospecto
`modificar_prospecto` MUST exigir `codCliente` y `codProspecto`, y aceptar solo los datos a corregir: `nombre`, `apellido`, `email`, `telefono`, `telefonoMovil`, `tipoDocumento`, `nroDocumento` y `domicilio`. Si no viene ningún dato a corregir, MUST responder `PARAMETRO_INVALIDO`. MUST NOT pedir grupo, canal, acción ni resultado.

#### Scenario: Corrección de email
- **WHEN** se llama con `codCliente`, `codProspecto` y `email`
- **THEN** la respuesta confirma la modificación y el nuevo email se ve en la base

#### Scenario: Nada para modificar
- **WHEN** se llama solo con `codCliente` y `codProspecto`
- **THEN** la respuesta es un error `PARAMETRO_INVALIDO`

### Requirement: Rechazo informado por la base
Si el procedure de registro informa un error en su salida, la tool MUST responder un error con código estable `OPERACION_RECHAZADA` y el mensaje del procedure. MUST NOT informar éxito.

#### Scenario: Rechazo del procedure
- **GIVEN** un `codResultado` que no corresponde a la `codCategoriaMensaje` enviada
- **WHEN** se llama a `registrar_gestion_prospecto` y el procedure lo rechaza
- **THEN** la respuesta es un error `OPERACION_RECHAZADA` con el mensaje del procedure

### Requirement: Anotaciones de escritura
Las tres tools de registro MUST declarar `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: false` y `openWorldHint: false`. Su descripción MUST pedir confirmar los datos con el usuario antes de llamarlas.

#### Scenario: Escrituras anotadas
- **WHEN** un cliente consulta `tools/list` con `MCP_CATALOGO=prospeccion`
- **THEN** `registrar_gestion_prospecto`, `registrar_prospecto` y `modificar_prospecto` tienen `readOnlyHint` igual a `false`
