# Minerva v2

Role-based authentication management system using Supabase and Tauri.

## Requirements

- Node.js 18+
- pnpm
- Rust (for Tauri)
- Supabase account

## Local Installation

```bash
# Clone repository
git clone <url> && cd minerva

# Install dependencies
pnpm install

# Configure environment variables
cp .env.example .env
# Edit .env with your Supabase credentials

# Run in development
pnpm tauri dev
```

## Supabase Setup

### 1. Create Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Copy the URL and anon key to your `.env` file

### 2. Run Migrations (in order)

Execute each file in Supabase **SQL Editor**, following this order:

| Order | File | Description |
|-------|------|-------------|
| 1 | `001_core_access.sql` | Roles, permissions, profiles, auth hook, base RPCs, RLS, security trigger |
| 2 | `002_user_management.sql` | User/role/permission management RPCs + security checks |
| 3 | `003_zoom_integration.sql` | Zoom Vault tables, OAuth state, sync tables, and RLS |
| 4 | `004_webhooks_bug_reports.sql` | Webhook events + cleanup function + bug reports |
| 5 | `005_realtime_security.sql` | Realtime configuration for profiles |

## Integrations

### Zoom Integration 🎥
Minerva v2 supports connecting a Zoom account for automated meeting creation.
- **Documentation**: See **System → Documentation** in the app.
- **Features**: Auth (OAuth 2.0), Status Check, Disconnect, **Sync Data (Users & Meetings)**.
- **Security**: Based on Supabase Vault and Server-to-Server OAuth.

### 3. Enable Auth Hook

1. Go to **Dashboard → Authentication → Hooks**
2. Find **"Customize Access Token (JWT) Claims"**
3. Select schema `public`, function `custom_access_token_hook`
4. Save

### 4. Configure Email Templates (OTP)

In **Dashboard → Authentication → Email Templates**:

#### Reset Password
```html
<h2>Reset Password</h2>
<p>Use this code to reset your password:</p>
<p style="font-size: 32px; font-weight: bold; letter-spacing: 8px; padding: 16px;">{{ .Token }}</p>
<p>This code expires in 1 hour.</p>
<p>If you didn't request a password reset, please ignore this email.</p>
```

#### Confirm Signup
```html
<h2>Confirm your signup</h2>
<p>Use this code to verify your email address:</p>
<p style="font-size: 32px; font-weight: bold; letter-spacing: 8px; padding: 16px;">{{ .Token }}</p>
<p>This code expires in 24 hours.</p>
<p>If you didn't create an account, please ignore this email.</p>
```

## Role System

| Role | Level | Permissions |
|------|-------|-------------|
| viewer | 10 | Read-only access to own schedules |
| operator | 50 | Create/edit schedules, Zoom search |
| moderator | 60 | Manage Zoom links and assignments |
| admin | 80 | Manage users and settings |
| super_admin | 100 | Full system control |

## Authentication Architecture

```
┌─────────────┐      ┌──────────────┐    ┌─────────────┐
│   Client    │ ───▶ │  Supabase    │───▶│  PostgreSQL │
│   (Tauri)   │      │  Auth + JWT  │    │  + RLS      │
└─────────────┘      └──────────────┘    └─────────────┘
       │                    │
       │  Custom Claims     │
       │  (user_role,       │
       │   hierarchy_level) │
       ▼                    ▼
   Reads from JWT    Auth Hook injects
   without RPC       claims on login
```

## Environment Variables

```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJxxxx...
```

## Production Build

```bash
pnpm tauri build
```

The executable will be in `src-tauri/target/release/`.

## Security Features

- ✅ RLS enabled on all tables
- ✅ JWT Custom Claims (no extra queries per request)
- ✅ Privilege escalation prevention trigger
- ✅ SECURITY DEFINER with secure search_path
- ✅ Policies using `auth.jwt()` for performance
- ✅ Secure File System Access (Sandboxed + Native Dialogs)
- ✅ Principle of Least Privilege for Export Operations

## Troubleshooting

### "Invalid JWT" Error (401)
If you encounter this error during synchronization, it is likely due to strict token validation at the Gateway level.

**Solution:**
Deploy the function with the `--no-verify-jwt` flag to rely on the function's internal security logic:
   ```bash
   supabase functions deploy zoom-sync --no-verify-jwt
   ```

### "Failed to refresh Zoom token" Error (400)
If you see this error, it means the **Refresh Token** in the database is no longer valid.
- **Cause**: The same Zoom App credentials were connected to another project/environment (e.g., localhost vs production). Zoom rotates refresh tokens; using it in one place invalidates the old one.
- **Solution**: Go to **Settings**, click **Disconnect**, and then **Connect Zoom** again. This generates a fresh pair of tokens valid for this environment.
