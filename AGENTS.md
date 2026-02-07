# Minerva v2 — Agent Guidelines

Tauri 2 desktop app (Rust + React 19 + Vite 7) for educational schedule management with Zoom matching and OneDrive integration. Backend: Supabase (PostgreSQL + Deno Edge Functions). Supports en/es/fr via i18next.

**Current version:** 0.2.0

## Build & Test Commands

```sh
pnpm dev                           # Vite dev server (port 1420)
pnpm tauri dev                     # Full desktop dev (Vite + native window)
pnpm build                         # tsc && vite build
pnpm tauri build                   # Production build (MSI/NSIS → src-tauri/target/release/)
pnpm test                          # Vitest watch mode
pnpm test:run                      # Vitest single run (212 tests)
pnpm vitest run -t "test name"     # Run a single test by name
pnpm tsc --noEmit                  # Type-check (there is NO lint script)
```

Always use **pnpm**. There is no `pnpm lint` — use `pnpm tsc --noEmit` for type-checking.

## Documentation (`docs/`)

Detailed technical docs (written in Spanish). **Read the relevant doc before modifying a feature:**

| File | Content | Read when... |
|------|---------|--------------|
| `docs/ARCHITECTURE.md` | Full architecture, folder structure, dependency graph | Changing structure, adding features |
| `docs/USER_FLOWS.md` | User flows per role, permission matrix, route protection | Modifying routes, permissions, UI gates |
| `docs/AUTH_SYSTEM.md` | Auth (Supabase + MSAL), JWT claims, sessions, rate limiter | Touching auth, login, providers |
| `docs/EXCEL_SYSTEM.md` | Excel parser (2 formats), Zod schemas, validation, auto-save | Modifying schedule upload/parse |
| `docs/SUPABASE_BACKEND.md` | Edge Functions, DB schema (6 consolidated migrations), RLS, Vault | Changing DB, RLS, Edge Functions |
| `docs/matching_logic.md` | Matching engine: normalizer, 3-tier search, 10 penalties | Modifying matching/scoring logic |
| `docs/ZOOM_SETUP.md` | Zoom: OAuth, 4 Edge Functions, webhooks, batch ops, useZoomStore | Touching Zoom integration |
| `docs/microsoft_setup.md` | Microsoft: OAuth, Graph API (15+ actions), OneDrive config | Touching Microsoft integration |
| `docs/release_guide.md` | Release process, CI/CD, signing, updater | Preparing a release |

## Architecture

### Provider hierarchy (`src/main.tsx`)

MSAL initializes first (async), then: `MsalProvider → ThemeProvider → AuthProvider → BrowserRouter → SettingsProvider → App`

### Routing (`src/App.tsx`)

Flat routes via react-router-dom v7.
- `/login` — public
- All others wrapped in `<ProtectedRoute>` + `<GlobalSyncManager>`
- `/system` — admin only (`hierarchy_level >= 80`); integrations (Zoom, Microsoft) require `level={100}` (super_admin)
- `/reports` — requires `reports.view` permission; management actions require `reports.manage`

### Feature-based organization (`src/features/`)

| Feature | Purpose |
|---|---|
| `schedules/` | Schedule CRUD, Excel upload/parse (xlsx), publishing, incidences |
| `matching/` | Zoom meeting matching engine — scorer, 10 penalties, Web Worker |
| `auth/` | Login, signup, OTP, password reset |
| `system/` | Admin panel, roles, reports, `GlobalSyncManager`, integrations UI |
| `settings/` | User preferences |
| `profile/` | User profile |
| `docs/` | In-app docs, bug report form |

### State management

- **Zustand** stores (primary): `useScheduleDataStore`, `useScheduleSyncStore`, `useScheduleUIStore`, `useZoomStore`
  - Stores call Supabase directly in async actions; cross-store coordination via `getState()`
- **React Context**: `AuthProvider` (JWT claims), `SettingsProvider`, `ThemeProvider`
- **TanStack React Query** for server state caching

### Path aliases (tsconfig + vite)

- `@/*` → `./src/*`
- `@schedules/*` → `./src/features/schedules/*`

### Matching engine (`src/features/matching/`)

Three-tier search: exact normalized → Fuse.js fuzzy → token set fallback. Runs off main thread in a **Web Worker** (`match.worker.ts`). Config source of truth: `matching/config/matching.config.json` (penalties, thresholds, 10 categories of irrelevant words). **Full docs: `docs/matching_logic.md`**

### Supabase Edge Functions (`supabase/functions/`, Deno)

| Function | Purpose |
|----------|---------|
| `zoom-api` | Create/update Zoom meetings (batch, type 2/8) |
| `zoom-auth` | OAuth 2.0 + Vault token storage |
| `zoom-sync` | Paginated sync of users + meetings from Zoom API |
| `zoom-webhook` | HMAC-signed webhook receiver |
| `microsoft-auth` | OAuth 2.0 flow (5 actions: init, callback, status, disconnect, update-config) |
| `microsoft-graph` | OneDrive ops (5 read, 3 sync, 8 write actions) |

Most deploy with `--no-verify-jwt` (custom auth inside). Shared utils in `_shared/auth-utils.ts`.

### Auth & security

- Supabase Auth with JWT custom claims (`custom_access_token_hook`)
- Microsoft MSAL with PKCE for OneDrive access
- RLS on all tables; role hierarchy: viewer(10) → operator(50) → admin(80) → super_admin(100)
- Desktop session: PKCE, localStorage (`minerva-auth-token`), manual auto-refresh tied to window visibility
- Tokens (Zoom + Microsoft) always in Supabase Vault, never plain-text

### Database

6 consolidated migration files (001–006). Key tables: `profiles`, `roles`, `permissions`, `schedule_entries`, `published_schedules`, `zoom_users`, `zoom_meetings`, `zoom_account`, `microsoft_account`, `webhook_events`, `bug_reports`. **Full schema: `docs/SUPABASE_BACKEND.md`**

## Permissions & Authorization

Key permissions and their usage patterns:
- **`schedules.read`** (10+) — View own schedules
- **`schedules.write`** (50+) — Upload and edit schedules
- **`schedules.manage`** (80+) — Publish global schedules
- **`reports.view`** (80+) — Access Reports page
- **`reports.manage`** (80+) — Import, delete, sync reports
- **`system.manage`** (100) — Connect integrations (Zoom, OneDrive)

Integration pattern (Zoom, Microsoft):
- Only **super_admin** (`level={100}`) can connect/disconnect accounts in SystemPage
- Users with appropriate permissions can use connected integrations
- Example: super_admin connects OneDrive → admins with `reports.manage` can sync

## Code Style

- TypeScript strict mode — avoid `any`, prefer inference
- **Tailwind CSS 4** only (CSS-first config in `src/index.css`, no `tailwind.config.ts`)
- **shadcn/ui** (New York style) + Radix UI — components in `src/components/ui/`
- **Lucide React** icons — always explicit imports, never barrel imports
- Forms: React Hook Form + Zod resolvers. Schemas in `schedules/schemas/`
- Tables: TanStack Table with custom columns in `schedules/components/table/`
- Toasts via **Sonner**; command palette via **cmdk**
- ESM only; prefer modern browser APIs
- All project documentation written in Spanish

## Testing

- Tests live in `tests/` at project root (not co-located), organized in subdirectories:
  - `tests/matching/` — matcher, penalties, normalizer, scorer (6 files)
  - `tests/schedules/` — time-utils, overlap-utils, merge-utils, schema (4 files)
  - `tests/lib/` — date-utils, rate-limiter (2 files)
- Vitest with globals enabled — `describe`, `it`, `expect` available without imports
- 212 tests across 12 files covering matching, schedules, and lib
- After changing behavior: add or update tests, even if not explicitly asked
- After moving files or changing imports: run `pnpm tsc --noEmit`

## Shared Utilities (`src/lib/`)

| File | Purpose |
|---|---|
| `utils.ts` | `cn()` for Tailwind class merging, ISO date helpers |
| `constants.ts` | All localStorage keys (`minerva_` prefix) |
| `logger.ts` | Level-based logging (silences debug/info in prod) |
| `supabase.ts` | Desktop-optimized Supabase client with PKCE, manual auto-refresh |
| `i18n.ts` | i18next setup (en/es/fr from `src/locales/`) |
| `rate-limiter.ts` | Login attempt throttling |
| `secure-export.ts` | Tauri dialog-based file export |

## CI/CD

Single workflow: `.github/workflows/release.yml` — triggers on `v*` tags, builds Windows MSI/NSIS via `tauri-apps/tauri-action`. No CI for tests or type-checking.

## Commits & PRs

- PR title: `[minerva] Clear, concise description`
- Small, focused PRs
- Before committing: `pnpm tsc --noEmit` and `pnpm test`
- Explain what changed, why, and how it was verified
- New constraints ("never X", "always Y") → document in this file

## Agent Behavior

- Unclear requests → ask concrete questions before executing
- Simple, well-defined tasks → execute directly
- Complex changes (refactors, new features, architecture) → confirm understanding first
- Do not assume implicit requirements; ask if information is missing
- **Read the relevant `docs/` file before modifying any feature** — they contain detailed architecture decisions and implementation specifics