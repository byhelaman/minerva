-- Migración para corregir el error de "duplicate key" al reconectar Zoom
-- Reemplaza la función store_zoom_credentials para limpiar secretos previos.

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
SECURITY DEFINER -- Ejecuta como superuser
SET search_path = public, vault, extensions
AS $$
DECLARE
    v_access_id UUID;
    v_refresh_id UUID;
    v_expires_at TIMESTAMPTZ;
    v_access_name TEXT;
    v_refresh_name TEXT;
BEGIN
    -- Calcular expiración
    v_expires_at := now() + (p_expires_in || ' seconds')::INTERVAL;
    
    -- Definir nombres de secretos
    v_access_name := 'zoom_access_token_' || p_user_id;
    v_refresh_name := 'zoom_refresh_token_' || p_user_id;

    -- 1. LIMPIEZA PREVIA: Borrar secretos existentes con el mismo nombre para evitar conflicto
    -- Nota: Accedemos directamente a vault.secrets porque somos SECURITY DEFINER
    DELETE FROM vault.secrets WHERE name IN (v_access_name, v_refresh_name);

    -- 2. Guardar secretos en Vault
    -- vault.create_secret(secret, name, description)
    v_access_id := vault.create_secret(p_access_token, v_access_name, 'Zoom Access Token');
    v_refresh_id := vault.create_secret(p_refresh_token, v_refresh_name, 'Zoom Refresh Token');

    -- 3. Limpiar cuenta existente de la tabla zoom_account (Solo permitimos una cuenta)
    DELETE FROM public.zoom_account WHERE id != '00000000-0000-0000-0000-000000000000';

    -- 4. Insertar registro
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
