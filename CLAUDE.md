# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Minerva v2 is a **Tauri 2 desktop app** (Rust + React 19 + Vite 7) for managing educational schedules with Zoom meeting matching and Microsoft OneDrive integration. Backend is Supabase (PostgreSQL + Deno Edge Functions). The app supports English, Spanish, and French (i18next with `src/locales/`).

**Current version:** 0.1.9

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
| `docs/SUPABASE_BACKEND.md` | Edge Functions, DB schema (13 migrations), RLS, Vault, Realtime |
| `docs/matching_logic.md` | Matching engine: normalizer, 3-tier search, 10 penalties, scorer |
| `docs/zoom_setup.md` | Zoom integration: OAuth, 4 Edge Functions, webhooks, batch ops, useZoomStore |
| `docs/microsoft_setup.md` | Microsoft integration: OAuth, Graph API, OneDrive config, tokens |
| `docs/release_guide.md` | Release process, CI/CD, signing, updater, troubleshooting |

**Read the relevant doc before modifying a feature.** The docs are the source of truth for architecture decisions.

## Architecture

### Provider Hierarchy (src/main.tsx)

MSAL initializes first (async), then React renders with this provider nesting:

```
MsalProvider
  └─ ThemeProvider
      └─ AuthProvider
          └─ BrowserRouter
              └─ SettingsProvider
                  └─ App
```

MSAL must complete `initialize()` and `handleRedirectPromise()` before React renders.

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

### Matching Engine (`src/features/matching/`)

- **Matcher** (`services/matcher.ts`) — Three-tier search: exact normalized → Fuse.js fuzzy → token set fallback
- **Scorer** (`scoring/scorer.ts`) — ScoringEngine with 10 penalty functions, evaluateMatch() decision logic
- **Penalties** (`scoring/penalties.ts`) — 10 registered penalty functions with ALL_PENALTIES registry
- **Config** (`config/matching.config.json`) — Source of truth for penalties, thresholds, irrelevant words (10 categories)
- **Normalizer** (`utils/normalizer.ts`) — Unicode normalization, diacritics removal, irrelevant word filtering
- **Web Worker** (`workers/match.worker.ts`) — Runs off main thread; messages: `INIT`→`READY`, `MATCH`→`MATCH_RESULT`
- Worker lifecycle managed by `useZoomStore`: terminated and recreated when data changes

Full documentation: `docs/matching_logic.md`

### Supabase Edge Functions (Deno, `supabase/functions/`)

- `zoom-api` — Create/update Zoom meetings (batch support, type 2 daily / type 8 recurring)
- `zoom-auth` — OAuth 2.0 flow with Zoom (S2S + Vault storage)
- `zoom-sync` — Sync users and meetings from Zoom API to DB (paginated)
- `zoom-webhook` — Receives Zoom webhooks (HMAC signed)
- `microsoft-auth` — OAuth 2.0 flow with Microsoft (init, callback, status, disconnect, update-config)
- `microsoft-graph` — OneDrive operations: 5 read actions, 3 sync actions, 8 write actions

Most deploy with `--no-verify-jwt` (custom auth logic inside). Shared utils in `_shared/auth-utils.ts`.

### Database Migrations (`supabase/migrations/`)

13 migration files (001–006, 008–009, 012–016). Run via Supabase SQL Editor in order.

Key tables: `profiles`, `roles`, `permissions`, `schedule_entries`, `published_schedules`, `incidences`, `zoom_users`, `zoom_meetings`, `zoom_account`, `microsoft_account`, `webhook_logs`, `bug_reports`.

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

Tests live in `tests/` at the project root (not co-located). Vitest globals are enabled (`describe`, `it`, `expect` available without imports). Test files:

- `matcher_schedules.test.ts`, `matcher_users.test.ts`, `matcher_meetings.test.ts` — matching integration tests
- `penalties.test.ts` — scoring penalty tests (all 10 penalty functions)

**76 tests, all passing.**

## Environment Variables

```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJxxxx...
```

Edge Function secrets (set via `supabase secrets set`):
- `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`
- `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_REDIRECT_URI`


## Conventions

- TypeScript strict mode — no `any`, prefer inference
- Tailwind CSS is the only styling solution (CSS-first config, v4)
- Small components, single responsibility, composition over configuration
- ESM only; prefer modern browser APIs
- Run `pnpm test` and `pnpm tsc --noEmit` before committing
- Complex changes (refactors, new features, architecture decisions) require confirming understanding before acting
- All project documentation written in Spanish
