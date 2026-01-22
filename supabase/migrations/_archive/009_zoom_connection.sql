-- ============================================
-- ZOOM INTEGRATION: PHASE 1 (Connection & Auth) - VAULT EDITION
-- ============================================

-- 1. Enable Vault Extension
-- NOTE: If you get "permission denied", enable 'supabase_vault' (and 'pgsodium') manually in Supabase Dashboard > Database > Extensions
-- CREATE EXTENSION IF NOT EXISTS supabase_vault;

-- 2. Zoom Account Table (Store References to Vault)
CREATE TABLE IF NOT EXISTS public.zoom_account (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Metadata no sensible
    zoom_user_id TEXT NOT NULL,
    zoom_email TEXT NOT NULL,
    zoom_name TEXT,
    
    -- Referencias a Vault (UUIDs de la tabla vault.secrets)
    access_token_id UUID NOT NULL,
    refresh_token_id UUID NOT NULL,
    
    token_type TEXT DEFAULT 'Bearer',
    scope TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    
    connected_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Aseguramos que solo haya UNA cuenta conectada
CREATE UNIQUE INDEX IF NOT EXISTS idx_zoom_account_single ON public.zoom_account ((true));

-- RLS: EXTREME SECURITY
ALTER TABLE public.zoom_account ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service Role Full Access" ON public.zoom_account
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 3. Función RPC Segura para Guardar Credenciales (Atomic)
-- Esta función:
--   1. Crea secretos en Vault
--   2. Borra cuenta anterior
--   3. Inserta nueva cuenta con referencias
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
SECURITY DEFINER -- Ejecuta como superuser para acceder a vault
SET search_path = public, vault, extensions -- Asegura acceso a schemas
AS $$
DECLARE
    v_access_id UUID;
    v_refresh_id UUID;
    v_expires_at TIMESTAMPTZ;
BEGIN
    -- Calcular expiración
    v_expires_at := now() + (p_expires_in || ' seconds')::INTERVAL;

    -- 1. Guardar secretos en Vault
    -- vault.create_secret(secret, name, description)
    v_access_id := vault.create_secret(p_access_token, 'zoom_access_token_' || p_user_id, 'Zoom Access Token');
    v_refresh_id := vault.create_secret(p_refresh_token, 'zoom_refresh_token_' || p_user_id, 'Zoom Refresh Token');

    -- 2. Limpiar cuenta existente (Solo permitimos una cuenta activa)
    -- Opcional: Limpiar secretos viejos de vault también para no acumular basura?
    -- Por simplicidad, dejamos que vault acumule o limpiamos manualmente.
    -- TODO: Implementar limpieza de secretos huérfanos si es necesario.
    DELETE FROM public.zoom_account WHERE id != '00000000-0000-0000-0000-000000000000';

    -- 3. Insertar registro
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

-- 4. Vista para recuperar tokens desencriptados (Solo Service Role)
-- Esta vista une zoom_account con vault.decrypted_secrets
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

-- Proteger la vista: Revocar acceso a public, dar solo a service_role?
-- Las vistas no tienen RLS, pero podemos restringir GRANT.
REVOKE ALL ON zoom_credentials_decrypted FROM PUBLIC, anon, authenticated;
GRANT SELECT ON zoom_credentials_decrypted TO service_role;


-- 5. OAuth States (Igual que antes)
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

-- Funciones RPC para States
CREATE OR REPLACE FUNCTION create_oauth_state(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_state TEXT;
BEGIN
    v_state := encode(gen_random_bytes(32), 'hex');
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
