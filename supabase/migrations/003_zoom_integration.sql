-- ============================================
-- Minerva v2 - 003: Zoom Integration (Vault + OAuth + Sync Tables)
-- ============================================
-- Ejecutar después de 002_user_management.sql.

-- 1. Enable Vault Extension (manual si es necesario en Dashboard)
-- CREATE EXTENSION IF NOT EXISTS supabase_vault;

-- =============================================
-- ZOOM ACCOUNT (Vault References)
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_zoom_account_single ON public.zoom_account ((true));

ALTER TABLE public.zoom_account ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service Role Full Access" ON public.zoom_account
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

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
SET search_path = public, vault, extensions
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

CREATE OR REPLACE VIEW zoom_credentials_decrypted AS
SELECT
    za.id,
    za.zoom_user_id,
    za.zoom_email,
    za.expires_at,
    s_access.decrypted_secret as access_token,
    s_refresh.decrypted_secret as refresh_token
FROM
    public.zoom_account za
LEFT JOIN vault.decrypted_secrets s_access ON za.access_token_id = s_access.id
LEFT JOIN vault.decrypted_secrets s_refresh ON za.refresh_token_id = s_refresh.id;

REVOKE ALL ON zoom_credentials_decrypted FROM PUBLIC, anon, authenticated;
GRANT SELECT ON zoom_credentials_decrypted TO service_role;

-- =============================================
-- OAUTH STATES
-- =============================================
CREATE TABLE IF NOT EXISTS public.oauth_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    state TEXT NOT NULL UNIQUE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oauth_states_expires ON public.oauth_states(expires_at);
ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service Role Full Access States" ON public.oauth_states
    FOR ALL TO service_role USING (true) WITH CHECK (true);

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

-- =============================================
-- ZOOM SYNC TABLES
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

CREATE POLICY "Allow read for valid roles" ON public.zoom_users
    FOR SELECT TO authenticated
    USING (
        ((SELECT auth.jwt()) -> 'permissions')::jsonb ? 'meetings.search'
    );

CREATE POLICY "Allow full access for service_role" ON public.zoom_users
    FOR ALL TO service_role USING (true) WITH CHECK (true);

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

ALTER TABLE public.zoom_meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read for valid roles" ON public.zoom_meetings
    FOR SELECT TO authenticated
    USING (
        ((SELECT auth.jwt()) -> 'permissions')::jsonb ? 'meetings.search'
    );

CREATE POLICY "Allow full access for service_role" ON public.zoom_meetings
    FOR ALL TO service_role USING (true) WITH CHECK (true);
