-- ============================================
-- 016: Update microsoft_credentials_decrypted view
-- Include microsoft_name to support token refresh RPC
-- ============================================

CREATE OR REPLACE VIEW microsoft_credentials_decrypted
(
    id,
    microsoft_user_id,
    microsoft_email,
    expires_at,
    access_token,
    refresh_token,
    microsoft_name
) AS
SELECT
    ma.id,
    ma.microsoft_user_id,
    ma.microsoft_email,
    ma.expires_at,
    s_access.decrypted_secret as access_token,
    s_refresh.decrypted_secret as refresh_token,
    ma.microsoft_name
FROM
    public.microsoft_account ma
    LEFT JOIN vault.decrypted_secrets s_access ON ma.access_token_id = s_access.id
    LEFT JOIN vault.decrypted_secrets s_refresh ON ma.refresh_token_id = s_refresh.id;

REVOKE ALL ON microsoft_credentials_decrypted FROM PUBLIC, anon, authenticated;
GRANT SELECT ON microsoft_credentials_decrypted TO service_role;
