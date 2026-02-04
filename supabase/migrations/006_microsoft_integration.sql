-- ============================================
-- Minerva v2 - 006: Microsoft Integration (Vault + Tables + Incidences)
-- ============================================

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
    
    -- New Architecture: Folder for Monthly Schedules + File for Master Incidences
    schedules_folder_id TEXT,
    schedules_folder_name TEXT,

    incidences_file_id TEXT,
    incidences_file_name TEXT,
    incidences_worksheet_id TEXT,
    incidences_worksheet_name TEXT,
    incidences_table_id TEXT,
    incidences_table_name TEXT,

    connected_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_microsoft_account_single ON public.microsoft_account ((true));

ALTER TABLE public.microsoft_account ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service Role Full Access MS" ON public.microsoft_account
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);


-- =============================================
-- RPC: Store Credentials (Auth Flow)
-- =============================================
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
SET search_path = public, vault, extensions
AS $$
DECLARE
    v_access_id UUID;
    v_refresh_id UUID;
    v_expires_at TIMESTAMPTZ;
    v_access_name TEXT;
    v_refresh_name TEXT;
    
    -- Variables to preserve existing config
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

    -- Update Vault Secrets
    DELETE FROM vault.secrets WHERE name IN (v_access_name, v_refresh_name);
    v_access_id := vault.create_secret(p_access_token, v_access_name, 'Microsoft Access Token');
    v_refresh_id := vault.create_secret(p_refresh_token, v_refresh_name, 'Microsoft Refresh Token');

    -- Get existing config if preserving for same user
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

    -- Clear table (Single account policy)
    DELETE FROM public.microsoft_account WHERE id != '00000000-0000-0000-0000-000000000000';

    -- Insert new record
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

-- =============================================
-- VIEW: Decrypted Credentials
-- =============================================
CREATE OR REPLACE VIEW microsoft_credentials_decrypted AS
SELECT
    ma.id,
    ma.microsoft_user_id,
    ma.microsoft_email,
    ma.expires_at,
    s_access.decrypted_secret as access_token,
    s_refresh.decrypted_secret as refresh_token
FROM
    public.microsoft_account ma
LEFT JOIN vault.decrypted_secrets s_access ON ma.access_token_id = s_access.id
LEFT JOIN vault.decrypted_secrets s_refresh ON ma.refresh_token_id = s_refresh.id;

REVOKE ALL ON microsoft_credentials_decrypted FROM PUBLIC, anon, authenticated;
GRANT SELECT ON microsoft_credentials_decrypted TO service_role;

-- =============================================
-- RPC: Update Configuration (Dual File)
-- =============================================
CREATE OR REPLACE FUNCTION update_microsoft_config(
    p_type TEXT, -- 'schedules_folder' OR 'incidences_file'
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
SET search_path = public
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
