# Minerva v2 — Sistema de Autenticación

> Documentación completa del sistema de autenticación: AuthProvider, sesión de escritorio, JWT claims, rate limiter y componentes de login.  
> Última actualización: 2026-02-06

---

## Tabla de Contenidos

1. [Visión General](#1-visión-general)
2. [AuthProvider](#2-authprovider)
3. [Cliente Supabase](#3-cliente-supabase)
4. [ProtectedRoute](#4-protectedroute)
5. [Rate Limiter](#5-rate-limiter)
6. [Componentes de Autenticación](#6-componentes-de-autenticación)
7. [Constantes y Almacenamiento](#7-constantes-y-almacenamiento)
8. [Diagrama de Seguridad](#8-diagrama-de-seguridad)

---

## 1. Visión General

```
┌─────────────────────────────────────────────────────────────┐
│                     Flujo de Autenticación                  │
│                                                             │
│  LoginPage ──→ AuthProvider.signIn()                        │
│                     │                                       │
│                     ├── supabase.auth.signInWithPassword()  │
│                     │                                       │
│                     ▼                                       │
│              onAuthStateChange(SIGNED_IN)                    │
│                     │                                       │
│                     ├── jwtDecode(access_token)             │
│                     │   └── { user_role, hierarchy_level,   │
│                     │         permissions[] }               │
│                     │                                       │
│                     ├── verifyUserExists (RPC)              │
│                     │                                       │
│                     ▼                                       │
│              Profile establecido → isLoading = false         │
│                     │                                       │
│                     ▼                                       │
│              ProtectedRoute renderiza hijos                  │
│              └── GlobalSyncManager ejecuta                   │
└─────────────────────────────────────────────────────────────┘
```

**Puntos clave:**
- JWT custom claims para roles y permisos (inyectados por `custom_access_token_hook` en PostgreSQL)
- Perfil extraído **completamente del JWT** — no requiere RPC adicional para carga de perfil
- Sesión de escritorio: PKCE + localStorage + refresh proactivo ligado a visibilidad de ventana
- Rate limiter progresivo con backoff exponencial en el login

---

## 2. AuthProvider

**Archivo:** `src/components/auth-provider.tsx`

### Interfaces

```typescript
interface Profile {
    id: string;
    email: string;
    display_name: string | null;
    role: string;              // "viewer" | "operator" | "moderator" | "admin" | "super_admin"
    hierarchy_level: number;   // 0 | 10 | 50 | 60 | 80 | 100
    permissions: string[];     // ["schedules.read", "schedules.write", ...]
}

interface JWTClaims {
    user_role?: string;        // Custom claim (renombrado de 'role' para evitar conflicto PostgreSQL)
    hierarchy_level?: number;
    permissions?: string[];    // Desde tabla role_permissions
    sub: string;
    email?: string;
}
```

### Métodos expuestos via Context

| Método | Firma | Descripción |
|--------|-------|-------------|
| `signIn` | `(email, password) → { error }` | Login con contraseña |
| `signUp` | `(email, password, displayName?) → { error }` | Registro (dispara email OTP) |
| `signOut` | `() → void` | Limpia localStorage, resetea Zustand sync store, cierra toasts, llama `supabase.auth.signOut()` |
| `hasPermission` | `(permission) → boolean` | Verifica `profile.permissions.includes(permission)` |
| `isAdmin` | `() → boolean` | `hierarchy_level >= 80` |
| `isSuperAdmin` | `() → boolean` | `hierarchy_level >= 100` |
| `sendResetPasswordEmail` | `(email) → { error }` | Envía email de restablecimiento |
| `verifyOtp` | `(email, token, type) → { data, error }` | Verifica OTP (`"email"` \| `"signup"` \| `"recovery"`) |
| `updatePassword` | `(password) → { error }` | Actualiza contraseña del usuario |
| `updateDisplayName` | `(displayName) → { error }` | Tres pasos: RPC → updateUser → refreshSession → extraer perfil |
| `refreshProfile` | `() → void` | `refreshSession()` luego `extractProfileFromSession()` |
| `verifyCurrentPassword` | `(password) → { error }` | RPC `verify_user_password` — sin efectos de sesión |

**Estado:** `session`, `user`, `profile`, `isLoading`

### Extracción de perfil desde JWT

```typescript
function extractProfileFromSession(session) {
    const claims = jwtDecode<JWTClaims>(session.access_token);

    return {
        id: session.user.id,
        email: session.user.email,
        display_name: session.user.user_metadata?.display_name,
        role: claims.user_role ?? "viewer",               // Default seguro
        hierarchy_level: claims.hierarchy_level ?? 0,      // Default seguro
        permissions: claims.permissions ?? ["schedules.read"]  // Default seguro
    };
}
```

> **Resilencia:** Si el decode del JWT falla, se aplican defaults seguros (rol `viewer`, nivel 0, solo permiso `schedules.read`). Esto previene bloqueos por tokens malformados.

### Manejo de eventos de autenticación

| Evento | Comportamiento |
|--------|---------------|
| `INITIAL_SESSION` | Si hay sesión: verifica usuario en tabla `profiles` (health check). Si fue eliminado → force sign out. Si no hay sesión → profile null, fin de loading |
| `SIGNED_IN` | Procesa sesión (establece session/user/profile) |
| `TOKEN_REFRESHED` | Procesa sesión |
| `PASSWORD_RECOVERY` | Procesa sesión |
| `USER_UPDATED` | Procesa sesión |
| `SIGNED_OUT` | Limpia todo el estado |
| Default | Log del evento no manejado, actualiza session/user si presente |

### Suscripción Realtime al perfil

El AuthProvider se suscribe a cambios en la tabla `profiles` filtrada por `id=eq.{userId}`:

| Evento Realtime | Acción |
|-----------------|--------|
| `DELETE` | Force sign out (usuario eliminado por admin) |
| `UPDATE` | Si el rol cambió → `refreshSession()` para obtener JWT con claims actualizados |

Esto permite que un admin cambie el rol de un usuario conectado y el efecto se aplique **sin que el usuario cierre sesión**.

### Limpieza en sign out

Al cerrar sesión, se limpian:
- Claves localStorage: `current_schedule_version`, `dismissed_schedule_versions`, `minerva_connection_config`
- Todas las claves con prefijo `minerva_ui_*`
- Callbacks registrados vía `registerSignOutCleanup()` (patrón callback registry — desacoplado de features)
- Toasts activos: `toast.dismiss()`

---

## 3. Cliente Supabase

**Archivo:** `src/lib/supabase.ts`

### Configuración

| Parámetro | Valor | Razón |
|-----------|-------|-------|
| URL | `import.meta.env.VITE_SUPABASE_URL` | Variable de entorno |
| Key | `import.meta.env.VITE_SUPABASE_ANON_KEY` | Variable de entorno |
| `persistSession` | `true` | Sobrevive cierres de app (localStorage) |
| `autoRefreshToken` | `true` | Auto-refresh de JWT antes de expirar |
| `detectSessionInUrl` | `false` | App de escritorio — sin redirects OAuth en URL |
| `storageKey` | `"minerva-auth-token"` | Clave personalizada para evitar conflictos |
| `storage` | `localStorage` | Default para Tauri |
| `flowType` | `"pkce"` | Flujo más seguro |

**Headers globales:** `x-app-name: "minerva-desktop"`, `x-app-version` desde env

> Lanza error si `VITE_SUPABASE_URL` o `VITE_SUPABASE_ANON_KEY` no están definidos.

### Sistema de refresh proactivo de tokens

El módulo exporta `startSessionRefresh()` y `stopSessionRefresh()` que controlan `supabase.auth.startAutoRefresh()` / `stopAutoRefresh()`.

**Trigger por visibilidad de ventana:**

```
Ventana visible (visibilitychange)
     │
     ├── Inicia auto-refresh
     ├── Verifica si token expira dentro de 5 min
     │   └── SÍ → llama refreshSession() proactivamente
     │
     └── Ventana oculta → detiene auto-refresh

focus / blur → mismo comportamiento (backup)
```

**Carga inicial:** `startSessionRefresh()` se ejecuta inmediatamente.

**Control de duplicados:** Variable interna `isAutoRefreshActive` previene llamadas start/stop duplicadas.

---

## 4. ProtectedRoute

**Archivo:** `src/components/ProtectedRoute.tsx`

### Secuencia de verificación

```
1. isLoading? → Spinner de pantalla completa (animate-spin)
2. !user?     → Navigate to="/login" con state.from para redirect-back
3. ¿Falta permiso requerido? → Navigate to="/" (home)
4. ¿Nivel insuficiente?       → Navigate to="/" (home)
5. Todo OK → renderizar children
```

### Wrappers de conveniencia

| Componente | Equivale a |
|------------|-----------|
| `AdminRoute` | `<ProtectedRoute requiredLevel={80}>` |
| `SuperAdminRoute` | `<ProtectedRoute requiredLevel={100}>` |

---

## 5. Rate Limiter

**Archivo:** `src/lib/rate-limiter.ts`

### Diseño

Algoritmo de **bloqueo progresivo con backoff exponencial** almacenado en localStorage.

### Constantes

| Constante | Valor |
|-----------|-------|
| `MAX_ATTEMPTS` | 5 intentos |
| `LOCKOUT_DURATION` | 30 segundos (base) |
| `LOCKOUT_MULTIPLIER` | 2 (se duplica cada vez) |

### Estado almacenado

```typescript
// localStorage key: "minerva_rate_limit"
{
    attempts: number;        // Intentos fallidos acumulados
    lockoutUntil: number | null;  // Timestamp UNIX de fin de bloqueo
    lockoutCount: number;    // Cantidad de bloqueos anteriores
}
```

### Funciones exportadas

| Función | Descripción |
|---------|-------------|
| `isLockedOut()` | Retorna `{ locked: boolean, remainingSeconds: number }`. Limpia bloqueos expirados. |
| `recordFailedAttempt()` | Incrementa intentos. A los `MAX_ATTEMPTS`, establece `lockoutUntil = now + (30 × 2^lockoutCount)` segundos. Retorna `true` si se bloqueó. |
| `resetAttempts()` | Resetea todo a cero — se llama al hacer login exitoso. |
| `getRemainingAttempts()` | `max(0, 5 - attempts)` |

### Progresión de bloqueo

| Bloqueo # | Duración |
|-----------|----------|
| 1° | 30 segundos |
| 2° | 60 segundos |
| 3° | 120 segundos |
| 4° | 240 segundos |
| n° | `30 × 2^(n-1)` segundos |

---

## 6. Componentes de Autenticación

### 6.1 LoginPage

**Archivo:** `src/features/auth/components/LoginPage.tsx`

- Formulario con email + contraseña
- **Schema Zod:** `{ email: z.string().email(), password: z.string().min(1) }`
- **React Hook Form** con `zodResolver`
- Pre-rellena email desde `localStorage.minerva_auth_last_email`
- **Integración con rate limiter:**
  - Verifica bloqueo antes de enviar
  - Registra intentos fallidos
  - Muestra intentos restantes debajo de 5
  - Muestra cuenta regresiva en texto del botón durante bloqueo
- Detecta error "email no confirmado" → abre `SignupDialog` en modo OTP con `pendingEmailForOtp`
- Login exitoso: guarda email en localStorage, resetea rate limiter, navega a `from` location
- Botón "Login con Google" deshabilitado (próximamente)

### 6.2 SignupDialog

**Archivo:** `src/features/auth/components/SignupDialog.tsx`

Diálogo de dos pasos: `"form"` → `"otp"`

**Paso 1 — Formulario:**
- Schema: `{ name: min(1), email: email(), password: min(8), confirmPassword: min(1) }` con `.refine()` para match de contraseñas
- Llama `signUp(email, password, name)` → avanza a paso OTP

**Paso 2 — OTP:**
- Schema: `{ otp: min(6) }`
- Componente `InputOTP` con 6 slots
- Verificación: `verifyOtp(email, otp, "signup")` → navega a `/`
- Cuenta regresiva de 30s para reenvío
- Reenviar dispara otra llamada `signUp()`

**Props especiales:** `initialEmail`, `initialStep` — para entrada directa a OTP desde LoginPage

### 6.3 ForgotPasswordDialog

**Archivo:** `src/features/auth/components/ForgotPasswordDialog.tsx`

Diálogo de tres pasos: `"email"` → `"otp"` → `"password"`

| Paso | Schema | Acción |
|------|--------|--------|
| Email | `z.string().email()` | `sendResetPasswordEmail(email)` |
| OTP | `z.string().min(6)` | `verifyOtp(email, otp, "recovery")` |
| Contraseña | `{ password: min(8), confirmPassword }` con refine | `updatePassword(password)` → `refreshProfile()` |

- Toast de advertencia si se cierra el diálogo durante el paso de contraseña sin completar
- Cuenta regresiva de 30s para reenvío
- Éxito: navega a `/`

---

## 7. Constantes y Almacenamiento

### Claves de localStorage relacionadas con auth

| Constante | Clave | Propósito |
|-----------|-------|-----------|
| `STORAGE_KEYS.AUTH_LAST_EMAIL` | `"minerva_auth_last_email"` | Pre-llenar email en login |
| `STORAGE_KEYS.RATE_LIMIT` | `"minerva_rate_limit"` | Estado del rate limiter |
| `STORAGE_KEYS.CONNECTION_CONFIG` | `"minerva_connection_config"` | Info de conexión Microsoft (se limpia al cerrar sesión) |
| `STORAGE_KEYS.THEME` | `"vite-ui-theme"` | Preferencia de tema UI |
| `STORAGE_KEYS.LOCALE` | `"minerva_locale"` | Preferencia de idioma |
| (supabase.ts) | `"minerva-auth-token"` | Sesión de Supabase (tokens JWT) |

### Claves limpiadas al cerrar sesión

| Clave | Tipo |
|-------|------|
| `current_schedule_version` | localStorage |
| `dismissed_schedule_versions` | localStorage |
| `minerva_connection_config` | localStorage |
| `minerva_ui_*` (todas con prefijo) | localStorage |

### Archivos de Tauri AppLocalData

| Constante | Archivo | Estado |
|-----------|---------|--------|
| `STORAGE_FILES.APP_SETTINGS` | `minerva_app_settings.json` | Activo |
| `STORAGE_FILES.EXCEL_DATA_MIRROR` | `minerva_excel_data_mirror.json` | Inactivo |
| `STORAGE_FILES.SCHEDULES_DRAFT` | `minerva_schedules_draft.json` | Inactivo |

### Configuración MSAL

La configuración MSAL está definida directamente en `src/main.tsx` al inicializar el `PublicClientApplication`:

| Parámetro | Valor |
|-----------|-------|
| Client ID | `VITE_MSAL_CLIENT_ID` |
| Authority | `https://login.microsoftonline.com/common` |
| Redirect URI | `VITE_MSAL_REDIRECT_URI` (default `http://localhost:1420`) |
| Cache | `sessionStorage`, sin cookie de estado auth |
| Scopes | `User.Read`, `Files.ReadWrite` |

> **Nota:** La configuración MSAL se usa para la integración de OneDrive (adquisición de tokens client-side via `acquireTokenSilent`). Los archivos legacy `config/authConfig.ts` y `services/graphService.ts` fueron eliminados en Fase 1 — la configuración MSAL ahora reside únicamente en `src/main.tsx`.

---

## 8. Diagrama de Seguridad

```
┌─────────────────────────────────────────────────────────────────┐
│                     CAPAS DE SEGURIDAD                          │
│                                                                 │
│  ┌──────────── Frontend ────────────┐                           │
│  │ Rate Limiter (5 intentos + exp.) │                           │
│  │ ProtectedRoute (nivel, permiso)  │                           │
│  │ RequirePermission (nivel en UI)  │                           │
│  └──────────────────────────────────┘                           │
│                    │                                            │
│                    ▼                                            │
│  ┌──────────── JWT Claims ──────────┐                           │
│  │ user_role, hierarchy_level       │                           │
│  │ permissions[] (inyectados por    │                           │
│  │ custom_access_token_hook)        │                           │
│  └──────────────────────────────────┘                           │
│                    │                                            │
│                    ▼                                            │
│  ┌──────────── Edge Functions ──────┐                           │
│  │ verifyPermission() — auth propia │                           │
│  │ verifyInternalKey() — cronjobs   │                           │
│  │ HMAC signature — webhooks        │                           │
│  └──────────────────────────────────┘                           │
│                    │                                            │
│                    ▼                                            │
│  ┌──────────── PostgreSQL (RLS) ────┐                           │
│  │ Políticas por tabla:             │                           │
│  │  - Service-role only (tokens)    │                           │
│  │  - JWT permission check          │                           │
│  │  - Hierarchy level check         │                           │
│  │ Triggers anti-escalación         │                           │
│  │ Vault para tokens OAuth          │                           │
│  └──────────────────────────────────┘                           │
└─────────────────────────────────────────────────────────────────┘
```

**4 capas de defensa en profundidad:**
1. **Frontend:** Rate limiter, rutas protegidas, componentes condicionales por permiso
2. **JWT Claims:** Roles y permisos embebidos en el token, verificables sin RPC
3. **Edge Functions:** Autenticación propia, no confían en `verify_jwt` — verifican permisos directamente
4. **PostgreSQL:** RLS en todas las tablas, triggers anti-escalación, Vault cifrado para tokens
