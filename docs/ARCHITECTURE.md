# Minerva v2 — Referencia de Arquitectura

> Documento vivo. Se actualiza con cada cambio significativo en el código.  
> Última actualización: 2026-02-06

---

## 1. Descripción General

Minerva v2 es una **aplicación de escritorio Tauri 2** para gestión de horarios educativos. Conecta horarios institucionales con reuniones de Zoom y archivos de OneDrive, permitiendo a operadores cargar, publicar, emparejar y sincronizar datos de clases.

```
┌─────────────────────────────────────────────────────────┐
│                   Núcleo Tauri 2                        │
│  ┌───────────────────────────────────────────────────┐  │
│  │          Frontend: React 19 + Vite 7             │  │
│  │  ┌──────────┐ ┌──────────┐ ┌────────────────┐    │  │
│  │  │ Horarios │ │Emparejado│ │  Sistema        │    │  │
│  │  │(CRUD,    │ │(Zoom ↔   │ │(Admin, OAuth,   │    │  │
│  │  │ Excel)   │ │ Scoring) │ │ Reportes)       │    │  │
│  │  └────┬─────┘ └────┬─────┘ └───────┬────────┘    │  │
│  │       │             │               │             │  │
│  │  ┌────▼─────────────▼───────────────▼──────────┐  │  │
│  │  │     Zustand Stores + React Context          │  │  │
│  │  └────────────────────┬────────────────────────┘  │  │
│  └───────────────────────┼───────────────────────────┘  │
│                          │ HTTPS                         │
└──────────────────────────┼──────────────────────────────┘
                           │
          ┌────────────────▼────────────────┐
          │    Supabase (PostgreSQL)        │
          │  ┌────────┐  ┌──────────────┐  │
          │  │  Auth   │  │Edge Functions│  │
          │  │ (JWT)   │  │  (Deno)      │  │
          │  └────────┘  └────────┬──────┘  │
          │                       │         │
          └───────────────────────┼─────────┘
                                  │ HTTPS
                     ┌────────────▼────────────┐
                     │  APIs Externos          │
                     │ ┌──────┐  ┌──────────┐ │
                     │ │ Zoom │  │Microsoft │ │
                     │ │      │  │  Graph   │ │
                     │ └──────┘  └──────────┘ │
                     └─────────────────────────┘
```

**Pila tecnológica:**

| Capa | Tecnología |
|---|---|
| Escritorio | Tauri 2 (Rust) |
| Frontend | React 19, TypeScript 5.9, Vite 7 |
| Estilos | Tailwind CSS 4 (configuración CSS-first), shadcn/ui (estilo New York) |
| Estado | Zustand 5 (stores), React Context (auth, tema, configuración) |
| Backend | Supabase (PostgreSQL, Auth, Edge Functions, Vault, Realtime) |
| Integraciones | Zoom OAuth 2.0, API de Microsoft Graph |
| Testing | Vitest |
| i18n | i18next (en, es, fr) |

### ¿Por qué esta arquitectura?

- **Tauri 2 en lugar de Electron**: Más ligero, mejor rendimiento, binarios más pequeños para distribución.
- **React 19 + TypeScript**: Seguridad de tipos, componentes reutilizables, ecosistema amplio.
- **Zustand**: Gestión de estado simple y sin boilerplate (vs Redux).
- **Supabase**: Backend serverless con PostgreSQL real — mejor que Firebase para datos relacionales complejos.
- **Edge Functions en Deno**: Soporte nativo para TypeScript, arranque rápido, ideal para integraciones OAuth.

---

## 2. Estructura de Directorios

```
minerva_v2/
├── src/                          # Aplicación frontend
│   ├── main.tsx                  # Punto de entrada, jerarquía de providers
│   ├── App.tsx                   # Router, layout, definición de rutas
│   ├── index.css                 # Configuración Tailwind CSS 4 + estilos globales
│   ├── vite-env.d.ts             # Declaraciones de tipo para variables de entorno Vite
│   │
│   ├── components/               # Componentes compartidos de la aplicación
│   │   ├── auth-provider.tsx     # AuthContext — sesión, perfil, JWT claims
│   │   ├── theme-provider.tsx    # ThemeContext — dark/light/system
│   │   ├── settings-provider.tsx # SettingsContext — preferencias (respaldadas en archivo)
│   │   ├── ProtectedRoute.tsx    # Guardas de ruta (auth, permiso, nivel)
│   │   ├── RequirePermission.tsx # Control de visibilidad por permisos a nivel UI
│   │   ├── ErrorBoundary.tsx     # Error boundary con UI de recuperación
│   │   ├── main-nav.tsx          # Barra de navegación superior
│   │   ├── user-nav.tsx          # Menú desplegable del usuario
│   │   ├── update-dialog.tsx     # Diálogo de auto-actualización de Tauri
│   │   ├── GlobalSyncManager.tsx # Sync de fondo (tema + datos Zoom)
│   │   └── ui/                   # Primitivos shadcn/ui (35+ componentes)
│   │
│   ├── features/                 # Módulos por funcionalidad (organización por dominio)
│   │   ├── auth/                 # Login, registro, restablecimiento de contraseña
│   │   ├── schedules/            # CRUD de horarios, parseo de Excel, publicación
│   │   ├── matching/             # Motor de emparejamiento Zoom
│   │   ├── system/               # Panel de administración, integraciones, reportes
│   │   ├── settings/             # Página de preferencias del usuario
│   │   ├── profile/              # Página de perfil del usuario
│   │   └── docs/                 # Documentación in-app, reporte de bugs
│   │
│   ├── lib/                      # Utilidades compartidas (agnósticas al framework)
│   │   ├── supabase.ts           # Cliente Supabase (optimizado para escritorio)
│   │   ├── utils.ts              # cn() (merge de clases Tailwind)
│   │   ├── constants.ts          # Claves de almacenamiento y nombres de archivo
│   │   ├── logger.ts             # Logger por niveles (debug/info/warn/error)
│   │   ├── i18n.ts               # Inicialización de i18next
│   │   ├── rate-limiter.ts       # Limitador de intentos de login
│   │   └── secure-export.ts      # Exportación de archivos vía diálogo de Tauri
│   │
│   ├── hooks/                    # Hooks React compartidos
│   │   └── use-updater.tsx       # Hook de auto-actualización de Tauri
│   │
│   └── locales/                  # Archivos de traducción
│       ├── en.json
│       ├── es.json
│       └── fr.json
│
├── src-tauri/                    # Backend Rust (Tauri)
│   ├── src/lib.rs                # Comandos Tauri y configuración de plugins
│   ├── src/main.rs               # Punto de entrada del binario
│   ├── tauri.conf.json           # Metadatos de la app, configuración de ventana, plugins
│   └── capabilities/default.json # Permisos de seguridad
│
├── supabase/                     # Backend-as-a-Service
│   ├── config.toml               # Configuración de desarrollo local
│   ├── migrations/               # Migraciones SQL (6 archivos consolidados, 001–006)
│   └── functions/                # Edge Functions en Deno
│       ├── _shared/              # Utilidades compartidas de auth/tokens
│       ├── zoom-auth/            # Flujo OAuth de Zoom
│       ├── zoom-sync/            # Sincronización de datos de Zoom
│       ├── zoom-api/             # Proxy para API REST de Zoom
│       ├── zoom-webhook/         # Receptor de eventos de Zoom
│       ├── microsoft-auth/       # Flujo OAuth de Microsoft
│       └── microsoft-graph/      # Operaciones OneDrive/Excel
│
├── tests/                        # Archivos de prueba (Vitest)
│   ├── matching/                 # 6 archivos: matcher, penalties, normalizer, scorer
│   ├── schedules/                # 4 archivos: time-utils, overlap-utils, merge-utils, schema
│   └── lib/                      # 2 archivos: date-utils, rate-limiter
│
└── docs/                         # Documentación del proyecto
    ├── ARCHITECTURE.md            # ← Este archivo
    ├── USER_FLOWS.md              # Diagramas de flujo del usuario
    ├── AUTH_SYSTEM.md             # Sistema de autenticación completo
    ├── EXCEL_SYSTEM.md            # Parser de Excel, schemas, servicios de horarios
    ├── SUPABASE_BACKEND.md        # Edge Functions, esquema DB, RLS, Vault
    ├── matching_logic.md          # Documentación del algoritmo de emparejamiento
    ├── ZOOM_SETUP.md              # Guía de configuración de integración Zoom
    ├── microsoft_setup.md         # Guía de configuración de integración Microsoft
    └── release_guide.md           # Proceso de release
```

---

## 3. Jerarquía de Providers

Los providers envuelven la aplicación en un orden específico. Cada uno expone un contexto disponible para todos sus hijos.

```
ReactDOM.render
  └── React.StrictMode
       └── ThemeProvider              ← Clase CSS dark/light/system
            └── AuthProvider          ← Sesión Supabase + perfil JWT
                 └── BrowserRouter    ← React Router v7
                      └── SettingsProvider  ← Preferencias (archivo local)
                           ├── App          ← Rutas + layout
                           ├── BugReportButton  ← Botón flotante de reporte
                           └── Toaster      ← Contenedor de toasts (Sonner)
```

**Decisiones clave:**
- `ThemeProvider` está más arriba porque aplica la clase CSS a `<html>` — no requiere red.
- `AuthProvider` está sobre `BrowserRouter` para que las guardas de ruta puedan leer el estado de autenticación.
- `SettingsProvider` está dentro de `BrowserRouter` porque usa Tauri FS (asíncrono), y no se necesita para el routing.

---

## 4. Rutas y Control de Acceso

Todas las rutas están definidas en `src/App.tsx`.

```
/login                     → LoginPage           (pública)
/                          → ScheduleDashboard    (autenticado)
/settings                  → SettingsPage         (autenticado)
/profile                   → ProfilePage          (autenticado)
/docs                      → DocsPage             (autenticado)
/system                    → SystemPage           (admin, nivel ≥ 80)
/reports                   → ReportsPage          (permiso reports.view)
```

**Componentes de guarda:**

| Componente | Propósito | Archivo |
|---|---|---|
| `ProtectedRoute` | Redirige a `/login` si no hay sesión. Opcionalmente verifica permiso/nivel. | `components/ProtectedRoute.tsx` |
| `AdminRoute` | Atajo para `ProtectedRoute` con `requiredLevel={80}` | `components/ProtectedRoute.tsx` |
| `RequirePermission` | **Nivel UI** — oculta hijos si no se cumple el permiso/nivel. No redirige. | `components/RequirePermission.tsx` |
| `ErrorBoundary` | Captura errores de renderizado por ruta. Evita crash total de la app. | `components/ErrorBoundary.tsx` |

**`GlobalSyncManager`** se ejecuta dentro de `ProtectedRoute` en cada ruta autenticada. Su función:
1. Sincroniza el tema desde la configuración al cargar.
2. Obtiene datos de Zoom para usuarios con `hierarchy_level ≥ 60`.

---

## 5. Módulos por Funcionalidad

### 5.1 `features/auth/` — Autenticación

**Archivos:** 3 componentes  
**Responsabilidad:** Formulario de login, registro (verificado con OTP), restablecimiento de contraseña (OTP).  
**Dependencias:** `auth-provider`, `lib/rate-limiter`, `lib/constants`  
**Dependencias cruzadas:** Ninguna — completamente autocontenido.

### 5.2 `features/schedules/` — Gestión de Horarios

**Archivos:** ~36 archivos en 7 subdirectorios  
**Responsabilidad:** El dominio principal. CRUD de horarios, carga/parseo de Excel, publicación a Supabase, gestión de incidencias (sustituciones, cancelaciones), auto-guardado de borradores.

```
schedules/
├── types.ts                    # Schedule, DailyIncidence, PublishedSchedule, SchedulesConfig
├── schemas/
│   └── schedule-schema.ts      # Validación Zod v4 para datos de horarios
├── services/
│   ├── schedule-entries-service.ts   # CRUD Supabase para tabla schedule_entries
│   ├── microsoft-publisher.ts        # Publicar incidencias a OneDrive/Excel
│   └── microsoft-import-service.ts   # Importar horarios desde OneDrive/Excel
├── stores/
│   ├── useScheduleDataStore.ts       # Estado de horarios + incidencias (Zustand)
│   ├── useScheduleSyncStore.ts       # Publicación + config MS (Zustand)
│   └── useScheduleUIStore.ts         # Estado UI: fecha activa, modo de vista (Zustand)
├── utils/
│   ├── excel-parser.ts         # Parsear archivos Excel (.xlsx) — formato estándar + exportado
│   ├── excel-styles.ts         # Helpers de estilo para exportación Excel
│   ├── merge-utils.ts          # Fusionar horarios base con incidencias
│   ├── overlap-utils.ts        # Detección de solapamientos de horarios
│   └── time-utils.ts           # Formateo de hora (12h ↔ 24h), ensureTimeFormat, parseTimeToMinutes
├── constants/
│   └── incidence-presets.ts    # Tipos de incidencia predefinidos
├── hooks/
│   ├── useHostMap.ts           # Mapeo host Zoom → instructor
│   └── useInstructors.ts       # Extracción de lista única de instructores
└── components/                 # 20 componentes UI (dashboard, tabla, modales)
```

**Flujo de datos principal:**
```
Archivo Excel → excel-parser → Schedule[] → useScheduleDataStore
                                                  ↓
                                  schedule-entries-service → Supabase (schedule_entries)
                                                  ↓
                                  microsoft-publisher → Edge Function → OneDrive
```

**Dependencias cruzadas:**
- Importa `useZoomStore` y `MatchingService` de `matching/` (para modo en vivo en el dashboard)
- Consumido por `system/` (ReportsPage reutiliza componentes de tabla, modales y servicios)

### 5.3 `features/matching/` — Emparejamiento de Reuniones Zoom

**Archivos:** 11 archivos en 6 subdirectorios  
**Responsabilidad:** Emparejar entradas de horario con reuniones de Zoom mediante búsqueda de tres niveles con motor de puntuación. Se ejecuta en un Web Worker para no bloquear la UI.

```
matching/
├── config/
│   ├── matching.config.json     # Umbrales, pesos, valores de penalización
│   ├── matching.config.ts       # Exporta constantes tipadas: PENALTIES, THRESHOLDS, PROGRAM_TYPE_GROUPS, LEVENSHTEIN_CONFIG
│   └── matching.schema.json     # JSON Schema para validación de config
├── scoring/
│   ├── scorer.ts                # ScoringEngine — evaluación basada en reglas
│   ├── penalties.ts             # Funciones de penalización individuales (tema, hora, instructor)
│   └── types.ts                 # Tipos MatchOptions, ScoreResult
├── services/
│   └── matcher.ts               # Clase MatchingService (Fuse.js + exacto + conjunto de tokens)
├── utils/
│   └── normalizer.ts            # Normalización de strings para comparación
├── types.ts                     # Tipos compartidos: ZoomMeeting, ZoomUser, ZoomMeetingCandidate, MatchResult
├── stores/
│   └── useZoomStore.ts          # Datos Zoom + ciclo de vida del worker + operaciones batch (713 líneas)
└── workers/
    └── match.worker.ts          # Web Worker para emparejamiento fuera del hilo principal
```

**Algoritmo de emparejamiento:**
```
Schedule.program → Normalizar
     ↓
[1] Coincidencia exacta (diccionario normalizado)
     ↓ fallo
[2] Búsqueda fuzzy Fuse.js (top 5 candidatos)
     ↓ fallo
[3] Fallback por conjunto de tokens (basado en intersección)
     ↓
Puntuar cada candidato (ScoringEngine + penalizaciones)
     ↓
Decisión por umbral → assigned | ambiguous | not_found
```

**Dependencias cruzadas:**
- Importa tipo `Schedule` desde `schedules/types`
- `useZoomStore` consumido por `schedules/` (dashboard) y `system/` (ZoomIntegration)

### 5.4 `features/system/` — Administración

**Archivos:** ~17 activos  
**Responsabilidad:** Panel de administración (usuarios, roles), integraciones OAuth (Zoom, Microsoft), reportes de horarios publicados.

```
system/
├── types.ts                       # MicrosoftAccount, FileSystemItem
├── components/
│   ├── SystemPage.tsx             # Hub admin: gestión de usuarios/roles + tarjetas de integración
│   ├── ReportsPage.tsx            # Visor de horarios publicados + controles de sincronización
│   ├── ManageUsersModal.tsx       # CRUD usuarios (nombre, rol, eliminar)
│   ├── ManageRolesModal.tsx       # Punto de entrada para gestión de roles
│   ├── ZoomIntegration.tsx        # Conexión/desconexión OAuth de Zoom
│   ├── MicrosoftIntegration.tsx   # OAuth de Microsoft + selector de archivos
│   ├── MicrosoftFileTree.tsx      # Navegador de árbol de carpetas de OneDrive
│   ├── data-source-columns.tsx    # Columnas TanStack Table para reportes
│   ├── modals/ImportReportsModal.tsx  # Importación OneDrive → Reportes
│   └── roles/                     # Sub-módulo CRUD completo de roles
│       ├── RolesList.tsx
│       ├── RoleDetails.tsx
│       ├── RoleDialogs.tsx
│       ├── use-roles.ts
│       ├── types.ts
│       └── index.ts
```

**Dependencias cruzadas (pesadas):**
- `ReportsPage` importa 8+ módulos de `schedules/` (stores, componentes de tabla, modales, servicios, utils, tipos)
- `GlobalSyncManager` (ahora en `src/components/`) depende de `matching/useZoomStore`, `settings-provider`, `theme-provider`, `auth-provider`

### 5.5 `features/settings/` — Preferencias del Usuario

**Archivos:** 1 componente  
**Responsabilidad:** Selección de tema, idioma, gestión de caché.  
**Autocontenido.** Solo depende de providers y `lib/constants`.

### 5.6 `features/profile/` — Perfil del Usuario

**Archivos:** 1 componente  
**Responsabilidad:** Edición de nombre de visualización, cambio de contraseña.  
**Autocontenido.** Solo depende de `auth-provider`.

### 5.7 `features/docs/` — Documentación y Reportes de Bugs

**Archivos:** 2 componentes  
**Responsabilidad:** Página de documentación in-app, envío de reporte de bugs (insert a Supabase).  
**Nota:** `BugReportButton` se renderiza globalmente en `main.tsx`, fuera del router.

---

## 6. Gestión de Estado

### 6.1 Zustand Stores

| Store | Feature | Líneas | Responsabilidad |
|---|---|---|---|
| `useScheduleDataStore` | schedules | ~260 | Horarios base + incidencias + acciones CRUD |
| `useScheduleSyncStore` | schedules | ~370 | Publicación a DB, config MS, seguimiento de versiones |
| `useScheduleUIStore` | schedules | ~18 | Fecha activa, modo de vista |
| `useZoomStore` | matching | ~713 | Datos Zoom, Web Worker, operaciones batch |

**Patrón de acceso entre stores:**
Los stores acceden entre sí vía `getState()` (lectura síncrona):
- `useScheduleSyncStore` → lee `useScheduleDataStore.getState()` y `useScheduleUIStore.getState()`
- `ScheduleDashboard` → llama `useZoomStore.getState()` para modo en vivo

### 6.2 React Context

| Contexto | Provider | Alcance | Persistencia |
|---|---|---|---|
| Auth | `AuthProvider` | Sesión JWT, perfil, permisos | Sesión Supabase (localStorage) |
| Tema | `ThemeProvider` | Clase CSS de tema | localStorage |
| Configuración | `SettingsProvider` | Preferencias de la app | Archivo Tauri AppLocalData |

---

## 7. Backend Supabase

### 7.1 Esquema de Base de Datos (tablas principales)

| Tabla | Propósito | RLS |
|---|---|---|
| `profiles` | Perfiles de usuario (sincronizados desde auth.users) | ✅ |
| `roles` | Definiciones de rol con hierarchy_level | ✅ |
| `permissions` | Definiciones de permisos | ✅ |
| `role_permissions` | Relación muchos-a-muchos rol ↔ permiso | ✅ |
| `schedule_entries` | Filas de horarios publicados | ✅ |
| `published_schedules` | Una fila por fecha publicada | ✅ |
| `zoom_account` | Conexión OAuth de Zoom compartida (fila única) | ✅ |
| `zoom_users` | Directorio de usuarios Zoom en caché | ✅ |
| `zoom_meetings` | Lista de reuniones Zoom en caché | ✅ |
| `microsoft_account` | Conexión OAuth de Microsoft compartida (fila única) | ✅ |
| `webhook_events` | Log de eventos de webhook de Zoom | ✅ |
| `bug_reports` | Reportes de bugs de usuarios | ✅ |

### 7.2 Modelo de Autenticación y Seguridad

```
JWT Custom Claims (vía custom_access_token_hook):
  ├── user_role: string      (ej: "admin")
  ├── hierarchy_level: number (10–100)
  └── permissions: string[]   (ej: ["schedules.read", "reports.manage"])
```

**Jerarquía de roles:**

| Rol | Nivel | Permisos clave |
|---|---|---|
| viewer | 10 | `schedules.read` |
| operator | 50 | `schedules.read`, `schedules.write` |
| moderator | 60 | Los anteriores + `zoom.links` |
| admin | 80 | Los anteriores + `schedules.manage`, `reports.view`, `reports.manage`, `system.view` |
| super_admin | 100 | Todos los anteriores + `system.manage` (integraciones OAuth) |

### 7.3 Edge Functions

| Función | Propósito | Autenticación |
|---|---|---|
| `zoom-auth` | Flujo OAuth de Zoom (init/callback/disconnect) | Basada en permisos |
| `zoom-sync` | Refresco completo de datos Zoom (usuarios + reuniones) | Basada en permisos |
| `zoom-api` | Proxy para API REST de Zoom (CRUD reuniones) | Basada en permisos |
| `zoom-webhook` | Receptor de eventos webhook de Zoom | Verificación de firma Zoom |
| `microsoft-auth` | Flujo OAuth de Microsoft (init/callback/disconnect/status) | Basada en permisos |
| `microsoft-graph` | CRUD OneDrive/Excel (14+ acciones) | Basada en permisos (escalonada) |

### 7.4 Migraciones

6 archivos consolidados (anteriormente 13):

```
001_core_access.sql           — perfiles, roles, permisos, triggers RBAC, RPCs base
002_user_management.sql       — RPCs de gestión de usuarios y roles
003_zoom_integration.sql      — zoom_account, zoom_users, zoom_meetings, estado OAuth, Vault RPCs
004_webhooks_bug_reports.sql   — webhook_events, bug_reports, función de limpieza
005_microsoft_integration.sql — microsoft_account, vista de credenciales, RPCs de config
006_schedules_realtime.sql    — published_schedules, schedule_entries, Realtime, REPLICA IDENTITY
```

---

## 8. Grafo de Dependencias

```
                        ┌──────────────┐
                        │   main.tsx    │
                        │  (providers)  │
                        └──────┬───────┘
                               │
                        ┌──────▼───────┐
                        │   App.tsx     │
                        │  (rutas)      │
                        └──────┬───────┘
                               │
          ┌────────────┬───────┼───────┬──────────┐
          │            │       │       │          │
    ┌─────▼──┐  ┌──────▼──┐ ┌─▼──┐ ┌──▼───┐ ┌───▼────┐
    │sched.  │  │ system/ │ │auth│ │sett. │ │ docs/  │
    │        │  │         │ └────┘ └──────┘ └────────┘
    │  ┌─────│──│─────┐   │
    │  │     │  │     │   │
    │  ▼     │  ▼     │   │
    │ matching/  │    │   │
    │        │  │     │   │
    └────────┘  └─────│───┘
                      │
              ┌───────▼───────┐
              │   lib/        │
              │ (supabase,    │
              │  utils, etc.) │
              └───────────────┘
```

### Problemas Estructurales Conocidos

| # | Problema | Impacto | Fase de corrección |
|---|---------|---------|-------------------|
| ~~1~~ | ~~`auth-provider` importa `useScheduleSyncStore` (dependencia ascendente)~~ | ~~Resuelto~~ | ✅ Fase 4 |
| ~~2~~ | ~~`Schedule` importado vía `excel-parser` en vez de `types.ts`~~ | ~~Resuelto~~ | ✅ Fase 2 |
| ~~3~~ | ~~`system/ReportsPage` importa 8+ módulos de `schedules/`~~ | ~~Acoplamiento funcional legítimo~~ | ✅ Fase 8 (audit) |
| ~~4~~ | ~~`GlobalSyncManager` vive en `system/` pero es un concern global~~ | ~~Resuelto~~ | ✅ Fase 4 |
| ~~5~~ | ~~`lib/utils.ts` mezcla Tailwind `cn()` con helpers de fecha~~ | ~~Resuelto~~ | ✅ Fase 3 |
| ~~6~~ | ~~`ensureTimeFormat` duplicado en 3 archivos~~ | ~~Resuelto~~ | ✅ Fase 6 |
| ~~7~~ | ~~Directorios vacíos (`routes/`, `assets/`, `scripts/`)~~ | ~~Resuelto~~ | ✅ Fase 1 |
| ~~8~~ | ~~`_archive/` con código muerto~~ | ~~Resuelto~~ | ✅ Fase 1 |
| ~~9~~ | ~~`graphService.ts` y `config/authConfig.ts` stubs huérfanos~~ | ~~Resuelto~~ | ✅ Fase 1 |

---

## 9. Roadmap de Reestructuración

| Fase | Alcance | Riesgo | Descripción |
|---|---|---|---|
| **0** | Documentación | Ninguno | ✅ Completada — 8 docs técnicos + 3 archivos raíz + memoria AI |
| **1** | Limpieza | Bajo | ✅ Completada — dirs vacíos, `_archive/`, stubs huérfanos, dependencia `@microsoft/microsoft-graph-client` |
| **2** | Tipos | Bajo | ✅ Completada — Centralizar tipos compartidos (matching/types.ts), corregir rutas de importación |
| **3** | lib/ | Bajo | ✅ Completada — Split utils.ts → date-utils.ts, cn() aislado |
| **4** | Providers | Medio | ✅ Completada — Desacoplado auth-provider (callback registry), GlobalSyncManager → src/components/ |
| **5** | Features simples | Bajo | ✅ Completada — Limpieza de `"use client"`, catch blocks, BugReportForm, ForgotPasswordDialog |
| **6** | schedules/ | Medio | ✅ Completada — Deduplicar ensureTimeFormat/parseTimeToMinutes en time-utils.ts |
| **7** | matching/ | Bajo | ✅ Completada — Alinear config con código (PROGRAM_TYPE_GROUPS, LEVENSHTEIN_CONFIG) |
| **8** | system/ | Medio | ✅ Completada — Auditoría de acoplamiento, catch blocks, coupling funcional legítimo |
| **9** | Supabase | Bajo | ✅ Completada — Auditoría Edge Functions + migraciones, corrección de documentación |
| **10** | Final | Ninguno | ✅ Completada — Actualización de toda la documentación post-reestructura |

Cada fase termina con: `pnpm tsc --noEmit` + `pnpm test:run` + commit.
