# Spec Delta

## Purpose

Tools que pasan sus parámetros a un stored procedure nombrado en el archivo de funciones, sin código propio y sin registrar un método de webservice.

## ADDED Requirements

### Requirement: Invocación del procedure
Una tool `procedure` MUST declarar `procedure` con el nombre de un stored procedure. Al invocarse, el servidor MUST armar la llamada con todos los parámetros de entrada del procedure en el orden de `RDB$PROCEDURE_PARAMETERS`, con NULL para los que no tengan valor. Un procedure seleccionable (`RDB$PROCEDURE_TYPE = 1`) MUST invocarse con `SELECT * FROM`, y uno ejecutable con `EXECUTE PROCEDURE`. Un procedure sin parámetros de entrada MUST invocarse sin paréntesis.

#### Scenario: Procedure sin parámetros
- **GIVEN** una tool `listar_barrios` con `procedure: "PROC_GET_BARRIOS"`, que no tiene parámetros de entrada
- **WHEN** se invoca
- **THEN** el SQL ejecutado es `SELECT * FROM PROC_GET_BARRIOS`, sin `()`
- **AND** la respuesta trae `resultado` con filas que tienen `codBarrio` y `nombre`

#### Scenario: Parámetro no declarado en el archivo
- **GIVEN** un procedure con entradas `A`, `B` y `C`, y una tool que solo declara `A` y `C`
- **WHEN** se invoca con `A: 1` y `C: 3`
- **THEN** el procedure recibe `(1, NULL, 3)`

### Requirement: Parámetros verificados contra la base
Todo parámetro declarado en una tool `procedure` (por `nombre`, no por `alias`) MUST existir como parámetro de entrada del procedure. La metadata del procedure MUST leerse una vez y cachearse por nombre hasta la próxima recarga del archivo. Un parámetro inexistente o un procedure inexistente MUST responder `ERROR_INTERNO`, con el motivo en el log, y MUST poder detectarse antes con `npm run validar-funciones`.

#### Scenario: Procedure inexistente
- **GIVEN** una tool con `procedure: "PROC_NO_EXISTE"`
- **WHEN** se ejecuta `npm run validar-funciones` contra la base configurada
- **THEN** el comando termina con error y nombra la tool y el procedure

#### Scenario: Metadata cacheada
- **WHEN** se invoca dos veces la misma tool `procedure`
- **THEN** `RDB$PROCEDURE_PARAMETERS` se consulta una sola vez

### Requirement: Salida del procedure tipada desde la base
Los tipos de las columnas de salida MUST tomarse de los parámetros de salida del procedure: los DATE MUST salir como `AAAA-MM-DD`, los TIMESTAMP como ISO 8601 con el offset de `ZONA_HORARIA_BASE`, y los numéricos como números. El `outputSchema` publicado MUST declarar esas propiedades cuando la tool tiene `salida`. Sin `salida`, MUST declarar `resultado` como un array de objetos.

#### Scenario: Fecha sin hora
- **GIVEN** un procedure con una salida DATE `FECHA_ALTA`
- **WHEN** se invoca la tool
- **THEN** `fechaAlta` coincide con `^\d{4}-\d{2}-\d{2}$`
