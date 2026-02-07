# Minerva v2 — Integración Zoom (OAuth + Reuniones + Matching)

> Guía completa de configuración, arquitectura y flujos de la integración con Zoom.  
> Última actualización: 2026-02-06

---

## Tabla de Contenidos

1. [Visión General](#1-visión-general)
2. [Registro de Aplicación en Zoom Marketplace](#2-registro-de-aplicación-en-zoom-marketplace)
3. [Permisos y Scopes](#3-permisos-y-scopes)
4. [Variables de Entorno](#4-variables-de-entorno)
5. [Arquitectura del Backend](#5-arquitectura-del-backend)
6. [Flujo OAuth (Conexión)](#6-flujo-oauth-conexión)
7. [Almacenamiento de Tokens (Vault)](#7-almacenamiento-de-tokens-vault)
8. [Refresh Automático de Tokens](#8-refresh-automático-de-tokens)
9. [Edge Function: zoom-auth](#9-edge-function-zoom-auth)
10. [Edge Function: zoom-api](#10-edge-function-zoom-api)
11. [Edge Function: zoom-sync](#11-edge-function-zoom-sync)
12. [Edge Function: zoom-webhook](#12-edge-function-zoom-webhook)
13. [Frontend: useZoomStore](#13-frontend-usezoomstore)
14. [Frontend: Flujo de UI](#14-frontend-flujo-de-ui)
15. [Operaciones Batch (Crear/Actualizar Reuniones)](#15-operaciones-batch-crearactualizar-reuniones)
16. [Conexión con el Motor de Matching](#16-conexión-con-el-motor-de-matching)
17. [Esquema de Base de Datos](#17-esquema-de-base-de-datos)
18. [Permisos de Usuario](#18-permisos-de-usuario)
19. [Troubleshooting](#19-troubleshooting)

---

## 1. Visión General

```
┌─────────────────────────────────────────────────────────────┐
│                    Minerva Desktop (Tauri)                   │
│                                                             │
│  ┌───────────────┐  ┌──────────────────┐  ┌─────────────┐  │
│  │ZoomIntegration│  │ScheduleDashboard │  │GlobalSync    │  │
│  │  (conexión)   │  │  (matching UI)   │  │Manager       │  │
│  └───────┬───────┘  └────────┬─────────┘  └──────┬──────┘  │
│          │                   │                    │          │
│          │           ┌───────▼────────┐           │          │
│          │           │  useZoomStore  │◄──────────┘          │
│          │           │  (Zustand)     │                      │
│          │           │  ┌──────────┐  │                      │
│          │           │  │Web Worker│  │                      │
│          │           │  │(matching)│  │                      │
│          │           │  └──────────┘  │                      │
│          │           └───────┬────────┘                      │
│          │                   │                               │
└──────────┼───────────────────┼───────────────────────────────┘
           │                   │ HTTPS
           │    ┌──────────────▼──────────────┐
           │    │   Supabase Edge Functions    │
           │    │  ┌──────────┐ ┌──────────┐  │
           └────┼─▶│zoom-auth │ │zoom-api  │  │
                │  └──────────┘ └──────────┘  │
                │  ┌──────────┐ ┌──────────┐  │
                │  │zoom-sync │ │zoom-     │  │
                │  │          │ │webhook   │  │
                │  └──────────┘ └──────────┘  │
                └──────────────┬──────────────┘
                               │ HTTPS
                    ┌──────────▼──────────┐
                    │   Zoom REST API     │
                    │  /v2/users          │
                    │  /v2/meetings       │
                    │  /v2/users/me       │
                    └─────────────────────┘
```

**Un solo sistema:** Toda la comunicación con la API de Zoom pasa por Edge Functions (server-side). El frontend **nunca** llama directamente a la API de Zoom — los tokens solo existen en Supabase Vault.

**Cuatro Edge Functions:**

| Función | Propósito |
|---------|-----------|
| `zoom-auth` | Flujo OAuth 2.0 (conexión, estado, desconexión) |
| `zoom-api` | CRUD de reuniones (crear, actualizar, batch) |
| `zoom-sync` | Sincronización completa de usuarios y reuniones |
| `zoom-webhook` | Receptor de eventos en tiempo real desde Zoom |

**Utilidades compartidas:**
- `_shared/zoom-token-utils.ts` — obtención y refresh automático de tokens
- `_shared/auth-utils.ts` — verificación de permisos y auth interna

---

## 2. Registro de Aplicación en Zoom Marketplace

### Requisitos previos

1. Cuenta Zoom con permisos de administrador
2. Acceso al [Zoom App Marketplace](https://marketplace.zoom.us/)

### Crear la aplicación

1. Ir a **Develop** → **Build App**
2. Seleccionar tipo **OAuth** (Server-to-Server **NO** — se necesita user-level OAuth)
3. Configurar:

| Campo | Valor |
|-------|-------|
| App Name | `Minerva Schedule Manager` (o similar) |
| App Type | **User-managed** |
| Redirect URL | La URL de callback de la Edge Function (ej: `https://<supabase-project>.supabase.co/functions/v1/zoom-auth/callback`) |
| OAuth Allow List | Agregar el redirect URL |

### Eventos de Webhook (opcional pero recomendado)

En la sección **Feature** → **Event Subscriptions**:

| Evento | Propósito |
|--------|-----------|
| `user.created` | Sincronizar usuarios nuevos automáticamente |
| `user.updated` | Actualizar datos de usuarios |
| `user.deleted` / `user.deactivated` | Eliminar usuarios del caché |
| `meeting.created` | Sincronizar reuniones nuevas |
| `meeting.updated` | Actualizar datos de reuniones |
| `meeting.deleted` | Eliminar reuniones del caché |
| `meeting.started` / `meeting.ended` | Tracking de reuniones activas |

**Webhook URL:** `https://<supabase-project>.supabase.co/functions/v1/zoom-webhook`

**Secret Token:** Generado por Zoom — se configura como `ZOOM_WEBHOOK_SECRET`.

---

## 3. Permisos y Scopes

### Scopes OAuth requeridos

| Scope | Propósito |
|-------|-----------|
| `user:read:admin` | Leer directorio de usuarios |
| `meeting:read:admin` | Leer reuniones de todos los usuarios |
| `meeting:write:admin` | Crear y actualizar reuniones |

> **Nota:** Los scopes `admin` son necesarios porque Minerva gestiona reuniones de **todos** los usuarios de la cuenta Zoom (no solo del usuario conectado).

---

## 4. Variables de Entorno

### Edge Functions (Supabase Dashboard → Project Settings → Edge Functions → Secrets)

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `ZOOM_CLIENT_ID` | ✅ | Client ID de la app OAuth en Zoom Marketplace |
| `ZOOM_CLIENT_SECRET` | ✅ | Client Secret de la app OAuth |
| `ZOOM_REDIRECT_URI` | ✅ | URL de callback (debe coincidir con la configurada en Zoom) |
| `ZOOM_WEBHOOK_SECRET` | ✅* | Secret Token para verificación HMAC de webhooks |
| `ZOOM_WHITELIST_EMAILS` | ❌ | Emails separados por coma que siempre se incluyen en sync (ignora filtro de rol) |
| `INTERNAL_API_KEY` | ❌ | Clave para llamadas server-to-server (cronjobs de sync) |

> *`ZOOM_WEBHOOK_SECRET` solo es requerida si se configuran webhooks.

### Variables de Supabase (ya existentes)

| Variable | Descripción |
|----------|-------------|
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave de servicio (acceso completo) |
| `SUPABASE_ANON_KEY` | Clave anónima (usada por `verifyPermission` para crear cliente del usuario) |

---

## 5. Arquitectura del Backend

```
┌────────────────────────────────────────────────────────────────┐
│                    Edge Functions (Deno)                        │
│                                                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │zoom-auth │  │zoom-api  │  │zoom-sync │  │zoom-webhook   │  │
│  │          │  │          │  │          │  │               │  │
│  │init      │  │create    │  │users     │  │HMAC verify    │  │
│  │callback  │  │update    │  │meetings  │  │user events    │  │
│  │status    │  │batch     │  │whitelist │  │meeting events │  │
│  │disconnect│  │          │  │          │  │               │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └───────┬───────┘  │
│       │              │             │                │          │
│  ┌────▼──────────────▼─────────────▼────────────────▼───────┐  │
│  │              _shared/                                     │  │
│  │  zoom-token-utils.ts  │  auth-utils.ts                    │  │
│  │  (getValidAccessToken)│  (verifyPermission/Access)        │  │
│  └───────────────────────┴───────────────────────────────────┘  │
│                          │                                      │
│  ┌───────────────────────▼───────────────────────────────────┐  │
│  │                    Supabase DB                             │  │
│  │  zoom_account │ zoom_users │ zoom_meetings │ oauth_states │  │
│  │  webhook_events │ vault.secrets                            │  │
│  └───────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

Todas las funciones se despliegan con `--no-verify-jwt` — la autenticación se maneja internamente:

| Función | Método de Auth |
|---------|---------------|
| `zoom-auth` | `verifyPermission(req, supabase, 'system.manage')` |
| `zoom-api` | `verifyPermission(req, supabase, 'meetings.create')` |
| `zoom-sync` | `verifyAccess(req, supabase, 'system.manage')` (JWT O clave interna) |
| `zoom-webhook` | Verificación de firma HMAC-SHA256 |

---

## 6. Flujo OAuth (Conexión)

```
Super Admin hace clic en "Conectar Zoom" en SystemPage
     │
     ▼
Frontend invoca Edge Function: zoom-auth { action: 'init' }
     │
     ├── verifyPermission('system.manage')
     ├── RPC: create_oauth_state(user_id) → genera estado hex de 32 bytes
     │        └── Limpia estados expirados (>10 min)
     │
     ▼
Retorna URL: https://zoom.us/oauth/authorize?
     client_id={ZOOM_CLIENT_ID}
     &response_type=code
     &redirect_uri={ZOOM_REDIRECT_URI}
     &state={state}
     │
     ▼
Frontend abre URL via Tauri plugin-opener
     │
     ▼
Usuario autoriza en Zoom → Zoom redirige a callback
     │
     ▼
Edge Function: zoom-auth/callback?code={code}&state={state}
     │
     ├── RPC: validate_oauth_state(state) → retorna user_id (uso único, se elimina)
     │
     ├── POST https://zoom.us/oauth/token
     │   Headers: Authorization: Basic(client_id:client_secret)
     │   Body: grant_type=authorization_code, code, redirect_uri
     │   → { access_token, refresh_token, expires_in, scope }
     │
     ├── GET https://api.zoom.us/v2/users/me
     │   → { id, email, display_name }
     │
     ├── RPC: store_zoom_credentials(user_id, email, name, access_token,
     │        refresh_token, scope, expires_in)
     │   └── 1. Elimina secretos antiguos del Vault
     │   └── 2. Crea nuevos secretos en Vault
     │   └── 3. Elimina filas existentes de zoom_account
     │   └── 4. Inserta nueva fila con UUIDs de secretos
     │
     ▼
Retorna HTML: "Zoom conectado exitosamente!" (o error)
     │
     ▼
Frontend detecta conexión via polling (cada 2s, máx 3 min)
```

---

## 7. Almacenamiento de Tokens (Vault)

Los tokens OAuth **nunca** se almacenan en texto plano en la base de datos.

```
Token (string)
     │
     ▼
vault.create_secret(token, name)
     │
     ├── name: "zoom_access_token_{zoom_user_id}"
     └── name: "zoom_refresh_token_{zoom_user_id}"
     │
     ▼
Retorna UUID → se almacena en zoom_account.access_token_id / .refresh_token_id
```

**Acceso a tokens descifrados:**

Solo via la vista `zoom_credentials_decrypted` que hace JOIN con `vault.decrypted_secrets`. Accesible únicamente por `service_role`.

```sql
SELECT za.id, za.zoom_user_id, za.zoom_email, za.expires_at,
       s_access.decrypted_secret AS access_token,
       s_refresh.decrypted_secret AS refresh_token
FROM zoom_account za
LEFT JOIN vault.decrypted_secrets s_access ON za.access_token_id = s_access.id
LEFT JOIN vault.decrypted_secrets s_refresh ON za.refresh_token_id = s_refresh.id;
```

---

## 8. Refresh Automático de Tokens

**Archivo:** `supabase/functions/_shared/zoom-token-utils.ts`

**Función:** `getValidAccessToken(supabase) → string`

```
1. Lee zoom_credentials_decrypted (access_token, refresh_token, expires_at)
     │
     ├── Error si no hay cuenta conectada
     │
     ▼
2. ¿expires_at > now() + 5 minutos?
     │
     ├── SÍ → retorna access_token actual
     │
     └── NO → Refresh:
              │
              ├── POST https://zoom.us/oauth/token
              │   grant_type=refresh_token
              │   refresh_token={refresh_token}
              │   Authorization: Basic(client_id:client_secret)
              │
              ├── RPC: store_zoom_credentials(nuevo access_token, nuevo refresh_token, ...)
              │
              └── Retorna nuevo access_token
```

**Buffer de seguridad:** 5 minutos (`TOKEN_BUFFER_MS = 300000`). Si el token expira en menos de 5 minutos, se renueva preventivamente.

**Usado por:** `zoom-api` y `zoom-sync` — ambas llaman `getValidAccessToken()` antes de cada petición a la API de Zoom.

---

## 9. Edge Function: zoom-auth

**Archivo:** `supabase/functions/zoom-auth/index.ts`

Gestiona el ciclo completo de OAuth 2.0: conexión, estado y desconexión.

**CORS:** Orígenes permitidos: `http://localhost:1420`, `tauri://localhost`, `http://tauri.localhost`

**Routing:** Dual — path-based (`/init`, `/callback`, etc.) Y action-based (`POST { action: '...' }`).

### Acciones

| Acción | Permiso | Descripción |
|--------|---------|-------------|
| `init` | `system.manage` | Crea estado OAuth, retorna URL de autorización |
| `callback` | Validación de estado | Intercambia code por tokens, almacena credenciales |
| `status` | `system.manage` | Retorna estado de conexión |
| `disconnect` | `system.manage` | Elimina secretos de Vault y fila de zoom_account |

### Respuestas

| Acción | Formato |
|--------|---------|
| `init` | `{ url: string }` |
| `callback` | Texto plano: "Zoom conectado exitosamente!" o mensaje de error |
| `status` | `{ connected: boolean, account?: { email, name, expires_at, connected_at } }` |
| `disconnect` | `{ success: boolean, message: string }` |

### Endpoints externos

| Endpoint | Método | Usado en |
|----------|--------|----------|
| `https://zoom.us/oauth/authorize` | GET (redirect) | `init` |
| `https://zoom.us/oauth/token` | POST | `callback` |
| `https://api.zoom.us/v2/users/me` | GET | `callback` |

### Tablas afectadas

| Tabla | Operación | Acción |
|-------|-----------|--------|
| `oauth_states` | INSERT/DELETE | `init` (create), `callback` (validate + delete) |
| `zoom_account` | READ/INSERT/DELETE | `status` (read), `callback` (insert), `disconnect` (delete) |
| `vault.secrets` | CREATE/DELETE | `callback` (create tokens), `disconnect` (delete tokens) |

---

## 10. Edge Function: zoom-api

**Archivo:** `supabase/functions/zoom-api/index.ts`

Crea y actualiza reuniones de Zoom. Soporta operaciones individuales y por lotes.

**Permiso:** `meetings.create` (nivel 60+: moderator, admin, super_admin)

### Modos de operación

| Modo | Detección | Descripción |
|------|-----------|-------------|
| **Individual** | Default (sin `batch`) | Una sola operación `create` o `update` |
| **Batch** | `{ batch: true, requests: [...] }` | Múltiples operaciones en paralelo (`Promise.allSettled`) |

### Acciones por request

| Acción | Endpoint Zoom | Método | Descripción |
|--------|---------------|--------|-------------|
| `create` | `/v2/users/me/meetings` | POST | Crea reunión nueva |
| `update` | `/v2/meetings/{meeting_id}` | PATCH | Actualiza host, hora, recurrencia, settings |

### Parámetros del request

```typescript
interface UpdateRequest {
    meeting_id: string;         // Requerido para update
    schedule_for: string;       // Email del host (requerido)
    topic?: string;
    start_time?: string;        // ISO datetime
    duration?: number;          // Minutos
    timezone?: string;          // Default: "America/Lima"
    recurrence?: {
        type: number;           // 2 = weekly
        repeat_interval?: number;
        weekly_days?: string;   // "2,3,4,5" = Mon-Thu
        end_date_time?: string;
    };
    settings?: {
        join_before_host?: boolean;
        waiting_room?: boolean;
    };
}
```

### Sincronización post-operación

Después de cada operación exitosa (create o update):

```
1. GET /v2/meetings/{meeting_id} ← obtener datos frescos
     │
     ▼
2. Upsert en tabla zoom_meetings:
   meeting_id, topic, host_id, start_time, duration,
   timezone, join_url, created_at, synced_at, last_event_timestamp
```

> **Importante:** Si la sincronización a DB falla, la operación completa se reporta como fallida al cliente, aunque la acción en Zoom sí se ejecutó.

### Respuestas

| Modo | Formato |
|------|---------|
| Individual | `{ success: boolean, error?: string }` |
| Batch | `{ batch: true, total, succeeded, failed, results: [{ meeting_id, success, error?, data? }] }` |

### Defaults de creación

| Campo | Valor default |
|-------|--------------|
| `type` | 8 (recurring fixed) |
| `duration` | 60 minutos |
| `timezone` | `"America/Lima"` |
| `settings.join_before_host` | `true` |
| `settings.waiting_room` | `true` |

---

## 11. Edge Function: zoom-sync

**Archivo:** `supabase/functions/zoom-sync/index.ts`

Sincronización completa del directorio de usuarios y reuniones de Zoom a la base de datos local.

**Auth:** `verifyAccess(req, supabase, 'system.manage')` — acepta JWT con `system.manage` **O** header `x-internal-key` (para cronjobs).

### Flujo de sincronización

```
POST → zoom-sync
     │
     ├── getValidAccessToken() → token fresco
     │
     ├── 1. Obtener usuarios
     │   └── GET /v2/users?page_size=300
     │       │
     │       ├── Filtro: excluir role_id 0 (Owner) y 1 (Admin)
     │       ├── Excepto: emails en ZOOM_WHITELIST_EMAILS siempre incluidos
     │       ├── Mantener: role_id 2 (Member)
     │       │
     │       └── Upsert a zoom_users:
     │           id, email, first_name, last_name, display_name, synced_at
     │
     ├── 2. Obtener reuniones (por usuario)
     │   └── Para cada usuario, en lotes de 10 concurrentes:
     │       GET /v2/users/{userId}/meetings?page_size=300&type=scheduled
     │       │
     │       ├── Deduplicar por meeting_id (Map)
     │       │
     │       └── Upsert a zoom_meetings:
     │           meeting_id, uuid, host_id, topic, type, start_time,
     │           duration, timezone, join_url, created_at, synced_at
     │
     └── Retorna: { success: true, users_synced: N, meetings_synced: N }
```

### Concurrencia

| Parámetro | Valor |
|-----------|-------|
| Usuarios por petición | `page_size=300` |
| Reuniones por usuario | `page_size=300` |
| Lotes concurrentes de reuniones | 10 usuarios a la vez (`BATCH_SIZE = 10`) |

### Filtro de usuarios

```
Zoom API retorna todos los usuarios
     │
     ├── role_id 0 (Owner) → EXCLUIDO (a menos que esté en whitelist)
     ├── role_id 1 (Admin) → EXCLUIDO (a menos que esté en whitelist)
     └── role_id 2 (Member) → INCLUIDO
```

**Whitelist:** Variable de entorno `ZOOM_WHITELIST_EMAILS` — lista de emails separados por coma que se incluyen sin importar su rol en Zoom.

---

## 12. Edge Function: zoom-webhook

**Archivo:** `supabase/functions/zoom-webhook/index.ts`

Receptor de eventos webhook enviados por Zoom en tiempo real.

### Autenticación HMAC

```
Headers entrantes:
  x-zm-signature: "v0=<hex_hash>"
  x-zm-request-timestamp: "<unix_timestamp>"

Verificación:
  message = "v0:{timestamp}:{body}"
  expected = "v0=" + HMAC-SHA256(ZOOM_WEBHOOK_SECRET, message).hex()

Condiciones de rechazo:
  - Timestamp fuera de ventana de 5 minutos → 401
  - Firma no coincide → 401
```

### Evento especial: validación de URL

Zoom envía `endpoint.url_validation` al configurar el webhook para verificar propiedad:

```json
// Request de Zoom
{ "event": "endpoint.url_validation", "payload": { "plainToken": "abc123" } }

// Respuesta esperada
{ "plainToken": "abc123", "encryptedToken": HMAC-SHA256(secret, "abc123").hex() }
```

### Eventos procesados

| Evento | Handler | Acción en DB |
|--------|---------|-------------|
| `user.created` | `upsertUser()` | Upsert en `zoom_users` |
| `user.updated` | `upsertUser()` | Upsert en `zoom_users` (update parcial si falta email) |
| `user.deleted` | `deleteUser()` | Delete de `zoom_users` |
| `user.deactivated` | `deleteUser()` | Delete de `zoom_users` |
| `meeting.created` | `upsertMeeting()` | Upsert en `zoom_meetings` (con protección de eventos obsoletos) |
| `meeting.updated` | `upsertMeeting()` | Upsert en `zoom_meetings` (con protección de eventos obsoletos) |
| `meeting.deleted` | `deleteMeeting()` | Delete de `zoom_meetings` |
| `meeting.started` | _(solo log)_ | Registrado en `webhook_events`, sin acción en tablas |
| `meeting.ended` | _(solo log)_ | Registrado en `webhook_events`, sin acción en tablas |

### Protección contra eventos obsoletos

Cuando `zoom-api` actualiza una reunión, hace sync inmediato a la DB (§10). Si llega un webhook posterior con datos más antiguos, podría sobrescribir datos frescos.

```
Webhook: meeting.updated (timestamp: T1)
     │
     ├── Lee zoom_meetings.last_event_timestamp (= T2)
     │
     ├── ¿T1 ≤ T2? → IGNORAR (evento obsoleto, datos más frescos ya en DB)
     │
     └── ¿T1 > T2? → Procesar y actualizar last_event_timestamp = T1
```

### Registro de eventos

**Todos** los eventos (procesados o no) se registran en `webhook_events` antes de procesar. Después del procesamiento, el evento más reciente se marca como `processed = true`.

---

## 13. Frontend: useZoomStore

**Archivo:** `src/features/matching/stores/useZoomStore.ts` (~713 líneas)

Store principal de Zustand que gestiona datos de Zoom, el Web Worker de matching, y operaciones batch.

### Estado

| Campo | Tipo | Valor Inicial | Descripción |
|-------|------|--------------|-------------|
| `meetings` | `ZoomMeetingCandidate[]` | `[]` | Todas las reuniones de Zoom |
| `users` | `ZoomUser[]` | `[]` | Todos los usuarios de Zoom |
| `matchResults` | `MatchResult[]` | `[]` | Resultados de la última corrida de matching |
| `activeMeetingIds` | `string[]` | `[]` | IDs de reuniones actualmente en curso |
| `isSyncing` | `boolean` | `false` | Sync en progreso |
| `syncProgress` | `number` | `0` | Progreso 0–100 |
| `syncError` | `string \| null` | `null` | Último error de sync |
| `lastSyncedAt` | `string \| null` | `null` | Timestamp ISO del último sync |
| `isLoadingData` | `boolean` | `false` | Carga de datos en progreso |
| `isInitialized` | `boolean` | `false` | `true` después de la primera carga |
| `isExecuting` | `boolean` | `false` | Operación batch en progreso |
| `worker` | `Worker \| null` | `null` | Instancia del Web Worker |

### Acciones principales

| Acción | Descripción |
|--------|-------------|
| `fetchZoomData(options?)` | Carga datos de `zoom_meetings` y `zoom_users` paginado (1000/pág). Deduplicación de llamadas concurrentes |
| `fetchActiveMeetings()` | RPC `get_active_meetings` → IDs de reuniones activas |
| `triggerSync()` | Invoca Edge Function `zoom-sync` → recarga datos |
| `runMatching(schedules)` | Envía horarios al Web Worker para matching |
| `resolveConflict(schedule, meeting)` | Asignación manual de una reunión a un horario |
| `executeAssignments(schedules?)` | Envía actualizaciones batch a Zoom |
| `createMeetings(items, options?)` | Crea reuniones nuevas en batch |
| `updateMatchings(updates)` | Actualiza reuniones existentes en batch |

### Ciclo de vida del Worker

```
fetchZoomData() → éxito
     │
     ▼
_initWorker(meetings, users)
     │
     ├── Termina worker anterior (si existe)
     ├── Crea nuevo Worker (match.worker.ts, ESM)
     ├── Worker.postMessage({ type: 'INIT', meetings, users })
     │       └── Worker crea MatchingService + índices Fuse.js
     │
     ▼
Worker listo → escucha mensajes:
     │
     ├── runMatching(schedules)
     │   └── postMessage({ type: 'MATCH', schedules })
     │       └── Worker responde: { type: 'MATCH_RESULT', results }
     │
     └── Error → { type: 'ERROR', error }
```

### Deduplicación de fetchZoomData

```typescript
// Previene múltiples fetches concurrentes
if (_activeFetchPromise && !force) return _activeFetchPromise;
if (_activeFetchPromise && force) await _activeFetchPromise; // espera y luego re-fetch
```

---

## 14. Frontend: Flujo de UI

### ZoomIntegration.tsx — Panel de administración

**Archivo:** `src/features/system/components/ZoomIntegration.tsx`

**Acceso:** Solo visible para `super_admin` (nivel 100) — envuelto en `RequirePermission level={100}`.

#### Estados de UI

| Estado | Componentes visibles |
|--------|---------------------|
| **No conectado** | Tarjeta con indicador gris, botón "Conectar Zoom" |
| **Conectando** | Botón "Cancelar" + indicador de espera (polling) |
| **Conectado** | Indicador verde, email de cuenta, botones "Sincronizar" y "Desconectar" |

#### Flujo de conexión

```
"Conectar Zoom"
     │
     ├── Invoca zoom-auth { action: 'init' } → URL
     ├── openUrl(URL) via Tauri plugin-opener
     │
     ▼
Polling cada 2s (máximo 3 minutos):
     │
     ├── Invoca zoom-auth { action: 'status' }
     │   └── ¿connected = true? → Actualiza UI, detiene polling
     │
     └── Timeout (3 min) → Muestra error, detiene polling
```

#### Flujo de desconexión

```
"Desconectar" → AlertDialog de confirmación
     │
     ├── Invoca zoom-auth { action: 'disconnect' }
     └── Limpia estado local (account = null)
```

### GlobalSyncManager.tsx — Carga automática

**Archivo:** `src/features/system/components/GlobalSyncManager.tsx`

```
Componente invisible, montado en cada ruta autenticada
     │
     ├── Si profile.hierarchy_level >= 60 (moderator+):
     │   └── Llama fetchZoomData() una sola vez (ref: hasSynced)
     │
     └── También sincroniza tema desde SettingsProvider
```

---

## 15. Operaciones Batch (Crear/Actualizar Reuniones)

### Configuración de chunks

| Parámetro | Valor | Razón |
|-----------|-------|-------|
| `CHUNK_SIZE` | 30 | Límite de rate de la API de Zoom |
| `DELAY_BETWEEN_CHUNKS_MS` | 3500 ms | Evita errores 429 (Too Many Requests) |

### Flujo de procesamiento

```
Array de requests (N items)
     │
     ▼
Dividir en chunks de 30
     │
     ▼
Para cada chunk:
     ├── supabase.functions.invoke('zoom-api', {
     │       body: { batch: true, requests: chunk }
     │   })
     │
     ├── zoom-api procesa con Promise.allSettled
     │   └── Cada request: create/update + sync a DB
     │
     ├── Agregar resultados: succeeded, failed, errors
     │
     └── Esperar 3500ms antes del siguiente chunk
```

### Tipos de reuniones creadas

| Modo | `type` Zoom | Duración | Recurrencia |
|------|------------|----------|-------------|
| **Recurrente** (default) | 8 (recurring fixed) | 60 min | Semanal: Lun-Jue + día del horario, +120 días |
| **Diario** (`dailyOnly: true`) | 2 (scheduled) | 45 min | Sin recurrencia (única) |

### Recurrencia default

```typescript
{
    type: 2,                    // Weekly
    repeat_interval: 1,         // Cada semana
    weekly_days: "2,3,4,5,{N}", // Lun(2)-Jue(5) + día del schedule
    end_date_time: "+120 días"  // ~4 meses
}
```

### Settings default

```typescript
{
    join_before_host: true,
    waiting_room: true
}
```

---

## 16. Conexión con el Motor de Matching

### Flujo de datos completo

```
zoom-sync / zoom-webhook
     │
     ▼
DB: zoom_meetings + zoom_users
     │
     ▼
useZoomStore.fetchZoomData() → meetings[] + users[]
     │
     ▼
_initWorker(meetings, users)
     │
     ▼
Web Worker: MatchingService(meetings, users)
     │
     ├── Construye Fuse.js indexes (fuzzy search)
     ├── Construye diccionario normalizado (exact search)
     │
     ▼
runMatching(schedules) → 3-tier search + 10 penalties
     │
     ├── Resultados: assigned, to_update, ambiguous, not_found
     │
     ├── to_update → executeAssignments() → zoom-api (batch PATCH)
     │
     └── not_found → createMeetings() → zoom-api (batch POST)
```

### Estados de match y acciones

| Estado | Significado | Acción disponible |
|--------|-------------|-------------------|
| `assigned` | Match correcto, host coincide | Ninguna (ya asignado) |
| `to_update` | Match encontrado pero host ≠ instructor | `executeAssignments` → PATCH meeting |
| `ambiguous` | Score bajo o candidatos muy similares | `resolveConflict` → selección manual |
| `not_found` | Sin candidatos viables | `createMeetings` → POST new meeting |
| `manual` | Resuelto manualmente por el usuario | `executeAssignments` → PATCH meeting |

> **Documentación detallada del algoritmo de matching:** `docs/matching_logic.md`

---

## 17. Esquema de Base de Datos

### Tablas

#### `zoom_account` — Cuenta OAuth (singleton)

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | `UUID PK` | `gen_random_uuid()` |
| `zoom_user_id` | `TEXT NOT NULL` | ID del usuario en Zoom |
| `zoom_email` | `TEXT NOT NULL` | Email del usuario conectado |
| `zoom_name` | `TEXT` | Nombre de display |
| `access_token_id` | `UUID NOT NULL` | Referencia a `vault.secrets.id` |
| `refresh_token_id` | `UUID NOT NULL` | Referencia a `vault.secrets.id` |
| `token_type` | `TEXT DEFAULT 'Bearer'` | |
| `scope` | `TEXT` | Scopes OAuth otorgados |
| `expires_at` | `TIMESTAMPTZ NOT NULL` | Expiración del access token |
| `connected_at` | `TIMESTAMPTZ DEFAULT now()` | Fecha de conexión |
| `updated_at` | `TIMESTAMPTZ DEFAULT now()` | Última actualización |

> **Singleton:** Índice `UNIQUE ON ((true))` — solo puede existir una fila. Si se conecta otra cuenta, reemplaza la anterior.

**RLS:** Solo `service_role` — acceso completo.

#### `zoom_users` — Directorio de usuarios Zoom

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | `TEXT PK` | ID de Zoom (no UUID) |
| `email` | `TEXT NOT NULL` | |
| `first_name` | `TEXT` | |
| `last_name` | `TEXT` | |
| `display_name` | `TEXT` | |
| `created_at` | `TIMESTAMPTZ` | |
| `synced_at` | `TIMESTAMPTZ DEFAULT now()` | |

**RLS:** `SELECT` para `authenticated` con permiso `meetings.search`; `service_role` acceso completo.

#### `zoom_meetings` — Reuniones Zoom cacheadas

| Columna | Tipo | Notas |
|---------|------|-------|
| `meeting_id` | `TEXT PK` | ID de Zoom (string) |
| `uuid` | `TEXT` | UUID de Zoom |
| `host_id` | `TEXT NOT NULL` | Referencia conceptual a `zoom_users.id` |
| `topic` | `TEXT` | Título de la reunión |
| `type` | `INTEGER` | 2 = scheduled, 8 = recurring fixed |
| `start_time` | `TIMESTAMPTZ` | |
| `duration` | `INTEGER` | Minutos |
| `timezone` | `TEXT` | |
| `join_url` | `TEXT` | |
| `created_at` | `TIMESTAMPTZ` | |
| `synced_at` | `TIMESTAMPTZ DEFAULT now()` | |
| `last_event_timestamp` | `BIGINT` | Para protección de eventos obsoletos |

**RLS:** Misma política que `zoom_users` — `meetings.search` para SELECT.

#### `oauth_states` — Estados OAuth temporales

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | `UUID PK` | |
| `state` | `TEXT NOT NULL UNIQUE` | Hex aleatorio de 32 bytes |
| `user_id` | `UUID NOT NULL` | FK → `auth.users(id) ON DELETE CASCADE` |
| `created_at` | `TIMESTAMPTZ DEFAULT now()` | |
| `expires_at` | `TIMESTAMPTZ NOT NULL` | 10 minutos desde creación |

> **Compartida** con Microsoft — ambas integraciones usan la misma tabla de estados OAuth.

**RLS:** Solo `service_role`.

#### `webhook_events` — Log de webhooks

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | `UUID PK` | |
| `event_type` | `TEXT NOT NULL` | ej: `meeting.updated` |
| `payload` | `JSONB NOT NULL` | Payload completo del webhook |
| `processed` | `BOOLEAN DEFAULT false` | |
| `created_at` | `TIMESTAMPTZ DEFAULT now()` | |
| `processed_at` | `TIMESTAMPTZ` | |

**RLS:** Solo `service_role`.

### Vistas

| Vista | Propósito | Acceso |
|-------|-----------|--------|
| `zoom_credentials_decrypted` | JOIN de `zoom_account` con `vault.decrypted_secrets` para exponer tokens descifrados | Solo `service_role` |

### RPCs relacionadas

| Función | Parámetros | Retorna | Descripción |
|---------|-----------|---------|-------------|
| `create_oauth_state` | `p_user_id UUID` | `TEXT` (state) | Genera estado hex, limpia expirados, inserta con TTL de 10 min |
| `validate_oauth_state` | `p_state TEXT` | `UUID` (user_id) | Verifica y elimina estado (uso único). Error si expirado/inválido |
| `store_zoom_credentials` | 7 params (user_id, email, name, tokens, scope, expires_in) | `VOID` | Atómica: elimina secretos antiguos, crea nuevos, singleton upsert |
| `delete_zoom_secrets` | `p_secret_ids UUID[]` | `VOID` | Elimina secretos del Vault por array de IDs |
| `get_active_meetings` | _(ninguno)_ | `TABLE(meeting_id TEXT)` | Últimos webhook events → reuniones con `started` más reciente que `ended` |
| `cleanup_old_webhook_events` | `days_to_keep INT DEFAULT 30` | `INT` (eliminados) | Limpia eventos antiguos |

### Índices

| Tabla | Índice | Tipo |
|-------|--------|------|
| `zoom_account` | `idx_zoom_account_single` | UNIQUE ON `((true))` — fuerza singleton |
| `oauth_states` | `idx_oauth_states_expires` | B-tree en `expires_at` |
| `webhook_events` | `idx_webhook_events_event_type` | B-tree |
| `webhook_events` | `idx_webhook_events_created_at` | B-tree DESC |

---

## 18. Permisos de Usuario

| Acción | Permiso requerido | Nivel mínimo |
|--------|-------------------|-------------|
| Conectar/desconectar cuenta Zoom | `system.manage` | 100 (super_admin) |
| Sincronizar datos (zoom-sync) | `system.manage` | 100 (super_admin) |
| Ver datos de Zoom (meetings, users) | `meetings.search` | 60 (moderator) |
| Crear reuniones (zoom-api) | `meetings.create` | 60 (moderator) |
| Actualizar reuniones (zoom-api) | `meetings.create` | 60 (moderator) |
| Ejecutar matching automático | `meetings.search` | 60 (moderator) |
| Carga automática de datos (GlobalSyncManager) | _(hierarchy_level ≥ 60)_ | 60 (moderator) |
| Recibir webhooks | _(sin auth de usuario)_ | N/A (HMAC) |

---

## 19. Troubleshooting

### Token expirado / Refresh fallido

Si el refresh token de Zoom expira (por inactividad prolongada), la siguiente operación que llame `getValidAccessToken()` fallará. **Solución:** Desconectar y reconectar la cuenta Zoom desde SystemPage.

### Error 429: Too Many Requests

Las operaciones batch usan chunks de 30 con delay de 3.5s para respetar los rate limits de Zoom. Si siguen apareciendo errores 429:
- Verificar que no hay otros sistemas usando la misma cuenta OAuth
- Considerar reducir `CHUNK_SIZE` a 20

### Webhook firma inválida (401)

- Verificar que `ZOOM_WEBHOOK_SECRET` coincide con el Secret Token en Zoom App Marketplace
- Verificar que el timestamp del servidor no está desincronizado (ventana de 5 min)

### Datos desactualizados

Si los datos de reuniones no coinciden con Zoom:
1. **Sync manual:** Botón "Sincronizar" en ZoomIntegration (invoca `zoom-sync`)
2. **Webhooks:** Verificar que están configurados y activos en Zoom Marketplace
3. **Protección de eventos obsoletos:** Si `zoom-api` actualizó una reunión, los webhooks más antiguos se ignoran automáticamente

### Usuarios faltantes en sync

Por defecto, `zoom-sync` excluye Owners (role_id 0) y Admins (role_id 1). Si un usuario admin necesita aparecer en Minerva:
- Agregar su email a `ZOOM_WHITELIST_EMAILS` (separado por coma)

### `append-rows` fantasma

A diferencia de Microsoft Graph, la API de Zoom no tiene una acción equivalente sin handler. Todas las acciones de `zoom-api` (`create`, `update`) tienen handlers completos.

### Reuniones activas no detectadas

La función `get_active_meetings` depende de eventos `meeting.started` y `meeting.ended` en `webhook_events`. Si los webhooks de estos eventos no están configurados en Zoom Marketplace, la detección de reuniones activas no funcionará.

### Webhook con datos incompletos (reunión no aparece en DB)

El webhook de Zoom **no siempre envía todos los campos** en eventos de actualización (`meeting.updated`). Si una reunión no aparece en la base de datos después de una actualización vía webhook, es posible que el payload careciera de datos suficientes para el upsert. **Solución:** Actualizar el nombre (topic) del programa/reunión desde Zoom — esto genera un nuevo evento `meeting.updated` con datos completos que el webhook procesará correctamente y la reunión quedará visible en la DB.

### Reunión eliminada por webhook

Cuando Zoom envía un evento `meeting.deleted`, el webhook elimina automáticamente la reunión de `zoom_meetings`. **No existe opción de eliminar reuniones desde Minerva** — toda eliminación proviene de la cuenta principal de Zoom.

Si una reunión fue eliminada pero sabes que aún existe:
1. Ir a la cuenta de Zoom → sección **"Eliminado recientemente"** para verificar su existencia
2. Restaurar la reunión desde Zoom si fue eliminada por error
3. Ejecutar un **sync manual** desde SystemPage para que vuelva a aparecer en Minerva
4. Si tras restaurar y sincronizar la reunión **no aparece**, actualizar el nombre (topic) de la reunión desde Zoom para forzar un evento `meeting.updated` con datos completos, y luego refrescar la tabla en la que se está consultando

> **Nota sobre posible mejora futura:** Se podría agregar un campo `deleted_at` (soft delete) para evitar la eliminación automática y preservar el historial de reuniones. Sin embargo, esto afectaría el flujo actual de matching y sincronización (reuniones "eliminadas" seguirían apareciendo como candidatas), por lo que de momento se mantiene el comportamiento de eliminación directa.
