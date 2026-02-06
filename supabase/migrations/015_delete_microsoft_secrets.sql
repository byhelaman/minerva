-- Migration: Add RPC to clean up Microsoft Vault secrets on disconnect
-- Mirrors pattern used for Zoom integration

CREATE OR REPLACE FUNCTION delete_microsoft_secrets(p_secret_ids UUID[])
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, extensions
AS $$
BEGIN
    DELETE FROM vault.secrets WHERE id = ANY(p_secret_ids);
END;
$$;

-- Only service_role should be able to call this
REVOKE ALL ON FUNCTION delete_microsoft_secrets(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION delete_microsoft_secrets(UUID[]) TO service_role;
