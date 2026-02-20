# Minerva v2 — Integración Microsoft (OneDrive + Graph)

> Guía completa de configuración, arquitectura y flujos de la integración con Microsoft.  
> Última actualización: 2026-02-06

---

## Tabla de Contenidos

1. [Visión General](#1-visión-general)
2. [Registro de Aplicación en Azure](#2-registro-de-aplicación-en-azure)
3. [Permisos y Scopes](#3-permisos-y-scopes)
4. [Variables de Entorno](#4-variables-de-entorno)
5. [Arquitectura del Backend](#5-arquitectura-del-backend)
6. [Flujo OAuth (Conexión)](#6-flujo-oauth-conexión)
7. [Almacenamiento de Tokens (Vault)](#7-almacenamiento-de-tokens-vault)
8. [Refresh Automático de Tokens](#8-refresh-automático-de-tokens)
9. [Edge Function: microsoft-auth](#9-edge-function-microsoft-auth)
10. [Edge Function: microsoft-graph](#10-edge-function-microsoft-graph)
11. [Configuración de OneDrive (Carpetas y Archivos)](#11-configuración-de-onedrive-carpetas-y-archivos)
12. [Frontend: Flujo de UI](#12-frontend-flujo-de-ui)
13. [Esquema de Base de Datos](#13-esquema-de-base-de-datos)
14. [Permisos de Usuario](#14-permisos-de-usuario)
15. [Troubleshooting](#15-troubleshooting)

---

## 1. Visión General

La integración Microsoft conecta Minerva con OneDrive para sincronizar horarios e incidencias mediante archivos Excel almacenados en la nube. El flujo completo involucra:

```
┌──────────────┐     OAuth 2.0      ┌───────────────────┐     Graph API     ┌──────────────┐
│   Frontend   │ ◄────────────────► │  Edge Functions   │ ◄───────────────► │  Microsoft   │
│   (Tauri)    │  Status polling    │  (Supabase/Deno)  │  CRUD Excel       │  Graph/Azure │
└──────────────┘                    └───────────────────┘                   └──────────────┘
                                            │
                                     ┌──────┴──────┐
                                     │  Vault      │  Tokens cifrados
                                     │  (Supabase) │
                                     └─────────────┘
```

**Un solo sistema:**
- **Server-side** (Edge Functions): `microsoft-auth` y `microsoft-graph` — manejan OAuth, tokens, operaciones Graph API

---

## 2. Registro de Aplicación en Azure

### Paso 1: Crear la aplicación

1. Ir al [Portal de Azure](https://portal.azure.com/) → **Registros de aplicaciones** → **+ Nuevo registro**
2. **Nombre**: ej. "Minerva Integration"
3. **Tipos de cuenta**: Seleccionar **"Cuentas en cualquier directorio organizativo y cuentas personales de Microsoft"** (multiinquilino + personal)
   - Crucial: permite OneDrive Personal y OneDrive for Business
4. **URI de redirección**: Tipo **Web**, URL:
   ```
   https://<project-ref>.supabase.co/functions/v1/microsoft-auth/callback
   ```

### Paso 2: Obtener credenciales

| Dato | Ubicación en Azure | Variable |
|------|-------------------|----------|
| **Client ID** | Overview → "Identificador de aplicación (cliente)" | `MS_CLIENT_ID` |
| **Client Secret** | Certificados y secretos → Nuevo secreto → copiar **Valor** inmediato | `MS_CLIENT_SECRET` |

> **Advertencia:** El Client Secret solo se muestra una vez al crearse. Si lo pierdes, debes generar uno nuevo.

---

## 3. Permisos y Scopes

### Scopes solicitados en OAuth

La aplicación solicita estos **4 scopes** durante la autorización:

```
offline_access User.Read Files.Read.All Files.ReadWrite.All
```

| Scope | Tipo | Propósito |
|-------|------|-----------|
| `offline_access` | Delegado | Permite obtener refresh tokens para mantener sesión |
| `User.Read` | Delegado | Leer perfil del usuario (email, nombre) |
| `Files.Read.All` | Delegado | Leer archivos en OneDrive (navegar carpetas, leer Excel) |
| `Files.ReadWrite.All` | Delegado | Escribir/modificar archivos en OneDrive (subir Excel, actualizar tablas) |

### Configurar en Azure Portal

1. Permisos de API → **+ Agregar un permiso** → **Microsoft Graph** → **Permisos delegados**
2. Marcar los 4 permisos listados arriba
3. Click **Agregar permisos**

---

## 4. Variables de Entorno

```bash
supabase secrets set MS_CLIENT_ID="tu-client-id"
supabase secrets set MS_CLIENT_SECRET="tu-client-secret"
supabase secrets set MS_REDIRECT_URI="https://<project-ref>.supabase.co/functions/v1/microsoft-auth/callback"
```

| Variable | Descripción |
|----------|-------------|
| `MS_CLIENT_ID` | Application (client) ID del registro en Azure |
| `MS_CLIENT_SECRET` | Valor del secreto de cliente |
| `MS_REDIRECT_URI` | URL de callback para OAuth. Debe coincidir exactamente con la URI configurada en Azure |

---

## 5. Arquitectura del Backend

### Dos Edge Functions

```
supabase/functions/
├── microsoft-auth/index.ts    # OAuth: init, callback, status, disconnect, update-config
├── microsoft-graph/index.ts   # Graph API: CRUD archivos Excel, OneDrive
└── _shared/
    ├── auth-utils.ts          # getUserFromToken(), verificación de permisos
    ├── error-utils.ts         # estandarización de logs y respuestas de error
    └── oauth-utils.ts         # helpers para state management en OAuth
```

Ambas funciones se despliegan con `--no-verify-jwt` y manejan autenticación interna via `auth-utils.ts`.

### Seguridad

- **OAuth 2.0 Authorization Code Flow** (server-side)
- `MS_CLIENT_SECRET` nunca se expone al frontend
- Tokens almacenados en **Supabase Vault** (cifrado en reposo)
- Todo tráfico Graph pasa por las Edge Functions
- Tabla `microsoft_account` protegida por RLS: solo `service_role`

---

## 6. Flujo OAuth (Conexión)

```
Frontend                    microsoft-auth              Azure AD              microsoft-auth
  │                            (init)                                          (callback)
  │─ POST {action:'init'} ──►│                                                    │
  │◄── {url: authUrl} ────── │                                                    │
  │                           │                                                    │
  │─ openUrl(authUrl) ──────────────────────► Pantalla de login                    │
  │                                           Usuario autoriza                     │
  │                                              │                                 │
  │                                              │─ redirect con ?code&state ────►│
  │                                              │                                │
  │                                              │  Exchange code → tokens        │
  │                                              │  GET /me → perfil              │
  │                                              │  store_microsoft_credentials() │
  │                                              │◄─ HTML "Success" ──────────────│
  │                                                                                │
  │─ Poll {action:'status'} ──► (cada 3s, máx 3 min)                              │
  │◄── {connected: true} ──── │                                                    │
```

### Parámetros de polling

| Constante | Valor | Descripción |
|-----------|-------|-------------|
| `POLL_INTERVAL` | 3000 ms | Intervalo entre cada verificación de status |
| `TIMEOUT` | 180000 ms | Tiempo máximo de espera (3 minutos) |

---

## 7. Almacenamiento de Tokens (Vault)

Los tokens de Microsoft **nunca** se almacenan en texto plano. El flujo:

1. `callback` recibe tokens de Microsoft (`access_token`, `refresh_token`)
2. El RPC `store_microsoft_credentials` crea dos secretos en Vault:
   - `microsoft_access_token_{userId}` → access token
   - `microsoft_refresh_token_{userId}` → refresh token
3. La tabla `microsoft_account` almacena solo los **UUID de referencia** (`access_token_id`, `refresh_token_id`)
4. Para leer tokens: la vista `microsoft_credentials_decrypted` hace JOIN con `vault.decrypted_secrets`

### Diagrama

```
microsoft_account                       vault.decrypted_secrets
┌──────────────────┐                    ┌────────────────────┐
│ access_token_id  │─── UUID FK ───────►│ id    │ decrypted  │
│ refresh_token_id │─── UUID FK ───────►│       │ secret     │
│ expires_at       │                    └────────────────────┘
│ microsoft_email  │
│ ...config fields │
└──────────────────┘
```

---

## 8. Refresh Automático de Tokens

**Archivo:** `microsoft-graph/index.ts` → `getAccessToken()`

1. Lee credenciales descifradas desde `microsoft_credentials_decrypted`
2. Compara `expires_at` vs `Date.now() + 5 * 60 * 1000` (buffer de **5 minutos**)
3. Si el token está expirado o por expirar:
   - POST a `https://login.microsoftonline.com/common/oauth2/v2.0/token` con `grant_type: refresh_token`
   - Guarda nuevos tokens via `store_microsoft_credentials` (preserva config existente)
   - Si Microsoft no retorna un nuevo refresh token, reutiliza el anterior
4. Retorna el access token válido

> El refresh ocurre **automáticamente** en cada petición a Graph — las funciones llaman `getAccessToken()` antes de hacer cualquier operación.

---

## 9. Edge Function: microsoft-auth

`POST /functions/v1/microsoft-auth`

| Acción | Permiso | Body | Descripción |
|--------|---------|------|-------------|
| `init` | `system.manage` | `{}` | Genera URL de autorización OAuth, retorna `{ url }` |
| `callback` | — (recibe redirect) | Query: `?code=...&state=...` | Intercambia code por tokens, guarda en Vault, muestra HTML de éxito |
| `status` | `reports.manage` o `system.manage` | `{}` | Retorna estado de conexión + email + nombre + config OneDrive |
| `disconnect` | `system.manage` | `{}` | Elimina secretos del Vault y fila de `microsoft_account` |
| `update-config` | `system.manage` | `{ type, id, name, ...}` | Actualiza configuración de carpetas/archivos OneDrive |

### update-config: campos aceptados

| Campo | Tipo | Requerido |
|-------|------|-----------|
| `type` | `'schedules_folder'` \| `'incidences_file'` | Sí |
| `id` | string (OneDrive item ID) | Sí |
| `name` | string (nombre visible) | Sí |
| `worksheet_id` | string | Solo para `incidences_file` |
| `worksheet_name` | string | Solo para `incidences_file` |
| `table_id` | string | Solo para `incidences_file` |
| `table_name` | string | Solo para `incidences_file` |

---

## 10. Edge Function: microsoft-graph

`POST /functions/v1/microsoft-graph`

Las acciones están organizadas en tres niveles de permiso:

### Acciones de lectura (`reports.manage` o `system.manage`)

| Acción | Parámetros | Descripción |
|--------|------------|-------------|
| `list-children` | `folderId?` (default: root) | Lista el contenido de una carpeta de OneDrive |
| `list-worksheets` | `fileId` | Lista hojas y tablas de un archivo Excel |
| `list-content` | `fileId` | Alias de `list-worksheets` |
| `list-tables` | `fileId`, `sheetId?` | Lista tablas de una hoja o libro completo |
| `read-table-rows` | `fileId`, `tableId`, `dateFilter?` | Lee filas + headers, normaliza fechas/texto |

### Acciones de sincronización (`reports.manage` o `system.manage`)

| Acción | Parámetros | Descripción |
|--------|------------|-------------|
| `upsert-rows-by-key` | `fileId`, `tableId`, `values`, `keyColumns` | Upsert: actualiza filas existentes o inserta nuevas |
| `replace-table-data` | `fileId`, `tableId`, `sheetId`, `values`, `range` | Reescribe completamente los datos de una tabla |
| `append-rows` | *(sin handler)* | ⚠️ Listado en `syncActions` pero sin implementación — retorna 400 |

### Acciones de escritura (`system.manage` solamente)

| Acción | Parámetros | Descripción |
|--------|------------|-------------|
| `create-worksheet` | `fileId`, `name` | Crea hoja (maneja "ya existe" gracefully) |
| `update-range` | `fileId`, `sheetId`, `values`, `range?` | Escribe datos en un rango (calcula rango automáticamente) |
| `upload-file` | `folderId`, `name`, `values` (Base64) | Sube archivo `.xlsx` a OneDrive |
| `create-table` | `fileId`, `sheetId`, `range` | Crea tabla Excel con headers |
| `resize-table` | `fileId`, `tableId`, `range` | Redimensiona tabla existente |
| `format-columns` | `fileId`, `sheetId`, `columns` | Ajusta anchos de columna |
| `format-font` | `fileId`, `font`, `range`/`tableId`/`sheetId` | Aplica formato de fuente |
| `update-table-style` | `fileId`, `tableId`, `style` | Cambia estilo de tabla Excel |

---

## 11. Configuración de OneDrive (Carpetas y Archivos)

La integración requiere configurar dos rutas en OneDrive:

### Carpeta de horarios mensuales (`schedules_folder`)

Carpeta raíz donde se almacenan los archivos Excel de horarios. El sistema:
1. Lee los archivos `.xlsx` de esta carpeta
2. Sube nuevos archivos de horarios exportados
3. Solo requiere seleccionar una **carpeta**

### Archivo de incidencias (`incidences_file`)

Un archivo Excel específico con tabla para registro de incidencias. El sistema necesita:
1. La **carpeta** que contiene el archivo
2. El **archivo** `.xlsx` específico
3. La **hoja** (worksheet) dentro del archivo
4. La **tabla** dentro de la hoja

> Ambas configuraciones se guardan en `microsoft_account` y persisten entre sesiones via `update-config`.

---

## 12. Frontend: Flujo de UI

### Componentes principales

| Componente | Ubicación | Propósito |
|-----------|-----------|-----------|
| `MicrosoftIntegration` | `system/components/` | Panel principal: conexión, status, configuración |
| `MicrosoftFileTree` | `system/components/` | Navegador de carpetas/archivos de OneDrive |

### Flujo de conexión

1. Super_admin hace click en **"Connect Microsoft"**
2. Frontend llama `action: 'init'` → recibe URL de OAuth
3. Tauri abre URL en navegador del sistema via `openUrl()`
4. Toast: "Please complete sign in your browser..."
5. **Polling** (cada 3s, máx 3 min): llama `action: 'status'` hasta `connected === true`
6. Con timeout o cancelación: limpia el intervalo, muestra error

### Flujo de configuración OneDrive

El componente `MicrosoftFileTree` permite navegar la estructura de OneDrive:

```
📁 Root
├── 📁 Schedules/             ← Seleccionable como carpeta de horarios
│   ├── 📄 January.xlsx
│   └── 📄 February.xlsx
└── 📁 Reports/
    └── 📄 Incidences.xlsx    ← Expandible para ver hojas/tablas
        └── 📊 Sheet1
            └── 📋 Table1     ← Seleccionable como tabla de incidencias
```

**Carga lazy:** Las carpetas hijas se cargan al expandir (via `list-children`). Los archivos Excel muestran hojas al expandir (via `list-worksheets`). Las hojas muestran tablas al expandir (via `list-tables`).

---

## 13. Esquema de Base de Datos

### Tabla: `microsoft_account`

```sql
microsoft_account
├── id                        UUID PK
├── microsoft_user_id         TEXT NOT NULL
├── microsoft_email           TEXT NOT NULL
├── microsoft_name            TEXT
├── access_token_id           UUID NOT NULL  → vault.secrets
├── refresh_token_id          UUID NOT NULL  → vault.secrets
├── token_type                TEXT DEFAULT 'Bearer'
├── scope                     TEXT
├── expires_at                TIMESTAMPTZ NOT NULL
├── schedules_folder_id       TEXT
├── schedules_folder_name     TEXT
├── incidences_file_id        TEXT
├── incidences_file_name      TEXT
├── incidences_worksheet_id   TEXT
├── incidences_worksheet_name TEXT
├── incidences_table_id       TEXT
├── incidences_table_name     TEXT
├── connected_at              TIMESTAMPTZ
└── updated_at                TIMESTAMPTZ
```

**Constraint:** Índice único en `((true))` → solo puede existir **una** cuenta Microsoft en todo el sistema (patrón singleton).

### RPCs

| RPC | Propósito |
|-----|-----------|
| `store_microsoft_credentials` | Upsert credenciales: crea secretos en Vault, guarda referencias UUID, preserva config existente |
| `update_microsoft_config` | Actualiza campos de carpeta/archivo OneDrive |
| `delete_microsoft_secrets` | Elimina secretos del Vault por UUID al desconectar |

### Vista: `microsoft_credentials_decrypted`

JOIN entre `microsoft_account` y `vault.decrypted_secrets`. Expone:
- `id`, `microsoft_user_id`, `microsoft_email`, `microsoft_name`, `expires_at`
- `access_token` (descifrado), `refresh_token` (descifrado)

Acceso: solo `service_role`. Migración 016 corrigió la omisión de `microsoft_name`.

---

## 14. Permisos de Usuario

| Acción | Permiso requerido | Nivel |
|--------|-------------------|-------|
| Conectar/desconectar cuenta Microsoft | `system.manage` | 100 (super_admin) |
| Configurar carpetas OneDrive | `system.manage` | 100 |
| Ver estado de conexión | `reports.manage` o `system.manage` | 80+ |
| Leer datos de OneDrive | `reports.manage` o `system.manage` | 80+ |
| Sincronizar datos (upsert, replace) | `reports.manage` o `system.manage` | 80+ |
| Escribir/crear archivos en OneDrive | `system.manage` | 100 |

---

## 15. Troubleshooting

El refresh token de Microsoft tiene expiración extendida (~90 días con actividad). Si el sistema no se usa por un período largo, el refresh token puede expirar y será necesario reconectar.

### Error en callback: "state mismatch"

El parámetro `state` en OAuth previene ataques CSRF. Si el callback recibe un state diferente al generado en `init`, la autenticación falla. Solución: reiniciar el flujo de conexión.

### `append-rows` retorna 400

Esta acción está listada en el array `syncActions` pero **no tiene handler implementado**. Usar `upsert-rows-by-key` o `replace-table-data` en su lugar.

### Desconexión no limpia tokens

Si la desconexión falla, pueden quedar secretos huérfanos en Vault. El RPC `delete_microsoft_secrets` los elimina por UUID almacenado en la fila de `microsoft_account`.

### Cambios en Azure Portal no se reflejan

Después de modificar permisos o redirect URIs en Azure, esperar unos minutos para propagación. Para el Client Secret, generar uno nuevo si el anterior expiró.

### Variables de entorno no disponibles en Edge Functions

Verificar con `supabase secrets list`. Las variables se inyectan como `Deno.env.get('MS_CLIENT_ID')`.
