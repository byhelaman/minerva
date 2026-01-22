-- ============================================
-- Minerva v2 - 004: API Functions
-- ============================================
-- Run AFTER 003_auth_hook.sql
-- Funciones RPC para el cliente

-- =============================================
-- API: Get current user's profile with permissions
-- =============================================
-- Nota: El cliente puede leer del JWT directamente,
-- pero esta función es útil para obtener datos frescos
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT json_build_object(
        'id', p.id,
        'email', p.email,
        'display_name', p.display_name,
        'role', p.role,
        'hierarchy_level', r.hierarchy_level,
        'permissions', (
            SELECT COALESCE(json_agg(perm.name), '[]'::json)
            FROM public.permissions perm
            WHERE perm.min_role_level <= r.hierarchy_level
        )
    )
    FROM public.profiles p
    JOIN public.roles r ON p.role = r.name
    WHERE p.id = auth.uid();
$$;

-- =============================================
-- API: Check email exists (for signup validation)
-- =============================================
CREATE OR REPLACE FUNCTION public.check_email_exists(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (SELECT 1 FROM public.profiles WHERE email = p_email);
$$;

-- =============================================
-- API: Update current user's display name
-- =============================================
CREATE OR REPLACE FUNCTION public.update_my_display_name(new_display_name TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.profiles
    SET display_name = new_display_name,
        updated_at = NOW()
    WHERE id = auth.uid();
END;
$$;

-- =============================================
-- Permisos
-- =============================================
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_email_exists(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_my_display_name(TEXT) TO authenticated;
