# Spec Delta

## Purpose

Define el inicio de sesión OAuth 2.1 del modo HTTP: login, emisión, renovación y validación de tokens. Es el mismo mecanismo y el mismo formato de token que el MCP de tickets v1 (`mcp-server/`), configurable por variables de entorno.

## ADDED Requirements

### Requirement: Descubrimiento OAuth
El servidor MUST publicar `/.well-known/oauth-protected-resource` (RFC 9728), con el recurso `{base}/mcp` y a sí mismo como authorization server. También MUST publicar `/.well-known/oauth-authorization-server` (RFC 8414), con los endpoints `/authorize`, `/token` y `/register`, los grants `authorization_code` y `client_credentials`, y `S256` como único método PKCE.

#### Scenario: Metadata del authorization server
- **WHEN** un cliente hace GET a `/.well-known/oauth-authorization-server`
- **THEN** recibe JSON con `authorization_endpoint`, `token_endpoint` y `registration_endpoint` bajo la URL base
- **AND** `code_challenge_methods_supported` es `["S256"]`

### Requirement: Registro dinámico de cliente
`POST /register` (RFC 7591) MUST responder 201 con un `client_id` público fijo, `token_endpoint_auth_method: "none"` y los `redirect_uris` recibidos. No guarda registros persistentes.

#### Scenario: Registro de Claude Code
- **WHEN** un cliente hace POST a `/register` con `redirect_uris: ["http://localhost:5555/callback"]`
- **THEN** recibe 201 con un `client_id` y los mismos `redirect_uris`

### Requirement: Página de inicio de sesión configurable
`GET /authorize` MUST mostrar un formulario HTML. Su encabezado y título vienen de `MCP_AUTH_TITULO_AUTORIZACION` (default "Autorizar acceso al MCP"). El campo `apikey` MUST mostrarse solo si `MCP_AUTH_APIKEY_REQUERIDO` es verdadero, con la etiqueta de `MCP_AUTH_APIKEY_TITULO`. Lo mismo vale para `apisecret` (tipo password) con `MCP_AUTH_APISECRET_*`. Los defaults son `true`, "Usuario" y "Clave".

#### Scenario: Formulario por defecto
- **GIVEN** ninguna variable `MCP_AUTH_*` definida
- **WHEN** el navegador abre `/authorize` con parámetros válidos
- **THEN** la página muestra el encabezado "Autorizar acceso al MCP", un campo "Usuario" de texto y un campo "Clave" de tipo password

#### Scenario: Login de un solo campo con títulos propios
- **GIVEN** `MCP_AUTH_TITULO_AUTORIZACION="Tickets JKMate"`, `MCP_AUTH_APIKEY_TITULO="Teléfono"` y `MCP_AUTH_APISECRET_REQUERIDO=false`
- **WHEN** el navegador abre `/authorize` con parámetros válidos
- **THEN** la página muestra el encabezado "Tickets JKMate" y un único campo "Teléfono", sin campo de clave

#### Scenario: Textos configurados escapados
- **GIVEN** `MCP_AUTH_TITULO_AUTORIZACION="<b>MCP</b>"`
- **WHEN** se renderiza la página de login
- **THEN** el texto aparece literal, escapado como HTML, sin interpretarse como marcado

### Requirement: Validación de parámetros de autorización
`GET /authorize` MUST exigir `response_type=code`, `redirect_uri`, `code_challenge` y `code_challenge_method=S256`. Si falta alguno o es distinto, MUST responder 400 con `error: "invalid_request"` y una descripción, sin mostrar el formulario.

#### Scenario: PKCE plain rechazado
- **WHEN** un cliente abre `/authorize` con `code_challenge_method=plain`
- **THEN** recibe 400 con `error` igual a `invalid_request`

### Requirement: Tipo de inicio de sesión resuelto en la base
La validación de credenciales MUST delegarse en `PROC_GET_AUTH_CREDENCIAL(MCP_AUTH_TIPO, apikey, apisecret)`. `MCP_AUTH_TIPO` vale `alias/clave` por defecto. El servidor MUST NOT conocer la lógica de ningún tipo, salvo dos casos. Si el procedure devuelve `OK=-66`, MUST reintentar una vez con `apisecret` en MD5 (hex en minúsculas). Con `alias/clave`, MUST además exigir una fila activa del usuario en `MCP_OAUTH_CREDENCIALES`.

#### Scenario: Tipo de login distinto sin cambiar código
- **GIVEN** `MCP_AUTH_TIPO=tlfvendedor` y `MCP_AUTH_APISECRET_REQUERIDO=false`
- **WHEN** el usuario envía el formulario con un teléfono válido para ese tipo
- **THEN** el servidor llama a `PROC_GET_AUTH_CREDENCIAL('tlfvendedor', <teléfono>, '')` y usa su resultado como identidad

#### Scenario: Usuario sin acceso habilitado al MCP
- **GIVEN** `MCP_AUTH_TIPO=alias/clave` y un usuario con alias y clave válidos pero sin fila activa en `MCP_OAUTH_CREDENCIALES`
- **WHEN** envía el formulario
- **THEN** el login falla

### Requirement: Resultado del formulario de login
Con credenciales válidas, `POST /authorize` MUST emitir un código de autorización de un solo uso con vigencia de 5 minutos. Luego MUST redirigir a `redirect_uri` con `code` y el `state` original. Con credenciales inválidas, MUST volver a mostrar el formulario con el mensaje "Credenciales incorrectas, o no tenés acceso habilitado al MCP.".

#### Scenario: Login exitoso
- **WHEN** el usuario envía credenciales válidas
- **THEN** el navegador es redirigido a `redirect_uri?code=<código>&state=<state>`

#### Scenario: Login fallido
- **WHEN** el usuario envía una clave incorrecta
- **THEN** ve otra vez el formulario con el mensaje de credenciales incorrectas y no hay redirección

### Requirement: Emisión de token por código de autorización
`POST /token` con `grant_type=authorization_code` MUST canjear `code` por un token, validando que el código exista, no esté vencido ni usado, que `redirect_uri` coincida y que `code_verifier` cumpla PKCE S256. Si algo falla, MUST responder 400 con `error: "invalid_grant"`. Cada código MUST poder canjearse una sola vez.

#### Scenario: Canje exitoso
- **WHEN** el cliente envía un `code` vigente con el `code_verifier` correcto
- **THEN** recibe 200 con `access_token`, `token_type: "Bearer"` y `expires_in` en segundos

#### Scenario: Código reutilizado
- **GIVEN** un `code` ya canjeado
- **WHEN** el cliente lo envía otra vez
- **THEN** recibe 400 con `error` igual a `invalid_grant`

### Requirement: Emisión de token por credenciales de cliente
`POST /token` con `grant_type=client_credentials` MUST tomar `client_id` como apikey y `client_secret` como apisecret, y validarlos con el mismo mecanismo que el formulario. Solo son obligatorios los campos que el tipo configurado exige. Si faltan, MUST responder 400 `invalid_request`. Con credenciales inválidas, MUST responder 401 `invalid_client`. Un grant desconocido MUST dar 400 `unsupported_grant_type`.

#### Scenario: Integración sin navegador
- **WHEN** un script hace POST a `/token` con `grant_type=client_credentials`, alias y clave válidos
- **THEN** recibe 200 con un `access_token`

#### Scenario: Credenciales inválidas
- **WHEN** envía una clave incorrecta
- **THEN** recibe 401 con `error` igual a `invalid_client`

### Requirement: Formato del token compatible con la v1
El `access_token` MUST ser un JWT HS256 firmado con `MCP_JWT_SIGNING_KEY`. Lleva `jti`, `iat`, `nbf` y `exp` (vigencia `MCP_JWT_EXPIRACION_SOBRE_DIAS`, default 15 días). También lleva siempre las 7 claims de identidad (`COD_USUARIO`, `COD_VENDEDOR`, `COD_DESARROLLADOR`, `COD_PROVEEDOR`, `COD_CLIENTE`, `COD_EMPRESA`, `SECUENCIAL_EMPRESA`) como texto, vacías si no aplican. Con `alias/clave` lleva además `COD_CREDENCIAL_MCP`. La estructura MUST ser la misma que emite la v1.

#### Scenario: Token federado con la v1
- **GIVEN** este servidor y el MCP de tickets v1 configurados con el mismo `MCP_JWT_SIGNING_KEY`
- **WHEN** se usa en `/mcp` de este servidor un token emitido por la v1
- **THEN** el token es aceptado y la identidad sale de sus claims

#### Scenario: Token de este servidor aceptado por la v1
- **GIVEN** los dos servidores con el mismo `MCP_JWT_SIGNING_KEY`
- **WHEN** la v1 valida un token emitido por este servidor
- **THEN** lo acepta con las mismas claims de identidad

#### Scenario: Misma estructura que la v1
- **WHEN** se decodifica un token emitido por este servidor
- **THEN** el header es `{"alg":"HS256","typ":"JWT"}`, no hay `iss` ni `aud`, el `jti` es un UUID sin guiones y las claves del payload van en el orden de la v1: `exp`, `iat`, `nbf`, claims de identidad, `jti`

#### Scenario: Claims vacías, nunca ausentes
- **GIVEN** un tipo de login que solo resuelve `COD_USUARIO`
- **WHEN** se decodifica el token emitido
- **THEN** `COD_VENDEDOR` está presente con valor `""`

### Requirement: Renovación de token
`POST /token/renovar` con `Authorization: Bearer <token>` válido y no revocado MUST responder con un JWT nuevo (otro `jti`, nueva vigencia) con las mismas claims de identidad. El token anterior sigue valiendo hasta su `exp`. Sin header MUST responder 400 `invalid_request`. Con token inválido, vencido o revocado MUST responder 401 `invalid_token`.

#### Scenario: Renovación exitosa
- **WHEN** el cliente renueva con un token vigente
- **THEN** recibe 200 con un `access_token` distinto y las mismas claims de identidad

#### Scenario: Token vencido
- **WHEN** el cliente intenta renovar con un token cuyo `exp` ya pasó
- **THEN** recibe 401 con `error` igual a `invalid_token`

### Requirement: Protección de /mcp con Bearer
Toda request a `/mcp` MUST traer un JWT con firma válida, no vencido (tolerancia 1 minuto) y con `jti` ausente de `MCP_OAUTH_TOKENS_REVOCADOS`. Si no, MUST responder 401 con `WWW-Authenticate: Bearer resource_metadata="{base}/.well-known/oauth-protected-resource"`. Con `COD_CREDENCIAL_MCP`, MUST re-verificar, igual que la v1, que su `COD_USUARIO` siga teniendo una fila activa en `MCP_OAUTH_CREDENCIALES` (se busca por `COD_USUARIO`, no por el `COD_CREDENCIAL_MCP` del token).

#### Scenario: Sin token
- **WHEN** un cliente hace POST a `/mcp` sin header `Authorization`
- **THEN** recibe 401 con `WWW-Authenticate` que contiene `resource_metadata`

#### Scenario: Token revocado
- **GIVEN** un token cuyo `jti` figura en `MCP_OAUTH_TOKENS_REVOCADOS`
- **WHEN** se usa en `/mcp`
- **THEN** recibe 401

#### Scenario: Credencial desactivada después del login
- **GIVEN** un token `alias/clave` vigente cuya fila de `MCP_OAUTH_CREDENCIALES` se pasó a inactiva
- **WHEN** se usa en `/mcp`
- **THEN** recibe 401

### Requirement: Token sin la identidad que exige el servidor
Cada servidor declara qué claim de identidad necesitan sus tools. Para tickets es `COD_USUARIO`. Una request a `/mcp` con un token válido cuya claim requerida esté vacía MUST rechazarse con 403. El mensaje MUST nombrar la claim faltante y explicar que el login configurado no la resuelve.

#### Scenario: Token de vendedor federado en tickets
- **GIVEN** el servidor de tickets y un token federado con `COD_USUARIO` vacío y `COD_VENDEDOR` con valor
- **WHEN** se usa en `/mcp`
- **THEN** recibe 403 con un mensaje que nombra `COD_USUARIO`

### Requirement: Secretos fuera de los logs
El servidor MUST NOT escribir en logs el `apisecret`/`client_secret` recibido ni ningún token o código de autorización, tampoco en intentos fallidos. MUST loguear cada intento de login con el tipo, el apikey y el resultado (OK/FALLO).

#### Scenario: Login fallido logueado sin clave
- **WHEN** un usuario falla el login
- **THEN** el log tiene una entrada con tipo de login, apikey y resultado FALLO
- **AND** ninguna entrada contiene la clave enviada
