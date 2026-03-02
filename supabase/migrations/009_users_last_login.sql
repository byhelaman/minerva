-- ============================================
-- Minerva v2 — 009: Users Last Login
-- ============================================
-- Extiende get_all_users() para exponer último login desde auth.users.last_sign_in_at.

DROP FUNCTION IF EXISTS public.get_all_users();

CREATE OR REPLACE FUNCTION public.get_all_users()
RETURNS TABLE (
    id UUID,
    email TEXT,
    display_name TEXT,
    role TEXT,
    hierarchy_level INT,
    created_at TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.has_permission('users.view') THEN
        RAISE EXCEPTION 'Permission denied: requires users.view permission';
    END IF;

    RETURN QUERY
    SELECT
        p.id,
        p.email,
        p.display_name,
        p.role,
        r.hierarchy_level,
        p.created_at,
        au.last_sign_in_at
    FROM public.profiles p
    JOIN public.roles r ON p.role = r.name
    LEFT JOIN auth.users au ON au.id = p.id
    ORDER BY r.hierarchy_level DESC, p.created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.get_all_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_all_users() TO authenticated;