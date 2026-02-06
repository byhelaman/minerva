-- Migration: Add RPC to verify user password without creating a new session
-- Fixes S-1: verifyCurrentPassword using signInWithPassword causes session side-effects

CREATE OR REPLACE FUNCTION verify_user_password
(p_password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path
= public, extensions
AS $$
DECLARE
    v_user_id UUID;
    v_encrypted_password TEXT;
BEGIN
    -- Get the calling user's ID from the JWT
    v_user_id := auth.uid
();
IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
END
IF;

    -- Fetch the encrypted password from auth.users
    SELECT encrypted_password
INTO v_encrypted_password
FROM auth.users
WHERE id = v_user_id;

IF v_encrypted_password IS NULL THEN
RETURN FALSE;
END
IF;

    -- Use extensions.crypt() from pgcrypto to compare (bcrypt-compatible)
    RETURN v_encrypted_password
= extensions.crypt
(p_password, v_encrypted_password);
END;
$$;

-- Only authenticated users can verify their own password
REVOKE ALL ON FUNCTION verify_user_password
(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION verify_user_password
(TEXT) TO authenticated;
