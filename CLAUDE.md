# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Minerva v2 is a Tauri 2 desktop app (Rust + React 19) for managing educational schedules with Zoom meeting matching and Microsoft OneDrive integration. Backend is Supabase (PostgreSQL + Edge Functions). The app supports English, Spanish, and French (i18next with `src/locales/`).

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
```

There is no `lint` script in package.json. Use `pnpm tsc --noEmit` for type-checking.

Always use **pnpm** for package management.

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
- `/system` — `<AdminRoute>` (hierarchy_level >= 80)
- `/reports` — requires `reports.view` permission
- Layout shell: `<MainNav>` + `<UserNav>` + `<Outlet>`

### Path Aliases

- `@/*` → `./src/*`
- `@schedules/*` → `./src/features/schedules/*`

Defined in both `tsconfig.json` and `vite.config.ts`.

### Feature-based Organization (`src/features/`)

- **schedules/** — Schedule CRUD, Excel upload/parsing (xlsx), publishing, incidences
- **matching/** — Zoom meeting matching engine with scoring/penalties, Web Worker
- **auth/** — Login, signup, OTP verification, password reset
- **system/** — Admin panel, roles management, reports, `GlobalSyncManager`
- **settings/** — User preferences
- **profile/** — User profile page
- **docs/** — In-app docs, bug report form

Note: `src/features/system/_archive` is excluded from tsconfig compilation.

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

### Matching Engine

- **Matcher** (`matching/services/matcher.ts`) — Three-tier search: exact normalized match → Fuse.js fuzzy → token set fallback
- **Scorer** (`matching/scoring/`) — Penalty calculation logic
- **Config** (`matching/config/matching.config.json`) — Scoring penalties and thresholds
- **Web Worker** (`matching/workers/match.worker.ts`) — Runs off main thread; messages: `INIT`→`READY`, `MATCH`→`MATCH_RESULT`
- Worker lifecycle managed by `useZoomStore`: terminated and recreated when data changes

### Supabase Edge Functions (Deno, `supabase/functions/`)

- `zoom-api` — Create/update Zoom meetings (batch support)
- `zoom-auth` — OAuth 2.0 flow with Zoom
- `zoom-sync` — Sync users and meetings from Zoom API to DB
- `zoom-webhook` — Receives Zoom webhooks (HMAC signed)
- `microsoft-auth` — OAuth 2.0 flow with Microsoft
- `microsoft-graph` — OneDrive file operations

Most deploy with `--no-verify-jwt` (custom auth logic inside).

### Database Migrations (`supabase/migrations/`)

Files 001–006, 008–010 run via Supabase SQL Editor. Key tables: `profiles`, `schedule_entries`, `published_schedules`, `incidences`, `zoom_users`, `zoom_meetings`, `microsoft_tokens_vault`.

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
- `rate-limiter.ts` — Login attempt throttling
- `i18n.ts` — i18next setup (en/es/fr), localStorage-only language detection

## Key Patterns

- Zustand stores use `set`/`get` with async actions calling Supabase directly
- `useZoomStore.createMeetings` batches 30 per chunk with 3.5s delay via `processBatchChunks`
- Schedule data validated with Zod schemas (`schedules/schemas/`)
- Forms use React Hook Form + Zod resolvers
- Tables use TanStack Table with custom column definitions
- Heavy modules (e.g., Microsoft publisher) are lazy-imported in store actions

## Testing

Tests live in `tests/` at the project root (not co-located). Vitest globals are enabled (`describe`, `it`, `expect` available without imports). Test files:

- `matcher_schedules.test.ts`, `matcher_users.test.ts`, `matcher_meetings.test.ts` — matching integration tests
- `penalties.test.ts` — scoring penalty tests

## Environment Variables

```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJxxxx...
```

## Security Notes

See `SECURITY_AUDIT.md` for known security findings including:
- Timing attack vulnerabilities in HMAC/API key comparisons
- URL injection risks in Microsoft Graph API calls
- Input validation requirements for user-controlled parameters

## Conventions

- TypeScript strict mode — no `any`, prefer inference
- Tailwind CSS is the only styling solution
- Small components, single responsibility, composition over configuration
- Run `pnpm test` before committing; no code with type errors or failing tests
- Complex changes (refactors, new features, architecture decisions) require confirming understanding before acting
