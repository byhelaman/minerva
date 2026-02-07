# Minerva v2 — Backend Supabase

> Documentación completa de Edge Functions, esquema de base de datos, seguridad RLS, Vault y Realtime.  
> Última actualización: 2026-02-06

---

## Tabla de Contenidos

1. [Edge Functions](#1-edge-functions)
2. [Utilidades Compartidas](#2-utilidades-compartidas-_shared)
3. [Esquema de Base de Datos](#3-esquema-de-base-de-datos)
4. [Modelo de Seguridad](#4-modelo-de-seguridad)
5. [Realtime](#5-realtime)
6. [Configuración de Despliegue](#6-configuración-de-despliegue)

---

## 1. Edge Functions

Todas las funciones se ejecutan en **Deno** y se despliegan con `--no-verify-jwt` — la autenticación se maneja internamente con funciones propias. Imports estandarizados a `https://esm.sh/@supabase/supabase-js@2`.

### 1.1 zoom-auth

Gestiona el flujo OAuth 2.0 de Zoom (authorization code grant).

| Acción | Descripción | Permiso |
|--------|-------------|---------|
| `init` | Crea estado OAuth (`create_oauth_state` RPC), construye URL de autorización de Zoom | `system.manage` |
| `callback` | Recibe redirect de Zoom con `code`+`state`, valida estado, intercambia código por tokens, obtiene `/v2/users/me`, almacena credenciales en Vault | Validación de estado |
| `status` | Retorna estado de conexión (email, nombre, fecha de conexión) desde tabla `zoom_account` | `system.manage` |
| `disconnect` | Lee IDs de secretos, elimina secretos de Vault (`delete_zoom_secrets` RPC), elimina fila de `zoom_account` | `system.manage` |

**Seguridad:** Errores sanitizados (no expone detalles internos de Zoom/DB en respuestas). Env vars validados con `?? ''`.  
**APIs externas:** `zoom.us/oauth/authorize`, `zoom.us/oauth/token`, `api.zoom.us/v2/users/me`  
**Tablas:** `zoom_account` (R/W), `oauth_states` (vía RPCs), `vault.secrets` (vía RPCs)

### 1.2 zoom-api

Crea y actualiza reuniones de Zoom, sincroniza el resultado a la base de datos.

| Operación | Descripción |
|-----------|-------------|
| Actualización individual | PATCH a reunión individual (`meeting_id` + `schedule_for` requeridos) |
| Lote con `batch: true` | Procesa array de requests en paralelo via `Promise.allSettled` (máx. 50 items) |
| `action: 'create'` | POST a `users/me/meetings` para crear reunión nueva |
| `action: 'update'` | PATCH a `meetings/{id}` para actualizar host/hora/recurrencia |

**Permiso:** `meetings.create`  
**Límite batch:** `MAX_BATCH_SIZE = 50` — requests que excedan este límite retornan 400.  
**APIs externas:** `api.zoom.us/v2/meetings/{id}` (PATCH/GET), `api.zoom.us/v2/users/me/meetings` (POST)  
**Efecto secundario:** Cada operación exitosa hace upsert al resultado en `zoom_meetings` (sincronización automática a DB)

### 1.3 zoom-sync

Sincronización completa de usuarios y reuniones de Zoom a la base de datos.

```
POST → zoom-sync
     │
     ├── Obtiene todos los usuarios de Zoom (paginado con next_page_token)
     │   └── Filtra owner/admin (con whitelist de excepción vía ZOOM_WHITELIST_EMAILS)
     │   └── Upsert a zoom_users
     │
     ├── Para cada usuario, obtiene reuniones (lotes de 10 concurrentes)
     │   └── Deduplica por meeting_id
     │   └── Upsert a zoom_meetings
     │
     └── Retorna conteo de usuarios y reuniones sincronizados
```

**Permiso:** `system.manage` O `x-internal-key` (para cronjobs)  
**Variable de entorno:** `ZOOM_WHITELIST_EMAILS` — emails separados por coma que siempre se incluyen

### 1.4 zoom-webhook

Recibe y procesa eventos webhook entrantes de Zoom.

| Evento | Acción |
|--------|--------|
| `endpoint.url_validation` | Retorna respuesta HMAC para validación de URL |
| `user.created` / `user.updated` | Upsert en `zoom_users` |
| `user.deleted` / `user.deactivated` | Elimina de `zoom_users` |
| `meeting.created` / `meeting.updated` | Upsert en `zoom_meetings` con detección de eventos obsoletos |
| `meeting.deleted` | Elimina de `zoom_meetings` |
| `meeting.started` / `meeting.ended` | Solo registro (sin acción en DB) |

**Autenticación:** Verificación de firma HMAC via Web Crypto (`crypto.subtle`) con comparación timing-safe (`constantTimeEqual`). Headers: `x-zm-signature` + `x-zm-request-timestamp` con `ZOOM_WEBHOOK_SECRET`. Timestamp debe estar dentro de ventana de 5 minutos.  
**Detección de eventos obsoletos:** Compara `event.time_stamp` contra `last_event_timestamp` en la fila existente — ignora eventos más antiguos.
**Tablas:** `webhook_events` (registro de todos los eventos), `zoom_users`, `zoom_meetings`

### 1.5 microsoft-auth

Gestiona el flujo OAuth 2.0 de Microsoft para integración con OneDrive.

| Acción | Descripción | Permiso |
|--------|-------------|---------|
| `init` | Crea estado OAuth, construye URL de Microsoft (scopes: `offline_access User.Read Files.Read.All Files.ReadWrite.All`) | `system.manage` |
| `callback` | Valida estado, intercambia código en `login.microsoftonline.com`, obtiene `/v1.0/me`, almacena credenciales | Validación de estado |
| `status` | Retorna estado incluyendo config de OneDrive (carpeta, archivo, hoja, tabla) | `reports.manage` O `system.manage` |
| `disconnect` | Elimina credenciales de Vault y fila de `microsoft_account` | `system.manage` |
| `update-config` | Actualiza config de carpeta/archivo de OneDrive (`update_microsoft_config` RPC) | `system.manage` |

**Tablas:** `microsoft_account` (R/W), `oauth_states` (vía RPCs), `vault.secrets` (vía RPCs)

### 1.6 microsoft-graph

Proxy para la API de Microsoft Graph — operaciones con OneDrive/Excel.

#### Acciones de lectura (`reports.manage` O `system.manage`)

| Acción | Descripción |
|--------|-------------|
| `list-children` | Lista hijos de una carpeta de OneDrive (o raíz) |
| `list-worksheets` | Lista hojas de cálculo en un archivo Excel |
| `list-tables` | Lista tablas en un archivo o hoja específica |
| `list-content` | Lista hojas y tablas de un archivo |
| `read-table-rows` | Lee filas con normalización de encabezados, parsing de fechas/horas y filtro opcional por fecha |

#### Acciones de sincronización (`reports.manage` O `system.manage`)

| Acción | Descripción |
|--------|-------------|
| `replace-table-data` | Reemplaza todos los datos de una tabla: escribe datos nuevos, redimensiona tabla, limpia filas sobrantes |
| `upsert-rows-by-key` | Upsert basado en columnas clave: PATCH filas existentes o POST filas nuevas. Retorna conteos |

#### Acciones de escritura (`system.manage`)

| Acción | Descripción |
|--------|-------------|
| `create-worksheet` | Crea hoja nueva (retorna existente si nombre duplicado) |
| `update-range` | Escribe array 2D a un rango calculado |
| `upload-file` | Sube archivo codificado en Base64 a carpeta OneDrive |
| `create-table` | Crea tabla Excel en una hoja |
| `resize-table` | Redimensiona rango de tabla existente |
| `format-columns` | Establece anchos de columna |
| `format-font` | Establece propiedades de fuente en un rango |
| `update-table-style` | Actualiza estilo visual de una tabla |

**Renovación automática de tokens:** Verifica `expires_at`, renueva si está dentro de 5 minutos de expirar, persiste nuevos tokens.

**Helpers de normalización:**
- `normalizeDate()` — maneja ISO, dd/mm/yyyy, serial de Excel
- `normalizeTime()` — maneja decimal de Excel, HH:mm, HH:mm:ss
- `normalizeText()` — trim, colapsa espacios, elimina caracteres zero-width

---

## 2. Utilidades Compartidas (`_shared/`)

### auth-utils.ts

| Exportación | Descripción |
|-------------|-------------|
| `verifyPermission(req, supabase, permission)` | **Función principal de auth.** Extrae Bearer token, obtiene usuario, crea cliente Supabase del usuario para llamar RPC `has_permission`. Acepta string (match exacto) o array (lógica OR). Retorna el objeto usuario. Errores sanitizados (no expone nombres de permisos). |
| `verifyAccess(req, supabase, permission)` | Intenta `verifyPermission` primero; si falla, intenta `verifyInternalKey`. Para funciones que aceptan tanto usuarios como cronjobs. |
| `verifyInternalKey(req)` | Verifica header `x-internal-key` contra `INTERNAL_API_KEY` env var. **Usa comparación timing-safe** (`constantTimeEqual`). Para llamadas server-to-server. |
| `verifyUserRole(req, supabase, roles)` | (Legacy) Verifica perfil contra roles permitidos. |
| `constantTimeEqual(a, b)` | (Interna) Comparación de strings resistente a ataques de timing via XOR byte a byte. |
| `ROLES` | Constante: `SUPER_ADMIN_ONLY`, `ADMIN_AND_ABOVE` |

### zoom-token-utils.ts

| Exportación | Descripción |
|-------------|-------------|
| `getValidAccessToken(supabase)` | Lee de vista `zoom_credentials_decrypted`. Si el token expira dentro de 5 min, lo renueva via `zoom.us/oauth/token` (refresh_token grant), almacena nuevos tokens via `store_zoom_credentials` RPC, retorna token fresco. |

> **Nota:** Si múltiples requests concurrentes detectan un token expirado, todos intentarán refrescar. Esto es aceptable: Zoom devuelve tokens válidos en cada refresh y la última escritura en Vault simplemente sobrescribe con el token más reciente.

---

## 3. Esquema de Base de Datos

### 3.1 Tablas principales

```
┌─────────────────────────────────────────────────────────────────┐
│                     TABLAS DE IDENTIDAD                         │
│  roles ──< role_permissions >── permissions                     │
│    ▲                                                            │
│    └── profiles (FK auth.users)                                 │
├─────────────────────────────────────────────────────────────────┤
│                    TABLAS DE ZOOM                                │
│  zoom_account (singleton)                                       │
│  zoom_users                                                     │
│  zoom_meetings                                                  │
│  oauth_states                                                   │
│  webhook_events                                                 │
├─────────────────────────────────────────────────────────────────┤
│                   TABLAS DE MICROSOFT                            │
│  microsoft_account (singleton)                                  │
├─────────────────────────────────────────────────────────────────┤
│                   TABLAS DE HORARIOS                             │
│  published_schedules                                            │
│  schedule_entries                                                │
├─────────────────────────────────────────────────────────────────┤
│                        OTRAS                                    │
│  bug_reports                                                    │
└─────────────────────────────────────────────────────────────────┘
```

#### Identidad y acceso

| Tabla | Columnas clave | Propósito |
|-------|---------------|-----------|
| `roles` | `name` (PK), `description`, `hierarchy_level` | Definición de roles |
| `permissions` | `name` (PK), `description`, `min_role_level` | Definición de permisos |
| `role_permissions` | `role` + `permission` (PK compuesto) | Tabla de unión rol-permiso |
| `profiles` | `id` (FK→auth.users), `email`, `display_name`, `role` (FK→roles) | Perfiles de usuario |

#### Zoom

| Tabla | Columnas clave | Propósito |
|-------|---------------|-----------|
| `zoom_account` | `zoom_user_id`, `zoom_email`, `access_token_id`, `refresh_token_id` | Cuenta Zoom del sistema (singleton via índice `UNIQUE ON (true)`) |
| `zoom_users` | `id` (TEXT PK), `email`, `display_name`, `synced_at` | Directorio de usuarios Zoom sincronizados |
| `zoom_meetings` | `meeting_id` (TEXT PK), `host_id`, `topic`, `start_time`, `last_event_timestamp` | Reuniones Zoom sincronizadas |
| `oauth_states` | `state` (UNIQUE), `user_id`, `expires_at` | Estados OAuth temporales (CSRF, 10 min de vida) |
| `webhook_events` | `event_type`, `payload` (JSONB), `processed`, `processed_at` | Registro de todos los eventos webhook |

#### Microsoft

| Tabla | Columnas clave | Propósito |
|-------|---------------|-----------|
| `microsoft_account` | `microsoft_user_id`, `microsoft_email`, token IDs, `schedules_folder_id`, `incidences_file_id`, IDs de hoja/tabla | Cuenta Microsoft del sistema (singleton). Almacena configuración de OneDrive. |

#### Horarios

| Tabla | Columnas clave | Propósito |
|-------|---------------|-----------|
| `published_schedules` | `schedule_date` (UNIQUE), `entries_count`, `published_by` | Registro de fechas publicadas |
| `schedule_entries` | `date`, `program`, `start_time`, `instructor` (UNIQUE compuesto), campos de incidencia, `synced_at` | Filas individuales de horario con seguimiento de incidencias |

#### Otras

| Tabla | Columnas clave | Propósito |
|-------|---------------|-----------|
| `bug_reports` | `title`, `description`, `user_id`, `status` | Reportes de bugs enviados por usuarios |

### 3.2 Vistas

| Vista | Propósito | Acceso |
|-------|-----------|--------|
| `zoom_credentials_decrypted` | Une `zoom_account` con `vault.decrypted_secrets` para exponer tokens en texto plano | Solo `service_role` |
| `microsoft_credentials_decrypted` | Mismo patrón para tokens de Microsoft (incluye `microsoft_name`) | Solo `service_role` |

### 3.3 Funciones principales (RPCs)

#### Autenticación y acceso

| Función | Propósito |
|---------|-----------|
| `custom_access_token_hook(event)` | **Hook de JWT.** Inyecta `user_role`, `hierarchy_level` y `permissions[]` en los claims del token |
| `has_permission(required)` | Lee `permissions` de claims JWT, verifica si el permiso existe |
| `handle_new_user()` | Trigger: crea fila en `profiles` con rol `guest` al registrarse |
| `handle_updated_at()` | Trigger genérico: actualiza `updated_at` a `now()`. Usado por `profiles` y `schedule_entries`. |
| `prevent_role_self_update()` | Trigger: previene auto-modificación de rol y escalación de privilegios |
| `prevent_email_modification()` | Trigger: previene cambio de `email` en `profiles` via UPDATE directo |
| `verify_user_password(password)` | Verifica contraseña actual sin efectos secundarios de sesión |
| `get_my_profile()` | Retorna perfil del usuario actual con permisos computados |

#### Gestión de usuarios

| Función | Permiso | Propósito |
|---------|---------|-----------|
| `get_all_users()` | `users.view` | Lista todos los usuarios con perfil + rol |
| `update_user_role(target, new_role)` | `users.manage` | Cambia rol (con verificación de jerarquía) |
| `delete_user(target)` | `users.manage` | Elimina usuario (cascade desde `auth.users`) |
| `get_user_count()` | nivel ≥ 80 | Conteo total de perfiles |
| `set_new_user_role(target, role)` | `users.manage` | Asigna rol a usuario nuevo |
| `update_user_display_name(target, name)` | `users.manage` | Admin actualiza nombre de otro usuario |

#### Gestión de roles

| Función | Permiso | Propósito |
|---------|---------|-----------|
| `create_role(name, desc, level)` | nivel ≥ 100 | Crea rol (no puede crear ≥ nivel propio) |
| `update_role(name, desc)` | nivel ≥ 100 | Actualiza descripción del rol |
| `delete_role(name)` | nivel ≥ 100 | Elimina rol (protege 6 roles de sistema) |
| `assign_role_permission(role, perm)` | nivel ≥ 100 | Asigna permiso a rol |
| `remove_role_permission(role, perm)` | nivel ≥ 100 | Remueve permiso de rol |

#### Credenciales OAuth

| Función | Propósito |
|---------|-----------|
| `store_zoom_credentials(...)` | Elimina secretos antiguos de Vault, crea nuevos, actualiza `zoom_account`. Atómico. `search_path=''`, solo `service_role`. |
| `delete_zoom_secrets(ids[])` | Elimina secretos de Vault por array de IDs. `search_path=''`, solo `service_role`. |
| `store_microsoft_credentials(...)` | Mismo patrón. Preserva config de OneDrive al renovar tokens. `search_path=''`, solo `service_role`. |
| `delete_microsoft_secrets(ids[])` | Mismo patrón para Microsoft. `search_path=''`, solo `service_role`. |
| `update_microsoft_config(type, id, name, ...)` | Actualiza columnas de config en `microsoft_account`. `search_path=''`, solo `service_role`. |
| `create_oauth_state(user_id)` | Genera estado hex de 32 bytes, limpia expirados, inserta con expiración de 10 min. Solo `service_role`. |
| `validate_oauth_state(state)` | Busca estado, retorna `user_id` si válido, elimina estado (uso único). Solo `service_role`. |

### 3.4 Migraciones

6 archivos consolidados (anteriormente 13 archivos: 001-006, 008-009, 012-016).

| Migración | Contenido |
|-----------|-----------|
| `001_core_access` | Tablas `roles`, `permissions`, `role_permissions`, `profiles`. Seeds de roles y permisos (incluye `reports.manage`). Función `handle_updated_at()` genérica. Hook JWT, triggers de perfil. RPCs base: `has_permission`, `get_my_profile`, `check_email_exists`, `update_my_display_name`, `verify_user_password`. Triggers de seguridad: `prevent_email_modification`, `prevent_role_self_update`. Índices FK en `role_permissions`. |
| `002_user_management` | Funciones RPC para gestión de usuarios y roles. `delete_role` protege los 6 roles del sistema (incluye `moderator` y `guest`). `assign/remove_role_permission` también protegen roles del sistema. |
| `003_zoom_integration` | Tablas `zoom_account`, `oauth_states`, `zoom_users`, `zoom_meetings`. Vista `zoom_credentials_decrypted`. RPCs: `store_zoom_credentials` (`search_path=''`), `delete_zoom_secrets`, `create_oauth_state`, `validate_oauth_state`. REVOKE/GRANT en todas las funciones de credenciales. Índices FK: `host_id`, `user_id`. |
| `004_webhooks_bug_reports` | Tablas `webhook_events`, `bug_reports`. Bug reports: INSERT solo `authenticated` (no anon). Índice parcial en eventos no procesados. Funciones: `cleanup_old_webhook_events`, `get_active_meetings`. |
| `005_microsoft_integration` | Tabla `microsoft_account`. Vista `microsoft_credentials_decrypted` (incluye `microsoft_name`). RPCs: `store_microsoft_credentials` (`search_path=''`), `update_microsoft_config` (`search_path=''`), `delete_microsoft_secrets`. REVOKE/GRANT en todas las funciones. |
| `006_schedules_realtime` | Tablas `published_schedules`, `schedule_entries`. CHECK constraints en fechas (`YYYY-MM-DD`) y horas (`HH:mm`). Índices FK en `published_by`. Índice parcial `idx_schedule_entries_unsynced`. Habilitación Realtime. `REPLICA IDENTITY FULL` en `profiles`. |

### 3.5 Índices

| Tabla | Índice | Tipo |
|-------|--------|------|
| `profiles` | `idx_profiles_email`, `idx_profiles_role` | B-tree |
| `role_permissions` | `idx_role_permissions_role`, `idx_role_permissions_permission` | B-tree (FK) |
| `zoom_account` | `idx_zoom_account_single` | UNIQUE ON `(true)` — fuerza singleton |
| `oauth_states` | `idx_oauth_states_expires`, `idx_oauth_states_user_id` | B-tree |
| `zoom_meetings` | `idx_zoom_meetings_host_id` | B-tree (FK) |
| `bug_reports` | `idx_bug_reports_user_id`, `_status`, `_created_at` | B-tree |
| `webhook_events` | `idx_webhook_events_event_type`, `_created_at`, `idx_webhook_events_unprocessed` (parcial) | B-tree |
| `microsoft_account` | `idx_microsoft_account_single` | UNIQUE ON `(true)` — fuerza singleton |
| `published_schedules` | `idx_published_schedules_date`, `_created`, `_published_by` | B-tree |
| `schedule_entries` | `idx_schedule_entries_date`, `_instructor`, `_published_by`, `idx_schedule_entries_unsynced` (parcial: WHERE synced_at IS NULL) | B-tree |

---

## 4. Modelo de Seguridad

### 4.1 Patrones de políticas RLS

Todas las tablas tienen RLS habilitado. Se usan tres patrones principales:

**Patrón 1 — Solo service_role:**
```sql
CREATE POLICY "service_only" ON tabla
  FOR ALL TO service_role USING (true);
```
Usado en: `zoom_account`, `microsoft_account`, `oauth_states`, `webhook_events`

**Patrón 2 — Verificación de permiso via JWT claims:**
```sql
CREATE POLICY "perm_check" ON tabla
  FOR SELECT TO authenticated
  USING (((SELECT auth.jwt()) -> 'permissions')::jsonb ? 'nombre_permiso'));
```
Usado en: `zoom_users`, `zoom_meetings`, `published_schedules`, `schedule_entries`

**Patrón 3 — Verificación de nivel jerárquico:**
```sql
CREATE POLICY "level_check" ON tabla
  FOR SELECT TO authenticated
  USING (COALESCE(((SELECT auth.jwt()) ->> 'hierarchy_level')::int, 0) >= N);
```
Usado en: `profiles`, `bug_reports`

> **Optimización:** Todas las políticas envuelven `auth.jwt()` y `auth.uid()` en `(SELECT ...)` para que el planner de PostgreSQL los evalúe una sola vez por query.

### 4.2 Uso del Vault

Los tokens OAuth **nunca** se almacenan en texto plano en las tablas. El flujo es:

```
Token → vault.create_secret(token) → retorna UUID
     │
     └── UUID se almacena en zoom_account.access_token_id
         (o microsoft_account.access_token_id)
```

| Patrón de nombre | Contenido |
|------------------|-----------|
| `zoom_access_token_{user_id}` | Token de acceso OAuth de Zoom |
| `zoom_refresh_token_{user_id}` | Token de refresh OAuth de Zoom |
| `microsoft_access_token_{user_id}` | Token de acceso OAuth de Microsoft |
| `microsoft_refresh_token_{user_id}` | Token de refresh OAuth de Microsoft |

Acceso a tokens descifrados solo via vistas `*_credentials_decrypted` → solo `service_role`.

### 4.3 Jerarquía de roles

| Rol | Nivel | Permisos |
|-----|-------|----------|
| `guest` | 0 | Ninguno |
| `viewer` | 10 | `schedules.read` |
| `operator` | 50 | + `schedules.write` |
| `moderator` | 60 | + `meetings.search`, `meetings.create`, `meetings.assign` |
| `admin` | 80 | + `schedules.manage`, `users.view/manage`, `system.view`, `reports.view/manage` |
| `super_admin` | 100 | + `system.manage` |

### 4.4 Prevención de escalación de privilegios

Tres capas de protección:

1. **Trigger `prevent_role_self_update()`** — impide: auto-cambio de rol, modificación de usuarios con nivel ≥ al caller, asignación de roles ≥ al nivel del caller
2. **Trigger `prevent_email_modification()`** — impide modificación directa del campo `email` en `profiles` via UPDATE
3. **Verificaciones en RPCs** — `update_user_role`, `delete_user`, `create_role` verifican jerarquía independientemente
4. **Roles de sistema protegidos** — `super_admin`, `admin`, `moderator`, `operator`, `viewer`, `guest` no se pueden eliminar ni modificar permisos

---

## 5. Realtime

### Tablas habilitadas

| Tabla | Mecanismo | Habilitación |
|-------|-----------|-------------|
| `profiles` | `REPLICA IDENTITY FULL` (migración 006) | Manual en Dashboard |
| `published_schedules` | Publicación `supabase_realtime` (migración 006) | Automática |
| `schedule_entries` | Publicación `supabase_realtime` (migración 006) | Automática |

### Seguridad de canales

No hay políticas de canal personalizadas — la seguridad depende enteramente de las políticas RLS de cada tabla:

- `profiles` — usuario ve su propia fila, admins (nivel ≥ 80) ven todas
- `published_schedules` — requiere `schedules.read` o `schedules.manage` en JWT
- `schedule_entries` — requiere `schedules.read` o `schedules.manage` en JWT

### Uso en la aplicación

- **AuthProvider** — suscripción a cambios en `profiles` filtrada por `id=eq.{userId}`. Detecta eliminación de usuario y cambios de rol.  
- **ScheduleUpdateBanner** — suscripción a `published_schedules` para notificar actualizaciones

---

## 6. Configuración de Despliegue

### config.toml

Todas las funciones se configuran con `verify_jwt = false` (autenticación custom interna):

| Función | Notas |
|---------|-------|
| `zoom-api` | CORS: POST, OPTIONS |
| `zoom-auth` | CORS: GET, POST, OPTIONS |
| `zoom-sync` | CORS: POST, OPTIONS. Import map personalizado (`deno.json`) |
| `zoom-webhook` | CORS: POST, OPTIONS. Web Crypto HMAC |
| `microsoft-auth` | CORS: GET, POST, OPTIONS |
| `microsoft-graph` | CORS: POST, OPTIONS |

Todas las funciones incluyen `Access-Control-Allow-Methods` y restringen orígenes a `localhost:1420`, `tauri://localhost`, `http://tauri.localhost`.

### Variables de entorno requeridas

| Variable | Usado por | Propósito |
|----------|-----------|-----------|
| `MS_CLIENT_ID` | microsoft-auth | ID de aplicación Azure |
| `MS_CLIENT_SECRET` | microsoft-auth | Secreto de cliente Azure |
| `MS_REDIRECT_URI` | microsoft-auth | URL de callback OAuth |
| `ZOOM_WEBHOOK_SECRET` | zoom-webhook | Verificación HMAC de webhooks (Web Crypto + timing-safe) |
| `ZOOM_WHITELIST_EMAILS` | zoom-sync | Emails a incluir siempre en sync |
| `INTERNAL_API_KEY` | zoom-sync | Clave para llamadas server-to-server (cronjobs). Verificación timing-safe. |

> **Nota:** `ZOOM_CLIENT_ID` y `ZOOM_CLIENT_SECRET` se usan por zoom-auth y zoom-token-utils; `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` se usan por todas las funciones. Todas las variables se leen con `?? ''` (sin non-null assertions).
