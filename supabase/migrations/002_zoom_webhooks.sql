-- ============================================
-- Minerva v2 — 002: Zoom + Webhooks + Bug Reports
-- ============================================
-- Zoom Vault credentials, OAuth, sync tables, webhook events, bug reports.
-- Consolidates: 003_zoom_integration, 004_webhooks_bug_reports
-- Depends on: 001_foundation.sql
-- Requires supabase_vault extension enabled.

-- =============================================
-- 1. ZOOM ACCOUNT (Vault references)
-- =============================================
CREATE TABLE IF NOT EXISTS public.zoom_account (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zoom_user_id TEXT NOT NULL,
    zoom_email TEXT NOT NULL,
    zoom_name TEXT,
    access_token_id UUID NOT NULL,
    refresh_token_id UUID NOT NULL,
    token_type TEXT DEFAULT 'Bearer',
    scope TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    connected_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Only one active Zoom account allowed
CREATE UNIQUE INDEX IF NOT EXISTS idx_zoom_account_single ON public.zoom_account ((true));

ALTER TABLE public.zoom_account ENABLE ROW LEVEL SECURITY;

CREATE POLICY "zoom_account_service_role" ON public.zoom_account
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- Store Zoom credentials in Vault
CREATE OR REPLACE FUNCTION store_zoom_credentials(
    p_user_id TEXT,
    p_email TEXT,
    p_name TEXT,
    p_access_token TEXT,
    p_refresh_token TEXT,
    p_scope TEXT,
    p_expires_in INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_access_id UUID;
    v_refresh_id UUID;
    v_expires_at TIMESTAMPTZ;
    v_access_name TEXT;
    v_refresh_name TEXT;
BEGIN
    v_expires_at := now() + (p_expires_in || ' seconds')::INTERVAL;
    v_access_name := 'zoom_access_token_' || p_user_id;
    v_refresh_name := 'zoom_refresh_token_' || p_user_id;

    DELETE FROM vault.secrets WHERE name IN (v_access_name, v_refresh_name);

    v_access_id := vault.create_secret(p_access_token, v_access_name, 'Zoom Access Token');
    v_refresh_id := vault.create_secret(p_refresh_token, v_refresh_name, 'Zoom Refresh Token');

    DELETE FROM public.zoom_account WHERE id != '00000000-0000-0000-0000-000000000000';

    INSERT INTO public.zoom_account (
        zoom_user_id, zoom_email, zoom_name,
        access_token_id, refresh_token_id,
        scope, expires_at
    ) VALUES (
        p_user_id, p_email, p_name,
        v_access_id, v_refresh_id,
        p_scope, v_expires_at
    );
END;
$$;

REVOKE ALL ON FUNCTION store_zoom_credentials(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION store_zoom_credentials(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INT) TO service_role;

-- Decrypted credentials view (service_role only)
CREATE OR REPLACE VIEW zoom_credentials_decrypted AS
SELECT
    za.id,
    za.zoom_user_id,
    za.zoom_email,
    za.expires_at,
    s_access.decrypted_secret AS access_token,
    s_refresh.decrypted_secret AS refresh_token
FROM public.zoom_account za
LEFT JOIN vault.decrypted_secrets s_access ON za.access_token_id = s_access.id
LEFT JOIN vault.decrypted_secrets s_refresh ON za.refresh_token_id = s_refresh.id;

REVOKE ALL ON zoom_credentials_decrypted FROM PUBLIC, anon, authenticated;
GRANT SELECT ON zoom_credentials_decrypted TO service_role;

-- Delete Zoom secrets from Vault
CREATE OR REPLACE FUNCTION delete_zoom_secrets(p_secret_ids UUID[])
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    DELETE FROM vault.secrets WHERE id = ANY(p_secret_ids);
END;
$$;

REVOKE ALL ON FUNCTION delete_zoom_secrets(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION delete_zoom_secrets(UUID[]) TO service_role;

-- =============================================
-- 2. OAUTH STATES
-- =============================================
CREATE TABLE IF NOT EXISTS public.oauth_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    state TEXT NOT NULL UNIQUE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oauth_states_expires ON public.oauth_states(expires_at);
CREATE INDEX IF NOT EXISTS idx_oauth_states_user_id ON public.oauth_states(user_id);

ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "oauth_states_service_role" ON public.oauth_states
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION create_oauth_state(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_state TEXT;
BEGIN
    v_state := encode(extensions.gen_random_bytes(32), 'hex');
    DELETE FROM public.oauth_states WHERE expires_at < now();
    INSERT INTO public.oauth_states (state, user_id, expires_at)
    VALUES (v_state, p_user_id, now() + interval '10 minutes');
    RETURN v_state;
END;
$$;

REVOKE ALL ON FUNCTION create_oauth_state(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_oauth_state(UUID) TO service_role;

CREATE OR REPLACE FUNCTION validate_oauth_state(p_state TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID;
BEGIN
    SELECT user_id INTO v_user_id
    FROM public.oauth_states
    WHERE state = p_state AND expires_at > now();

    IF v_user_id IS NOT NULL THEN
        DELETE FROM public.oauth_states WHERE state = p_state;
    END IF;

    RETURN v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION validate_oauth_state(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION validate_oauth_state(TEXT) TO service_role;

-- =============================================
-- 3. ZOOM SYNC TABLES
-- =============================================
CREATE TABLE IF NOT EXISTS public.zoom_users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    display_name TEXT,
    created_at TIMESTAMPTZ,
    synced_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.zoom_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "zoom_users_select" ON public.zoom_users
    FOR SELECT TO authenticated
    USING (((SELECT auth.jwt()) -> 'permissions')::jsonb ? 'meetings.search');

CREATE POLICY "zoom_users_service_role" ON public.zoom_users
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.zoom_meetings (
    meeting_id TEXT PRIMARY KEY,
    uuid TEXT,
    host_id TEXT NOT NULL,
    topic TEXT,
    type INTEGER,
    start_time TIMESTAMPTZ,
    duration INTEGER,
    timezone TEXT,
    join_url TEXT,
    created_at TIMESTAMPTZ,
    synced_at TIMESTAMPTZ DEFAULT now(),
    last_event_timestamp BIGINT
);

CREATE INDEX IF NOT EXISTS idx_zoom_meetings_host_id ON public.zoom_meetings(host_id);

ALTER TABLE public.zoom_meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "zoom_meetings_select" ON public.zoom_meetings
    FOR SELECT TO authenticated
    USING (((SELECT auth.jwt()) -> 'permissions')::jsonb ? 'meetings.search');

CREATE POLICY "zoom_meetings_service_role" ON public.zoom_meetings
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "zoom_meetings_insert" ON public.zoom_meetings
    FOR INSERT TO authenticated
    WITH CHECK (((SELECT auth.jwt()) -> 'permissions')::jsonb ? 'meetings.create');

CREATE POLICY "zoom_meetings_update" ON public.zoom_meetings
    FOR UPDATE TO authenticated
    USING (((SELECT auth.jwt()) -> 'permissions')::jsonb ? 'meetings.create')
    WITH CHECK (((SELECT auth.jwt()) -> 'permissions')::jsonb ? 'meetings.create');

CREATE POLICY "zoom_meetings_delete" ON public.zoom_meetings
    FOR DELETE TO authenticated
    USING (((SELECT auth.jwt()) -> 'permissions')::jsonb ? 'meetings.delete');

-- =============================================
-- 4. WEBHOOK EVENTS
-- =============================================
CREATE TABLE IF NOT EXISTS public.webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    processed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    processed_at TIMESTAMPTZ
);

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "webhook_events_service_role" ON public.webhook_events
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_webhook_events_event_type ON public.webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_events_created_at ON public.webhook_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_events_unprocessed ON public.webhook_events(created_at)
    WHERE processed = false;

CREATE OR REPLACE FUNCTION public.cleanup_old_webhook_events(days_to_keep int DEFAULT 30)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    deleted_count int;
BEGIN
    WITH deleted AS (
        DELETE FROM public.webhook_events
        WHERE processed = true
          AND created_at < now() - (days_to_keep || ' days')::interval
        RETURNING *
    )
    SELECT count(*) INTO deleted_count FROM deleted;

    RAISE NOTICE 'Deleted % old webhook events (older than % days)', deleted_count, days_to_keep;
    RETURN deleted_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_old_webhook_events(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_webhook_events(int) TO service_role;

CREATE OR REPLACE FUNCTION public.get_active_meetings()
RETURNS TABLE (meeting_id TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    WITH meeting_events AS (
        SELECT
            (payload->'object'->>'id')::TEXT AS meeting_id,
            event_type,
            created_at
        FROM public.webhook_events
        WHERE event_type IN ('meeting.started', 'meeting.ended')
    ),
    latest_events AS (
        SELECT DISTINCT ON (meeting_id)
            meeting_id,
            event_type
        FROM meeting_events
        ORDER BY meeting_id, created_at DESC
    )
    SELECT meeting_id
    FROM latest_events
    WHERE event_type = 'meeting.started';
$$;

REVOKE EXECUTE ON FUNCTION public.get_active_meetings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_active_meetings() TO authenticated;

-- =============================================
-- 5. BUG REPORTS
-- =============================================
CREATE TABLE IF NOT EXISTS public.bug_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL CHECK (char_length(title) >= 5 AND char_length(title) <= 50),
    description TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_email TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.bug_reports IS 'Reportes de bugs enviados por usuarios';

ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bug_reports_insert" ON public.bug_reports
    FOR INSERT TO authenticated
    WITH CHECK (true);

CREATE POLICY "bug_reports_select" ON public.bug_reports
    FOR SELECT TO authenticated
    USING (
        user_id = (SELECT auth.uid())
        OR COALESCE(((SELECT auth.jwt()) ->> 'hierarchy_level')::int, 0) >= 80
    );

CREATE POLICY "bug_reports_update_admin" ON public.bug_reports
    FOR UPDATE TO authenticated
    USING (COALESCE(((SELECT auth.jwt()) ->> 'hierarchy_level')::int, 0) >= 80);

CREATE INDEX IF NOT EXISTS idx_bug_reports_user_id ON public.bug_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_bug_reports_status ON public.bug_reports(status);
CREATE INDEX IF NOT EXISTS idx_bug_reports_created_at ON public.bug_reports(created_at DESC);

-- =============================================
-- MANUAL STEP: Configure pg_cron for cleanup
-- =============================================
-- SELECT cron.schedule('cleanup-webhooks', '0 3 * * *', $$SELECT public.cleanup_old_webhook_events(30)$$);
