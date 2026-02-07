# Minerva v2 — AI Agent Memory

> Archivo de memoria para agentes AI (Claude, GPT, Copilot, etc.).
> Propósito: orientación rápida para entender el proyecto y usar la documentación existente.
> Última actualización: 2026-02-06

---

## Qué es este archivo

Este archivo es un **mapa de navegación** para agentes AI que trabajan en Minerva v2. No repite la documentación — te dice **dónde encontrar** cada cosa y **cómo conectar** la información entre archivos.

---

## Inicio Rápido

### ¿Primera vez en el proyecto?

1. Lee `AGENTS.md` (raíz) — reglas de comportamiento, comandos, convenciones
2. Lee `docs/ARCHITECTURE.md` — arquitectura completa, estructura de carpetas
3. Consulta la sección "Mapa de Documentación" abajo para el tema específico

### ¿Te pidieron modificar algo?

1. Identifica la feature afectada (matching, schedules, auth, system, etc.)
2. Lee el doc correspondiente de la tabla "Mapa de Documentación"
3. Si toca múltiples features, lee los docs relevantes de cada una
4. Siempre ejecuta `pnpm tsc --noEmit` y `pnpm test:run` después de cambios

---

## Mapa de Documentación

### Archivos raíz (inglés)

| Archivo | Audiencia | Propósito |
|---------|-----------|-----------|
| `README.md` | Desarrolladores nuevos | Setup, migraciones, variables de entorno, troubleshooting |
| `CLAUDE.md` | Claude Code (claude.ai/code) | Guía técnica completa para Claude, patrones clave, convenciones |
| `AGENTS.md` | Todos los agentes AI | Reglas de comportamiento, comandos, arquitectura resumida |
| `SECURITY_AUDIT.md` | Seguridad | Hallazgos de auditoría, vulnerabilidades conocidas |

### Documentación técnica (`docs/`, español)

| Archivo | Qué describe | Cuándo consultar |
|---------|-------------|------------------|
| `ARCHITECTURE.md` | Estructura de carpetas, providers, dependencias, UI stack | Antes de cualquier cambio estructural o nueva feature |
| `USER_FLOWS.md` | 9 flujos de usuario, matriz de permisos, protección de rutas | Cambios en rutas, permisos, gates de UI, roles |
| `AUTH_SYSTEM.md` | AuthProvider, JWT claims, sesión desktop, MSAL, rate limiter | Cambios en login, signup, sesión, providers de auth |
| `EXCEL_SYSTEM.md` | Parser Excel (2 formatos), schemas Zod, validación, auto-save | Cambios en carga/parseo de horarios Excel |
| `SUPABASE_BACKEND.md` | 6 Edge Functions, 13 migraciones, esquema DB, RLS, Vault | Cambios en DB, funciones Edge, RLS, migraciones |
| `matching_logic.md` | Motor de emparejamiento: normalizer, 3 búsquedas, 10 penalizaciones, scorer | Cambios en lógica de matching/scoring |
| `zoom_setup.md` | OAuth Zoom, 4 Edge Functions, webhooks, batch ops, useZoomStore | Cambios en integración Zoom |
| `microsoft_setup.md` | OAuth Microsoft, 15+ acciones Graph, config OneDrive, tokens | Cambios en integración Microsoft/OneDrive |
| `release_guide.md` | CI/CD, GitHub Actions, signing, updater, checklist | Preparar releases o modificar pipeline |

---

## Conexiones Críticas entre Documentos

### Flujo: "Un usuario sube un Excel"

```
USER_FLOWS.md §2 (flujo de operator)
  → EXCEL_SYSTEM.md (parser, schemas, validación)
    → SUPABASE_BACKEND.md §schedule_entries (tabla DB)
      → ARCHITECTURE.md §schedules/ (estructura de archivos)
```

### Flujo: "Emparejamiento de Zoom meetings"

```
USER_FLOWS.md §3 (flujo de admin/operator con Zoom)
  → matching_logic.md (normalizer, búsqueda, scoring, decisiones)
    → SUPABASE_BACKEND.md §zoom_meetings, §zoom_users (tablas DB)
      → ARCHITECTURE.md §matching/ (estructura de archivos)
```

### Flujo: "Sincronización con OneDrive"

```
USER_FLOWS.md §7 (flujo de admin con reportes)
  → microsoft_setup.md (OAuth, acciones Graph, config OneDrive)
    → SUPABASE_BACKEND.md §microsoft-auth, §microsoft-graph (Edge Functions)
      → AUTH_SYSTEM.md §MSAL (client-side auth complementaria)
```

### Flujo: "Crear un nuevo usuario"

```
USER_FLOWS.md §5 (gestión de usuarios)
  → AUTH_SYSTEM.md (signup, OTP, JWT claims)
    → SUPABASE_BACKEND.md §profiles, §roles (tablas DB)
      → USER_FLOWS.md §Permisos (matriz completa)
```

---

## Patrones del Proyecto

### Estado (State Management)

| Dónde | Qué gestiona |
|-------|-------------|
| `useScheduleDataStore` (Zustand) | Datos de horarios + incidencias del mes seleccionado |
| `useScheduleSyncStore` (Zustand) | Publicación, sync Excel, config OneDrive, versiones |
| `useScheduleUIStore` (Zustand) | Fecha seleccionada, filtros, estado de UI |
| `useZoomStore` (Zustand) | Datos Zoom, Worker matching, resultados, batch ops |
| `AuthProvider` (Context) | JWT claims, perfil, permisos (extraídos de token, sin RPC) |
| `SettingsProvider` (Context) | Preferencias de usuario |
| `ThemeProvider` (Context) | Tema claro/oscuro |
| React Query (TanStack) | Cache de server state (queries con stale time) |

> **Patrón crítico:** Los stores Zustand llaman a Supabase directamente en sus acciones async. No hay middleware. La coordinación entre stores usa `otherStore.getState()`.

### Seguridad de Tokens

```
Zoom tokens:      Edge Function → vault.create_secret() → zoom_account solo guarda UUID
Microsoft tokens: Edge Function → vault.create_secret() → microsoft_account solo guarda UUID
Supabase session: localStorage ('minerva-auth-token') + PKCE + auto-refresh manual
MSAL tokens:      En memoria del browser (acquireTokenSilent)
```

> **NUNCA** hay tokens en texto plano en tablas de la DB. Siempre en Vault.

### Permisos

```
viewer (10)      → schedules.read
operator (50)    → schedules.read, schedules.write
admin (80)       → + schedules.manage, reports.view, reports.manage
super_admin (100)→ + system.manage (integraciones Zoom/Microsoft)
```

> Los permisos viajan en el JWT como custom claims. `AuthProvider` los extrae sin queries.
> Los componentes usan `<RequirePermission>` para gates de UI.
> Las Edge Functions verifican permisos via `_shared/auth-utils.ts`.

---

## Gotchas y Advertencias

### No hacer sin leer docs

| Acción | Doc requerido | Riesgo |
|--------|---------------|--------|
| Modificar penalizaciones del matching | `matching_logic.md` | 10 funciones + orden de evaluación + efectos cascada |
| Cambiar migraciones SQL | `SUPABASE_BACKEND.md` | RLS, triggers, RPCs, vistas — todo interconectado |
| Tocar el AuthProvider | `AUTH_SYSTEM.md` | Sesión desktop + auto-refresh + PKCE — flujo delicado |
| Modificar el parser Excel | `EXCEL_SYSTEM.md` | 2 formatos de Excel, reglas de detección automática |
| Cambiar integración Zoom | `zoom_setup.md` | 4 Edge Functions, batch ops, webhook protection, matching integration |
| Cambiar acciones de microsoft-graph | `microsoft_setup.md` | 3 niveles de permiso, algunas acciones sin handler |

### Archivos especiales

- `src/config/authConfig.ts` — **Eliminado** en Fase 1 (legacy, solo importado por graphService).
- `src/services/graphService.ts` — **Eliminado** en Fase 1 (MSAL client-side legacy, no importado por nadie).
- `src/features/system/_archive` — **Eliminado** en Fase 1 (código muerto).

### Matching engine: valores exactos

Los valores de penalización están en `matching.config.json`, NO hardcodeados en TypeScript:

- `MISSING_TOKEN` = **-70** (no -60)
- `COMPANY_CONFLICT` = **-100** (falta en docs viejas)
- `NUMERIC_CONFLICT` = **-30** (falta en docs viejas)
- Levenshtein: config dice `allowedDistanceLong: 2` pero el código **siempre usa 1** (por falsos positivos)

### Microsoft: acción fantasma

`append-rows` está listada en `syncActions` pero **no tiene handler** — retorna 400. Usar `upsert-rows-by-key` o `replace-table-data`.

---

## Estructura de Carpetas (Resumen)

```
minerva_v2/
├── .ai/MEMORY.md                   ← Este archivo
├── AGENTS.md                       ← Guía para agentes AI
├── CLAUDE.md                       ← Guía específica para Claude Code
├── README.md                       ← Setup y referencia general
├── SECURITY_AUDIT.md               ← Auditoría de seguridad
├── docs/                           ← Documentación técnica detallada (español)
│   ├── ARCHITECTURE.md
│   ├── USER_FLOWS.md
│   ├── AUTH_SYSTEM.md
│   ├── EXCEL_SYSTEM.md
│   ├── SUPABASE_BACKEND.md
│   ├── matching_logic.md
│   ├── zoom_setup.md
│   ├── microsoft_setup.md
│   └── release_guide.md
├── src/
│   ├── main.tsx                    ← Entry point, provider hierarchy
│   ├── App.tsx                     ← Router, rutas, layout
│   ├── index.css                   ← Tailwind CSS 4 config
│   ├── components/                 ← Shared components + providers
│   │   ├── auth-provider.tsx       ← AuthProvider (JWT claims extraction)
│   │   ├── GlobalSyncManager.tsx   ← Sync de fondo (tema + datos Zoom)
│   │   ├── ui/                     ← shadcn/ui components
│   │   └── ...
│   ├── features/                   ← Feature modules
│   │   ├── auth/                   ← Login, signup, OTP, reset
│   │   ├── schedules/              ← CRUD, Excel parser, publishing
│   │   ├── matching/               ← Zoom matching engine
│   │   │   ├── types.ts             ← Tipos compartidos (ZoomMeeting, ZoomUser, etc.)
│   │   │   ├── config/             ← matching.config.json (source of truth)
│   │   │   ├── scoring/            ← ScoringEngine + 10 penalties
│   │   │   ├── services/           ← MatchingService
│   │   │   ├── utils/              ← normalizer
│   │   │   ├── workers/            ← Web Worker
│   │   │   └── stores/             ← useZoomStore
│   │   ├── system/                 ← Admin panel, integrations
│   │   └── ...
│   ├── lib/                        ← Shared utilities
│   │   ├── utils.ts                ← cn() (merge de clases Tailwind)
│   │   ├── date-utils.ts           ← Helpers de formateo de fechas
│   │   └── ...
│   └── locales/                    ← i18n (en.json, es.json, fr.json)
├── supabase/
│   ├── functions/                  ← Edge Functions (Deno)
│   │   ├── _shared/auth-utils.ts   ← Auth helper compartido
│   │   ├── zoom-api/
│   │   ├── zoom-auth/
│   │   ├── zoom-sync/
│   │   ├── zoom-webhook/
│   │   ├── microsoft-auth/
│   │   └── microsoft-graph/
│   └── migrations/                 ← 13 archivos SQL (001-016, gaps en 007/010/011)
├── tests/                          ← Vitest tests (76 tests, matching engine)
└── src-tauri/                      ← Tauri (Rust)
```

---

## Historial de Decisiones

| Decisión | Razón | Referencia |
|----------|-------|------------|
| JWT custom claims en lugar de RPC | Performance: evita query por request | `AUTH_SYSTEM.md` |
| Web Worker para matching | UI no se congela con ~1000 meetings | `matching_logic.md` |
| Vault para tokens | Seguridad: tokens cifrados en reposo | `SUPABASE_BACKEND.md` |
| PKCE + manual auto-refresh | Tauri no detecta foreground automáticamente | `AUTH_SYSTEM.md` |
| Singleton microsoft_account | Solo una cuenta Microsoft por sistema | `microsoft_setup.md` |
| Levenshtein distance hardcoded a 1 | Distance 2 causaba falsos positivos (MARIA↔MAYRA) | `matching_logic.md` |
| `--no-verify-jwt` en Edge Functions | Auth interna más flexible que JWT gateway | `SUPABASE_BACKEND.md` |
| Tailwind CSS 4 (CSS-first) | Sin tailwind.config.ts, todo en index.css | `ARCHITECTURE.md` |

---

## Checklist Pre-Commit

```
□ pnpm tsc --noEmit     → Sin errores de tipo
□ pnpm test:run          → 76 tests pasando
□ ¿Cambié comportamiento del matching? → Actualizar tests + docs/matching_logic.md
□ ¿Cambié migraciones? → Actualizar docs/SUPABASE_BACKEND.md
□ ¿Cambié rutas/permisos? → Actualizar docs/USER_FLOWS.md
□ ¿Cambié auth? → Actualizar docs/AUTH_SYSTEM.md
□ ¿Cambié parser Excel? → Actualizar docs/EXCEL_SYSTEM.md
□ ¿Cambié integración Zoom? → Actualizar docs/zoom_setup.md
□ ¿Cambié integración Microsoft? → Actualizar docs/microsoft_setup.md
□ ¿Cambié algo estructural? → Actualizar docs/ARCHITECTURE.md + este archivo
```
