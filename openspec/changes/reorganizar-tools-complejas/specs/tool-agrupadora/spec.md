# Spec Delta

## Purpose

La tool que agrupa listados simples de opciones (como `listar_catalogo`) se declara como un tipo propio del archivo de funciones. Su motor genérico es parte del servidor y no un handler de `src/catalogos/`.

## ADDED Requirements

### Requirement: Tipo agrupadora
El archivo de funciones MUST aceptar `"tipo": "agrupadora"`, con `nombre`, `descripcion` y, opcionalmente, `titulo` y `parametros`: las descripciones de `catalogo`, `codPadre` y `buscar`. La tool se ejecuta con el motor genérico de agrupación, con el comportamiento definido para `listar_catalogo`: entrada, descripción generada, salida uniforme y validaciones de variantes. MUST NOT declarar `handler`.

#### Scenario: listar_catalogo como agrupadora
- **GIVEN** `funciones/prospeccion-functions.json` con `{ "tipo": "agrupadora", "nombre": "listar_catalogo", ... }` y sus 8 variantes
- **WHEN** un cliente consulta `tools/list` e invoca `listar_catalogo`
- **THEN** la tool, su descripción y sus respuestas son las mismas que antes de este cambio

#### Scenario: Agrupadora con handler
- **GIVEN** una tool `"tipo": "agrupadora"` que declara `"handler"`
- **WHEN** se carga el archivo
- **THEN** la carga falla con un error que nombra la tool y `handler`

### Requirement: Variantes de una agrupadora
`grupo` en una tool `procedure` o `webservice` MUST nombrar una tool `"tipo": "agrupadora"` del mismo archivo. Que nombre una tool de otro tipo MUST invalidar el archivo.

#### Scenario: Grupo que apunta a una compleja
- **GIVEN** una variante con `"grupo": "user_info"`, que es una tool compleja
- **WHEN** se carga el archivo
- **THEN** la carga falla con un error que nombra la variante y `user_info`

### Requirement: Agrupadora sin variantes
Una tool `agrupadora` sin ninguna variante MUST invalidar el archivo.

#### Scenario: Agrupadora vacía
- **GIVEN** una tool `"tipo": "agrupadora"` y ninguna tool con `"grupo"` igual a su nombre
- **WHEN** se carga el archivo
- **THEN** la carga falla con un error que dice que no tiene variantes
