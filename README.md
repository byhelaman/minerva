# Minerva v2

Aplicación de escritorio (Tauri 2) para gestión de horarios educativos con emparejamiento automático de reuniones Zoom e integración con OneDrive.

**Stack:** React 19 · TypeScript 5.9 · Vite 7 · Tauri 2 (Rust) · Supabase (PostgreSQL + Edge Functions) · Zustand 5  
**Versión actual:** 0.1.9  
**Idiomas:** English, Español, Français (i18next)

## Requisitos

- Node.js 18+ / pnpm
- Rust (para Tauri 2)
- Cuenta Supabase (PostgreSQL + Edge Functions)

## Instalación Local

```bash
git clone <url> && cd minerva
pnpm install
cp .env.example .env   # Configurar credenciales Supabase
pnpm tauri dev          # Desarrollo completo (Vite + ventana nativa)
```

### Comandos

```bash
pnpm dev                # Solo Vite dev server (puerto 1420)
pnpm tauri dev          # Desarrollo completo (Vite + ventana nativa)
pnpm build              # tsc && vite build
pnpm tauri build        # Build producción (MSI/NSIS → src-tauri/target/release/)
pnpm test               # Vitest watch mode
pnpm test:run           # Vitest single run
pnpm tsc --noEmit       # Type-check (no hay script de lint)
```

## Configuración Supabase

### 1. Crear Proyecto

1. Ir a [supabase.com](https://supabase.com) y crear un nuevo proyecto
2. Copiar la URL y anon key al archivo `.env`

### 2. Ejecutar Migraciones (en orden)

Ejecutar cada archivo en el **SQL Editor** de Supabase:

| Orden | Archivo | Descripción |
|-------|---------|-------------|
| 1 | `001_core_access.sql` | Tablas core (roles, permisos) y datos semilla |
| 2 | `002_user_management.sql` | Perfiles, RPCs de gestión de usuarios |
| 3 | `003_zoom_integration.sql` | Tablas de integración Zoom (OAuth, meetings, users) |
| 4 | `004_webhooks_bug_reports.sql` | Webhooks y reportes de bugs |
| 5 | `005_realtime_security.sql` | Políticas Realtime y seguridad |
| 6 | `006_microsoft_integration.sql` | Integración Microsoft (OneDrive, Vault) |
| 7 | `008_published_schedules.sql` | Horarios publicados |
| 8 | `009_schedule_entries.sql` | Entradas de horarios individuales |
| 9 | `012_delete_zoom_secrets.sql` | RPC para eliminar secretos Zoom del Vault |
| 10 | `013_verify_user_password.sql` | RPC verificación de contraseña |
| 11 | `014_reports_manage_permission.sql` | Permiso reports.manage |
| 12 | `015_delete_microsoft_secrets.sql` | RPC para eliminar secretos Microsoft del Vault |
| 13 | `016_update_microsoft_credentials_view.sql` | Fix vista de credenciales Microsoft |

### 3. Habilitar Auth Hook

1. **Dashboard → Authentication → Hooks**
2. Buscar **"Customize Access Token (JWT) Claims"**
3. Seleccionar schema `public`, función `custom_access_token_hook`
4. Guardar

### 4. Configurar Email Templates (OTP)

En **Dashboard → Authentication → Email Templates**:

#### Reset Password
```html
<h2>Reset Password</h2>
<p>Use this code to reset your password:</p>
<p style="font-size: 32px; font-weight: bold; letter-spacing: 8px; padding: 16px;">{{ .Token }}</p>
<p>This code expires in 1 hour.</p>
```

#### Confirm Signup
```html
<h2>Confirm your signup</h2>
<p>Use this code to verify your email address:</p>
<p style="font-size: 32px; font-weight: bold; letter-spacing: 8px; padding: 16px;">{{ .Token }}</p>
<p>This code expires in 24 hours.</p>
```

## Sistema de Roles

| Rol | Nivel | Permisos clave |
|-----|-------|----------------|
| viewer | 10 | Lectura de horarios propios |
| operator | 50 | CRUD horarios, búsqueda Zoom |
| admin | 80 | Gestión de usuarios, publicar horarios, reportes |
| super_admin | 100 | Control total, integraciones (Zoom, OneDrive) |

## Integraciones

### Zoom 🎥
Conexión de cuenta Zoom para creación, sincronización y emparejamiento automático de reuniones.
- OAuth 2.0 Server-to-Server con tokens en Supabase Vault
- Sync de usuarios y meetings → emparejamiento automático con horarios
- Documentación detallada: [`docs/matching_logic.md`](docs/matching_logic.md)

### Microsoft OneDrive 📎
Conexión de cuenta Microsoft para lectura/escritura directa de archivos Excel en OneDrive.
- OAuth 2.0 Authorization Code Flow (server-side)
- Tokens cifrados en Supabase Vault
- Navegador visual de carpetas/archivos
- Documentación detallada: [`docs/microsoft_setup.md`](docs/microsoft_setup.md)

## Variables de Entorno

```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJxxxx...
```

Para integraciones (Supabase Edge Functions):
```bash
supabase secrets set ZOOM_ACCOUNT_ID="..."
supabase secrets set ZOOM_CLIENT_ID="..."
supabase secrets set ZOOM_CLIENT_SECRET="..."
supabase secrets set MS_CLIENT_ID="..."
supabase secrets set MS_CLIENT_SECRET="..."
supabase secrets set MS_REDIRECT_URI="https://<ref>.supabase.co/functions/v1/microsoft-auth/callback"
```

## Build de Producción

```bash
pnpm tauri build
```

Genera instaladores en `src-tauri/target/release/bundle/` (MSI + NSIS). Releases automáticos via GitHub Actions al crear tags `v*`.

## Seguridad

- RLS en todas las tablas con políticas basadas en `auth.jwt()`
- JWT Custom Claims inyectados por Auth Hook (sin queries extra)
- Prevención de escalación de privilegios via trigger
- Tokens de integraciones cifrados en Supabase Vault
- Acceso a FS sandboxed + diálogos nativos (Tauri)
- SECURITY DEFINER con search_path seguro en todas las funciones

## Documentación

| Archivo | Contenido |
|---------|-----------|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Arquitectura completa del proyecto |
| [`docs/USER_FLOWS.md`](docs/USER_FLOWS.md) | Flujos de usuario y matriz de permisos |
| [`docs/AUTH_SYSTEM.md`](docs/AUTH_SYSTEM.md) | Sistema de autenticación y sesiones |
| [`docs/EXCEL_SYSTEM.md`](docs/EXCEL_SYSTEM.md) | Parser Excel, schemas, validación |
| [`docs/SUPABASE_BACKEND.md`](docs/SUPABASE_BACKEND.md) | Edge Functions, migraciones, esquema DB |
| [`docs/matching_logic.md`](docs/matching_logic.md) | Motor de emparejamiento Zoom |
| [`docs/microsoft_setup.md`](docs/microsoft_setup.md) | Integración Microsoft/OneDrive |
| [`docs/release_guide.md`](docs/release_guide.md) | Guía de release y CI/CD |

## Troubleshooting

### Error "Invalid JWT" (401) en sincronización
Las Edge Functions usan auth interna. Desplegar con `--no-verify-jwt`:
```bash
supabase functions deploy zoom-sync --no-verify-jwt
```

### Error "Failed to refresh Zoom token" (400)
El refresh token se invalida al conectar las mismas credenciales en otro entorno. Solución: desconectar y reconectar Zoom desde la UI.

### Más problemas
Ver sección de troubleshooting en [`docs/microsoft_setup.md`](docs/microsoft_setup.md) y [`docs/SUPABASE_BACKEND.md`](docs/SUPABASE_BACKEND.md).
