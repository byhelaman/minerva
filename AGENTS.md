# Minerva v2 — Agent Guidelines

Tauri 2 desktop app (Rust + React 19 + Vite 7) for educational schedule management with Zoom matching and OneDrive integration. Backend: Supabase (PostgreSQL + Deno Edge Functions). Supports en/es/fr via i18next.

## Build & Test Commands

```sh
pnpm dev                           # Vite dev server (port 1420)
pnpm tauri dev                     # Full desktop dev (Vite + native window)
pnpm build                         # tsc && vite build
pnpm tauri build                   # Production build (MSI/NSIS → src-tauri/target/release/)
pnpm test                          # Vitest watch mode
pnpm test:run                      # Vitest single run
pnpm vitest run -t "test name"     # Run a single test by name
pnpm tsc --noEmit                  # Type-check (there is NO lint script)
```

Always use **pnpm**. There is no `pnpm lint` — use `pnpm tsc --noEmit` for type-checking.

## Architecture

### Provider hierarchy (`src/main.tsx`)

MSAL initializes first (async), then: `MsalProvider → ThemeProvider → AuthProvider → BrowserRouter → SettingsProvider → App`

### Routing (`src/App.tsx`)

Flat routes via react-router-dom v7. `src/routes/` is unused.
- `/login` — public
- All others wrapped in `<ProtectedRoute>` + `<GlobalSyncManager>`
- `/system` — admin only (`hierarchy_level >= 80`)
- `/reports` — requires `reports.view` permission

### Feature-based organization (`src/features/`)

| Feature | Purpose |
|---|---|
| `schedules/` | Schedule CRUD, Excel upload/parse (xlsx), publishing, incidences |
| `matching/` | Zoom meeting matching engine — scorer, penalties, Web Worker |
| `auth/` | Login, signup, OTP, password reset |
| `system/` | Admin panel, roles, reports, `GlobalSyncManager` |
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

Three-tier search: exact normalized → Fuse.js fuzzy → token set fallback. Runs off main thread in a **Web Worker** (`match.worker.ts`). Config in `matching/config/matching.config.json`.

### Supabase Edge Functions (`supabase/functions/`, Deno)

`zoom-api`, `zoom-auth`, `zoom-sync`, `zoom-webhook`, `microsoft-auth`, `microsoft-graph`. Most deploy with `--no-verify-jwt` (custom auth inside). Shared utils in `_shared/`.

### Auth & security

- Supabase Auth with JWT custom claims (`custom_access_token_hook`)
- Microsoft MSAL with PKCE for OneDrive access
- RLS on all tables; role hierarchy: viewer(10) → operator(50) → admin(80) → super_admin(100)
- Desktop session: PKCE, localStorage (`minerva-auth-token`), manual auto-refresh tied to window visibility

## Code Style

- TypeScript strict mode — avoid `any`, prefer inference
- **Tailwind CSS 4** only (CSS-first config in `src/index.css`, no `tailwind.config.ts`)
- **shadcn/ui** (New York style) + Radix UI — components in `src/components/ui/`
- **Lucide React** icons — always explicit imports, never barrel imports
- Forms: React Hook Form + Zod resolvers. Schemas in `schedules/schemas/`
- Tables: TanStack Table with custom columns in `schedules/components/table/`
- Toasts via **Sonner**; command palette via **cmdk**
- ESM only; prefer modern browser APIs
- `src/features/system/_archive` is excluded from compilation

## Testing

- Tests live in `tests/` at project root (not co-located)
- Vitest with globals enabled — `describe`, `it`, `expect` available without imports
- Current tests cover the matching engine exclusively
- After changing behavior: add or update tests, even if not explicitly asked
- After moving files or changing imports: run `pnpm tsc --noEmit`

## Shared Utilities (`src/lib/`)

| File | Purpose |
|---|---|
| `utils.ts` | `cn()` for Tailwind class merging, ISO date helpers |
| `constants.ts` | All localStorage keys (`minerva_` prefix) |
| `logger.ts` | Level-based logging (silences debug/info in prod) |
| `supabase.ts` | Desktop-optimized Supabase client with proactive token refresh |
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