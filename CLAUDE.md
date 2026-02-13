# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Minerva v2 is a **Tauri 2 desktop app** (Rust + React 19 + Vite 7) for managing educational schedules with Zoom meeting matching and Microsoft OneDrive integration. Backend is Supabase (PostgreSQL + Deno Edge Functions). The app supports English, Spanish, and French (i18next with `src/locales/`).

**Current version:** 0.2.1

## Commands

```bash
pnpm dev              # Vite dev server only (port 1420)
pnpm tauri dev        # Full Tauri desktop dev (Vite + native window)
pnpm build            # tsc && vite build
pnpm tauri build      # Production desktop build (MSI/NSIS → src-tauri/target/release/)
pnpm test             # Vitest watch mode
pnpm test:run         # Vitest single run
pnpm test:coverage    # Vitest with coverage
pnpm vitest run -t "test name"  # Run single test by name
pnpm tsc --noEmit     # Type-check (there is NO lint script)
```

Always use **pnpm** for package management.

## Documentation

Detailed technical documentation lives in `docs/` (written in Spanish):

| File | Content |
|------|---------|
| `docs/ARCHITECTURE.md` | Full project architecture, folder structure, dependency graph |
| `docs/USER_FLOWS.md` | User flows per role, permission matrix, route protection |
| `docs/AUTH_SYSTEM.md` | Auth (Supabase + MSAL), JWT claims, session management, rate limiter |
| `docs/EXCEL_SYSTEM.md` | Excel parser (2 formats), Zod schemas, validation, auto-save |
| `docs/SUPABASE_BACKEND.md` | Edge Functions, DB schema (6 consolidated migrations), RLS, Vault, Realtime |
| `docs/MATCHING_LOGIC.md` | Matching engine: normalizer, 3-tier search, 10 penalties, scorer |
| `docs/ZOOM_SETUP.md` | Zoom integration: OAuth, 4 Edge Functions, webhooks, batch ops, useZoomStore |
| `docs/MICROSOFT_SETUP.md` | Microsoft integration: OAuth, Graph API, OneDrive config, tokens |
| `docs/release_guide.md` | Release process, CI/CD, signing, updater, troubleshooting |

**Read the relevant doc before modifying a feature.** The docs are the source of truth for architecture decisions.

## Architecture

### Provider Hierarchy (src/main.tsx)

```
React.StrictMode
  └─ ThemeProvider
      └─ AuthProvider
          └─ BrowserRouter
              └─ SettingsProvider
                  └─ App + BugReportButton + Toaster
```

### Routing (src/App.tsx)

- `/login` — public
- All other routes wrapped in `<ProtectedRoute>` with `<GlobalSyncManager>` for background sync
- `/system` — `<AdminRoute>` (hierarchy_level >= 80); integrations require level 100
- `/reports` — requires `reports.view` permission; management actions require `reports.manage`
- Layout shell: `<MainNav>` + `<UserNav>` + `<Outlet>`

### Path Aliases

- `@/*` → `./src/*`
- `@schedules/*` → `./src/features/schedules/*`

Defined in both `tsconfig.json` and `vite.config.ts`.

### Feature-based Organization (`src/features/`)

- **schedules/** — Schedule CRUD, Excel upload/parsing (xlsx), publishing, incidences
- **matching/** — Zoom meeting matching engine with scoring/penalties, Web Worker
- **auth/** — Login, signup, OTP verification, password reset
- **system/** — Admin panel, roles management, reports, `GlobalSyncManager`, integrations UI
- **statistics/** — Statistics page with Recharts charts (daily stats, incidence breakdowns)
- **settings/** — User preferences
- **profile/** — User profile page
- **docs/** — In-app docs, bug report form

### State Management

- **Zustand** stores (primary state):
  - `useScheduleDataStore` — Base schedules + incidences for selected date, optimistic updates with rollback
  - `useScheduleSyncStore` — Publishing to Supabase, Excel sync, OneDrive config, localStorage persistence for versions
  - `useScheduleUIStore` — UI state (selected date, filters)
  - `useZoomStore` — Zoom users, meetings, match results, batch operations, Web Worker lifecycle
- **React Query** (TanStack) for server state caching
- **AuthProvider** (Context) extracts profile from JWT custom claims without RPC calls

Stores call Supabase directly from async actions (no middleware). Cross-store coordination uses `getState()`.

### Supabase Client (`src/lib/supabase.ts`)

Desktop-optimized configuration:
- PKCE auth flow, session persisted in localStorage (`minerva-auth-token`)
- Manual `startAutoRefresh()`/`stopAutoRefresh()` tied to window visibility/focus events (Tauri can't auto-detect foreground state)
- Proactive token refresh when expiring within 5 minutes on app resume

### Auth & Security

- Supabase Auth with JWT custom claims (`user_role`, `hierarchy_level`, `permissions`) injected by `custom_access_token_hook` (Supabase Auth Hook)
- Microsoft MSAL with PKCE for OneDrive access
- RLS on all tables; policies use `auth.jwt()`
- Role hierarchy: viewer (10) → operator (50) → admin (80) → super_admin (100)

### Permissions Quick Reference

- **`schedules.read`** (10+) — View own schedules
- **`schedules.write`** (50+) — Upload and edit schedules
- **`schedules.manage`** (80+) — Publish global schedules
- **`reports.view`** (80+) — Access Reports page
- **`reports.manage`** (80+) — Import, delete, sync reports
- **`system.manage`** (100) — Connect integrations (Zoom, OneDrive)

Components use `<RequirePermission>` for UI gates. Edge Functions verify permissions via `_shared/auth-utils.ts`.

### Matching Engine (`src/features/matching/`)

Three-tier search (exact normalized → Fuse.js fuzzy → token set fallback) with 10 penalty functions and a scoring engine. Runs off main thread in a **Web Worker** (`match.worker.ts`). Config source of truth: `config/matching.config.json`. Worker lifecycle managed by `useZoomStore`: terminated and recreated when data changes. **Full docs: `docs/MATCHING_LOGIC.md`**

### Supabase Edge Functions (Deno, `supabase/functions/`)

6 Edge Functions: `zoom-api`, `zoom-auth`, `zoom-sync`, `zoom-webhook`, `microsoft-auth`, `microsoft-graph`. Most deploy with `--no-verify-jwt` (custom auth inside). Shared utils in `_shared/auth-utils.ts`. **Full docs: `docs/SUPABASE_BACKEND.md`**

### Database Migrations (`supabase/migrations/`)

8 migration files (001–008). Run via Supabase SQL Editor in order. 001–006 are consolidated; 007 (`delete_account`) and 008 (`statistics_rpc`) are standalone.

Key tables: `profiles`, `roles`, `permissions`, `schedule_entries`, `published_schedules`, `zoom_users`, `zoom_meetings`, `zoom_account`, `microsoft_account`, `webhook_events`, `bug_reports`.

Full schema documentation: `docs/SUPABASE_BACKEND.md`

### Tauri Plugins

- `tauri-plugin-opener` — Open URLs/files
- `tauri-plugin-dialog` — Native file/save dialogs
- `tauri-plugin-fs` — Sandboxed file system access
- `tauri-plugin-updater` — Auto-updates from GitHub releases
- `tauri-plugin-process` — Process control (restart/exit)

### UI Stack

- **shadcn/ui** (New York style) + Radix UI — components in `src/components/ui/`
- **Tailwind CSS 4** — CSS-first config in `src/index.css` (`@import "tailwindcss"` + `@theme inline`), no `tailwind.config.ts`
- **Lucide React** — always explicit imports, never barrels
- **Sonner** — toast notifications
- **react-day-picker** + **date-fns** — calendar/date components
- **cmdk** — command palette

### Shared Utilities (`src/lib/`)

- `utils.ts` — `cn()` for Tailwind class merging, ISO date string helpers (avoids `Date` constructor for timezone safety)
- `logger.ts` — Level-based logging, silences debug/info in production
- `constants.ts` — All localStorage keys (`minerva_` prefix) and file names centralized
- `supabase.ts` — Desktop-optimized Supabase client with PKCE, manual auto-refresh, proactive token refresh
- `i18n.ts` — i18next setup (en/es/fr), localStorage-only language detection
- `rate-limiter.ts` — Login attempt throttling (configurable max attempts + lockout window)
- `secure-export.ts` — Tauri dialog-based secure file export

## Key Patterns

- Zustand stores use `set`/`get` with async actions calling Supabase directly
- `useZoomStore.createMeetings` batches 30 per chunk with 3.5s delay via `processBatchChunks`
- `useZoomStore.executeAssignments` assigns host/topic in chunks of 30 with 3.5s between chunks
- Schedule data validated with Zod schemas (`schedules/schemas/`)
- Forms use React Hook Form + Zod resolvers
- Tables use TanStack Table with custom column definitions
- Heavy modules (e.g., Microsoft publisher) are lazy-imported in store actions
- Microsoft integration uses singleton pattern (unique constraint on `microsoft_account`)
- Tokens always stored in Supabase Vault, never in plain-text DB columns

## Testing

Tests live in `tests/` at the project root (not co-located). Vitest globals are enabled (`describe`, `it`, `expect` available without imports). Organized in subdirectories:

- `tests/matching/` — matcher_meetings, matcher_schedules, matcher_users, penalties, normalizer, scorer (6 files)
- `tests/schedules/` — time-utils, overlap-utils, merge-utils, schedule-schema (4 files)
- `tests/lib/` — date-utils, rate-limiter (2 files)

**212 tests across 12 files, all passing.**

## Environment Variables

```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJxxxx...
```

Edge Function secrets (set via `supabase secrets set`):
- `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`
- `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_REDIRECT_URI`


## CI/CD

Single workflow: `.github/workflows/release.yml` — triggers on `v*` tags, builds Windows MSI/NSIS via `tauri-apps/tauri-action`. No CI for tests or type-checking — run `pnpm tsc --noEmit` and `pnpm test:run` locally before committing.

## Conventions

- TypeScript strict mode — no `any`, prefer inference
- Tailwind CSS is the only styling solution (CSS-first config, v4)
- Small components, single responsibility, composition over configuration
- ESM only; prefer modern browser APIs
- Run `pnpm test` and `pnpm tsc --noEmit` before committing
- Complex changes (refactors, new features, architecture decisions) require confirming understanding before acting
- All project documentation written in Spanish
- Vite injects `__BUILD_DATE__` at build time (defined in `vite.config.ts`)

## Gotchas

- **Read the relevant `docs/` file before modifying any feature** — they contain detailed architecture decisions and implementation specifics
- Matching engine: Levenshtein distance is hardcoded to 1 in the code despite `allowedDistanceLong: 2` in config (distance 2 caused false positives like MARIA↔MAYRA)
- Matching penalty values live in `matching.config.json`, NOT hardcoded in TypeScript
- Microsoft: `append-rows` is listed in `syncActions` but has no handler — returns 400. Use `upsert-rows-by-key` or `replace-table-data` instead
- Edge Functions deploy with `--no-verify-jwt` — they implement custom auth internally via `_shared/auth-utils.ts`
