# Instalación en Claude Desktop

Cómo instalar el MCP de tickets v2 (`mcp-tickets-json`) para usarlo desde Claude Desktop en Windows.

El servidor corre en tu máquina: Claude Desktop lo lanza como proceso local y se comunica con él por stdio. No necesita URL, puerto ni OAuth. Es una instalación de evaluación y no tiene autenticación: el servidor consulta con el usuario de JKMate que pongas en la configuración.

## Requisitos

- Node.js 22 o superior (`node -v` para verificarlo).
- Claude Desktop instalado.
- Acceso a la base de tickets en Firebird 3, con los SP `_AG` ya creados. En la base de testing `E:\Bases\CREAR_JK3_20261016.fdb` ya están. Para otra base, los scripts y el orden para aplicarlos están en [`db/README.md`](../db/README.md).
- Tu `COD_USUARIO` de JKMate.

## 1. Compilar

Desde la carpeta del proyecto:

```bash
npm install
npm run build
```

Esto genera `dist\index.js`, que es lo que ejecuta Claude Desktop. Después de cada cambio en el código hay que volver a correr `npm run build`.

## 2. Configurar Claude Desktop

Abrí el archivo de configuración. Podés hacerlo desde Claude Desktop → **Settings** → **Developer** → **Edit Config**, o directamente en:

```
%APPDATA%\Claude\claude_desktop_config.json
```

Agregá el servidor dentro de `mcpServers`. Si el archivo ya tiene otros servidores, sumalo a la lista sin borrarlos.

```json
{
  "mcpServers": {
    "tickets-v2": {
      "command": "node",
      "args": ["D:\\Desarrollo\\_Repos\\mcpTicketsJson\\dist\\index.js"],
      "env": {
        "MCP_COD_USUARIO": "15169",
        "FIREBIRD_HOST": "127.0.0.1",
        "FIREBIRD_PORT": "3050",
        "FIREBIRD_DATABASE": "E:\\Bases\\CREAR_JK3_20261016.fdb",
        "FIREBIRD_USER": "SYSDBA",
        "FIREBIRD_PASSWORD": "<password>"
      }
    }
  }
}
```

Reemplazá:

- La ruta de `args` por la ubicación de tu copia del proyecto.
- `MCP_COD_USUARIO` por tu `COD_USUARIO` de JKMate.
- Los datos de `FIREBIRD_*` por los de tu base.

En JSON las barras invertidas van dobles (`\\`), o podés usar barras normales (`D:/Desarrollo/...`).

### Variables disponibles

| Variable | Obligatoria | Default | Descripción |
|---|---|---|---|
| `MCP_COD_USUARIO` | Sí | — | `COD_USUARIO` de JKMate. Es la identidad de todas las consultas y lo que significa `"yo"` en los filtros. |
| `MCP_CATALOGO` | No | `tickets` | Qué MCP publica: el nombre de un archivo de la carpeta `funciones/` (`tickets`, `prospeccion` u otro). |
| `FIREBIRD_DATABASE` | Sí | — | Ruta o alias de la base de tickets. |
| `FIREBIRD_HOST` | No | `127.0.0.1` | Servidor Firebird. |
| `FIREBIRD_PORT` | No | `3050` | Puerto de Firebird. |
| `FIREBIRD_USER` | No | `SYSDBA` | Usuario de la base. |
| `FIREBIRD_PASSWORD` | No | — | Contraseña de la base. |
| `FIREBIRD_POOL_MAX` | No | `5` | Conexiones máximas a la base. |
| `ZONA_HORARIA_BASE` | No | `America/Argentina/Buenos_Aires` | Zona horaria en la que la base guarda las fechas. |
| `LOG_LEVEL` | No | `info` | Nivel de log: `debug`, `info`, `warn` o `error`. |
| `SEQ_URL`, `SEQ_API_KEY` | No | — | Si hay `SEQ_URL`, los logs también se envían a Seq. |

## 3. Reiniciar Claude Desktop

Cerrá Claude Desktop por completo, incluido el ícono de la bandeja del sistema, y volvé a abrirlo. Claude Desktop lee la configuración solo al arrancar.

## 4. Verificar

En el ícono de herramientas del chat tiene que aparecer `tickets-v2` con estas 4 tools:

| Tool | Para qué |
|---|---|
| `obtener_contexto_ticket` | Todo el contexto de un ticket en una sola llamada. |
| `listar_tickets` | Listado de tickets con filtros, texto libre y paginación. |
| `listar_tareas` | Tareas de desarrollo por desarrollador, responsable o ticket. |
| `resumir_tickets` | Conteos por estado, prioridad, sistema, cliente o asignado. |

Para probarlo, pedile a Claude:

- "Dame el contexto del ticket 74836"
- "¿Qué tickets tengo agendados?"
- "Resumime mis tickets abiertos por estado"

## Si algo no funciona

El servidor deja su log en:

```
%APPDATA%\Claude\logs\mcp-server-tickets-v2.log
```

| Síntoma o mensaje en el log | Causa | Solución |
|---|---|---|
| `Configuración inválida: MCP_COD_USUARIO ...` o `... FIREBIRD_DATABASE ...` | Falta una variable obligatoria o tiene un valor inválido. | Revisá el bloque `env` de la configuración. |
| `Cannot find module ...dist\index.js` | La ruta de `args` es incorrecta o no compilaste el proyecto. | Corregí la ruta y corré `npm run build`. |
| Las tools responden `BASE_NO_DISPONIBLE` | No se puede conectar a Firebird. | Verificá que el servicio de Firebird esté levantado y revisá host, puerto, ruta, usuario y contraseña. |
| Las tools responden `ERROR_INTERNO` | Error inesperado, por ejemplo que la base no tenga los SP `_AG`. | El detalle queda en el log del servidor. |
| `"yo" no aplica: el usuario de la sesión no tiene un desarrollador asociado` | Tu usuario no tiene `USUARIOS.COD_DESARROLLADOR`. | En `listar_tareas`, indicá el código de desarrollador o filtrá por `ticketId`. |
| `tickets-v2` no aparece | Claude Desktop no se reinició, o el JSON de configuración tiene un error de sintaxis. | Validá el JSON y reiniciá Claude Desktop por completo. |

## Probar sin Claude Desktop

Para revisar el servidor con una interfaz:

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

Cargá las mismas variables de entorno en la pantalla del inspector, conectá y probá las tools desde ahí.

## Publicarlo por HTTP

En lugar de que cada persona corra su propio proceso, el servidor puede quedar publicado como un servicio al que se conectan varios usuarios, cada uno con su propio inicio de sesión. Es el mismo inicio de sesión que el del MCP de tickets v1.

1. Compilá (`npm install` y `npm run build`).
2. Definí las variables del servicio. Además de las `FIREBIRD_*` de la base:

   ```
   MCP_TRANSPORTE=http
   MCP_HTTP_PUERTO=7020
   MCP_JWT_SIGNING_KEY=<secreto largo; el mismo de la v1 si querés que los tokens sirvan en los dos>
   MCP_AUTH_TIPO=alias/clave
   MCP_AUTH_TITULO_AUTORIZACION=Tickets JKMate
   ```

   `MCP_COD_USUARIO` no hace falta: cada usuario se identifica al iniciar sesión. Si el servicio queda detrás de un proxy, agregá `MCP_URL_PUBLICA` con la dirección pública. La lista completa de variables está en el [README](../README.md#publicarlo-por-http).

3. Levantalo con `npm start` (lee el `.env`) o con `node dist/index.js` y las variables en el entorno del servicio.
4. Conectate desde Claude Code:

   ```bash
   claude mcp add --transport http tickets-v2 http://<host>:7020/mcp
   ```

   La primera vez se abre en el navegador la página de inicio de sesión. Ingresá tus datos y autorizá. Para Claude Desktop o claude.ai, agregalo como conector personalizado con la misma URL.

| Síntoma | Causa | Solución |
|---|---|---|
| `Configuración inválida: MCP_JWT_SIGNING_KEY ...` al arrancar | Falta el secreto en modo http. | Definí `MCP_JWT_SIGNING_KEY`. |
| La página dice "Credenciales incorrectas, o no tenés acceso habilitado al MCP." | Datos incorrectos o, con `alias/clave`, el usuario no tiene una fila activa en `MCP_OAUTH_CREDENCIALES`. | Revisá los datos o pedí que habiliten el acceso. |
| Las llamadas devuelven 403 con un mensaje sobre `COD_USUARIO` | El tipo de inicio de sesión configurado no identifica a un usuario de JKMate. | Usá un tipo que resuelva `COD_USUARIO` (por ejemplo `alias/clave`). |
| Las llamadas devuelven 401 | Token vencido, revocado o credencial desactivada. | Volvé a iniciar sesión (o renová con `POST /token/renovar`). |

## MCP de prospección

El mismo proyecto publica el MCP de prospección (CRM de vendedores) con `MCP_CATALOGO=prospeccion`. Se instala igual que el de tickets, cambiando estas variables:

- **Por stdio** (Claude Desktop): `MCP_CATALOGO=prospeccion` y `MCP_COD_VENDEDOR` con tu `COD_VENDEDOR` en lugar de `MCP_COD_USUARIO`.
- **Por HTTP**: `MCP_CATALOGO=prospeccion` y, si los vendedores entran con su teléfono, `MCP_AUTH_TIPO=tlfvendedor`, `MCP_AUTH_APISECRET_REQUERIDO=false` y `MCP_AUTH_APIKEY_TITULO=Teléfono`. Conectalo desde Claude Code con `claude mcp add --transport http prospeccion-v2 http://<host>:<puerto>/mcp`.

Aparecen 11 tools. La primera vez, pedile a Claude que lea las instrucciones (`obtener_instrucciones`). Los textos que ve Claude (descripciones de las tools y de sus parámetros, instrucciones) están en `funciones/prospeccion-functions.json` y `funciones/prospeccion-instructions.md`: se pueden ajustar sin recompilar, y el servidor toma el cambio solo. Por ejemplo: "¿Cómo viene mi cartera esta semana?", "Buscame el prospecto Pérez" o "Registrá que lo llamé y quedó en volver a llamar el lunes".

| Síntoma | Causa | Solución |
|---|---|---|
| `Configuración inválida: MCP_COD_VENDEDOR ...` | Prospección por stdio sin vendedor. | Definí `MCP_COD_VENDEDOR`. |
| 403 con un mensaje sobre `COD_VENDEDOR` | El inicio de sesión configurado no identifica a un vendedor. | Usá un tipo de login que resuelva el vendedor (por ejemplo `tlfvendedor`). |
| Una escritura responde `OPERACION_RECHAZADA` | La base rechazó la gestión (el motivo viene en el mensaje). No quedó nada a medias. | Revisá los códigos con `listar_catalogo` y reintentá. |
