# Spec Delta

## Purpose

Le da al agente dos tools de apoyo en el catálogo de prospección: una para saber con qué identidad está operando y otra para leer las reglas de uso del CRM antes de empezar.

## ADDED Requirements

### Requirement: Identidad de la sesión
El catálogo de prospección MUST publicar `user_info` como primera tool, sin parámetros. MUST devolver `codUsuario`, `codVendedor` y `transporte` (`stdio` o `http`). Los códigos sin valor se devuelven como `null`.

#### Scenario: Vendedor logueado por teléfono
- **GIVEN** una sesión HTTP iniciada con `tlfvendedor`
- **WHEN** se llama a `user_info`
- **THEN** la respuesta tiene el `codVendedor` del vendedor y `transporte` igual a `http`

### Requirement: Instrucciones de uso
El catálogo de prospección MUST publicar `obtener_instrucciones` como segunda tool, sin parámetros. Devuelve el texto de uso del CRM, con el mismo contenido que `prospeccion-instructions.md` de la v1 pero con los nombres de parámetros de este servidor. Su descripción MUST pedirle al agente que la llame antes de cualquier otra tool. Las instrucciones MUST NOT enviarse en el campo `instructions` del handshake.

#### Scenario: Instrucciones disponibles
- **WHEN** se llama a `obtener_instrucciones`
- **THEN** la respuesta incluye el checklist "antes de registrar" y menciona `listar_catalogo`

#### Scenario: Handshake sin instrucciones
- **WHEN** un cliente hace `initialize` con `MCP_CATALOGO=prospeccion`
- **THEN** la respuesta no trae el campo `instructions`

#### Scenario: Parámetros con los nombres de este servidor
- **WHEN** se lee el texto de `obtener_instrucciones`
- **THEN** no aparece ningún nombre de parámetro de la v1 como `MAX_FILAS_IN` o `COD_PADRE`
