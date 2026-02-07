-- ============================================
-- Minerva v2 — 005: Microsoft Integration
-- ============================================
-- Vault + OAuth + OneDrive config + cleanup RPCs.
-- Depende de 001_core_access.sql.
-- Requiere extensión supabase_vault habilitada.

-- =============================================
-- MICROSOFT ACCOUNT
-- =============================================
CREATE TABLE IF NOT EXISTS public.microsoft_account (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    microsoft_user_id TEXT NOT NULL,
    microsoft_email TEXT NOT NULL,
    microsoft_name TEXT,
    access_token_id UUID NOT NULL,
    refresh_token_id UUID NOT NULL,
    token_type TEXT DEFAULT 'Bearer',
    scope TEXT,
    expires_at TIMESTAMPTZ NOT NULL,

    -- Configuración: Carpeta para horarios mensuales
    schedules_folder_id TEXT,
    schedules_folder_name TEXT,

    -- Configuración: Archivo maestro de incidencias
    incidences_file_id TEXT,
    incidences_file_name TEXT,
    incidences_worksheet_id TEXT,
    incidences_worksheet_name TEXT,
    incidences_table_id TEXT,
    incidences_table_name TEXT,

    connected_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Restricción: solo una cuenta Microsoft activa
CREATE UNIQUE INDEX IF NOT EXISTS idx_microsoft_account_single ON public.microsoft_account ((true));

ALTER TABLE public.microsoft_account ENABLE ROW LEVEL SECURITY;

CREATE POLICY "microsoft_account_service_role" ON public.microsoft_account
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- =============================================
-- RPC: Almacenar credenciales Microsoft en Vault
-- =============================================
-- FIX: search_path = '' (antes era 'public, vault, extensions')
-- FIX: REVOKE/GRANT restringido a service_role
CREATE OR REPLACE FUNCTION store_microsoft_credentials(
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

    -- Variables para preservar configuración existente
    v_schedules_folder_id TEXT;
    v_schedules_folder_name TEXT;
    v_incidences_file_id TEXT;
    v_incidences_file_name TEXT;
    v_incidences_worksheet_id TEXT;
    v_incidences_worksheet_name TEXT;
    v_incidences_table_id TEXT;
    v_incidences_table_name TEXT;
BEGIN
    v_expires_at := now() + (p_expires_in || ' seconds')::INTERVAL;
    v_access_name := 'microsoft_access_token_' || p_user_id;
    v_refresh_name := 'microsoft_refresh_token_' || p_user_id;

    -- Limpiar secrets anteriores
    DELETE FROM vault.secrets WHERE name IN (v_access_name, v_refresh_name);
    v_access_id := vault.create_secret(p_access_token, v_access_name, 'Microsoft Access Token');
    v_refresh_id := vault.create_secret(p_refresh_token, v_refresh_name, 'Microsoft Refresh Token');

    -- Preservar configuración existente del mismo usuario
    SELECT
        schedules_folder_id, schedules_folder_name,
        incidences_file_id, incidences_file_name,
        incidences_worksheet_id, incidences_worksheet_name,
        incidences_table_id, incidences_table_name
    INTO
        v_schedules_folder_id, v_schedules_folder_name,
        v_incidences_file_id, v_incidences_file_name,
        v_incidences_worksheet_id, v_incidences_worksheet_name,
        v_incidences_table_id, v_incidences_table_name
    FROM public.microsoft_account
    WHERE microsoft_user_id = p_user_id
    LIMIT 1;

    -- Política de cuenta única: eliminar registros anteriores
    DELETE FROM public.microsoft_account WHERE id != '00000000-0000-0000-0000-000000000000';

    INSERT INTO public.microsoft_account (
        microsoft_user_id, microsoft_email, microsoft_name,
        access_token_id, refresh_token_id,
        scope, expires_at,
        schedules_folder_id, schedules_folder_name,
        incidences_file_id, incidences_file_name,
        incidences_worksheet_id, incidences_worksheet_name,
        incidences_table_id, incidences_table_name
    ) VALUES (
        p_user_id, p_email, p_name,
        v_access_id, v_refresh_id,
        p_scope, v_expires_at,
        v_schedules_folder_id, v_schedules_folder_name,
        v_incidences_file_id, v_incidences_file_name,
        v_incidences_worksheet_id, v_incidences_worksheet_name,
        v_incidences_table_id, v_incidences_table_name
    );
END;
$$;

REVOKE ALL ON FUNCTION store_microsoft_credentials(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION store_microsoft_credentials(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INT) TO service_role;

-- =============================================
-- VIEW: Credenciales desencriptadas (incluye microsoft_name)
-- =============================================
CREATE OR REPLACE VIEW microsoft_credentials_decrypted AS
SELECT
    ma.id,
    ma.microsoft_user_id,
    ma.microsoft_email,
    ma.microsoft_name,
    ma.expires_at,
    s_access.decrypted_secret AS access_token,
    s_refresh.decrypted_secret AS refresh_token
FROM public.microsoft_account ma
LEFT JOIN vault.decrypted_secrets s_access ON ma.access_token_id = s_access.id
LEFT JOIN vault.decrypted_secrets s_refresh ON ma.refresh_token_id = s_refresh.id;

REVOKE ALL ON microsoft_credentials_decrypted FROM PUBLIC, anon, authenticated;
GRANT SELECT ON microsoft_credentials_decrypted TO service_role;

-- =============================================
-- RPC: Actualizar configuración OneDrive
-- =============================================
-- FIX: search_path = '' (antes era 'public')
-- FIX: REVOKE/GRANT restringido a service_role
CREATE OR REPLACE FUNCTION update_microsoft_config(
    p_type TEXT,  -- 'schedules_folder' OR 'incidences_file'
    p_id TEXT,
    p_name TEXT,
    p_worksheet_id TEXT DEFAULT NULL,
    p_worksheet_name TEXT DEFAULT NULL,
    p_table_id TEXT DEFAULT NULL,
    p_table_name TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF p_type = 'schedules_folder' THEN
        UPDATE public.microsoft_account
        SET
            schedules_folder_id = p_id,
            schedules_folder_name = p_name,
            updated_at = now()
        WHERE id IS NOT NULL;

    ELSIF p_type = 'incidences_file' THEN
        UPDATE public.microsoft_account
        SET
            incidences_file_id = p_id,
            incidences_file_name = p_name,
            incidences_worksheet_id = p_worksheet_id,
            incidences_worksheet_name = p_worksheet_name,
            incidences_table_id = p_table_id,
            incidences_table_name = p_table_name,
            updated_at = now()
        WHERE id IS NOT NULL;

    ELSE
        RAISE EXCEPTION 'Invalid config type: %', p_type;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION update_microsoft_config(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION update_microsoft_config(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- =============================================
-- RPC: Eliminar secrets de Microsoft del Vault
-- =============================================
CREATE OR REPLACE FUNCTION delete_microsoft_secrets(p_secret_ids UUID[])
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    DELETE FROM vault.secrets WHERE id = ANY(p_secret_ids);
END;
$$;

REVOKE ALL ON FUNCTION delete_microsoft_secrets(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION delete_microsoft_secrets(UUID[]) TO service_role;
