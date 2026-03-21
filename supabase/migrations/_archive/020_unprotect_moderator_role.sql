-- ============================================
-- Minerva v2 — 020: Unprotect moderator role
-- ============================================
-- Se eliminan los roles 'moderator' y 'operator' de las comprobaciones de roles del sistema,
-- permitiendo a los administradores modificar y eliminar este rol.

-- =============================================
-- GESTIÓN DE ROLES
-- =============================================

DROP FUNCTION IF EXISTS public.delete_role(TEXT);
CREATE OR REPLACE FUNCTION public.delete_role(role_name TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_level int;
    target_role_level int;
    users_with_role int;
BEGIN
    caller_level := COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level'))::int, 0);

    IF caller_level < 100 THEN
        RAISE EXCEPTION 'Permission denied: requires super_admin privileges';
    END IF;

    -- Proteger los roles vitales del sistema
    IF role_name IN ('super_admin', 'admin', 'viewer', 'guest') THEN
        RAISE EXCEPTION 'Cannot delete system role: %', role_name;
    END IF;

    SELECT hierarchy_level INTO target_role_level
    FROM public.roles WHERE name = role_name;

    IF target_role_level IS NULL THEN
        RAISE EXCEPTION 'Role not found: %', role_name;
    END IF;

    IF target_role_level >= caller_level THEN
        RAISE EXCEPTION 'Permission denied: cannot delete role with equal or higher level';
    END IF;

    SELECT COUNT(*) INTO users_with_role
    FROM public.profiles WHERE role = role_name;

    IF users_with_role > 0 THEN
        RAISE EXCEPTION 'Cannot delete role: % users are assigned to this role', users_with_role;
    END IF;

    DELETE FROM public.roles WHERE name = role_name;

    RETURN json_build_object('success', true, 'deleted_role', role_name);
END;
$$;

-- =============================================
-- GESTIÓN DE PERMISOS POR ROL
-- =============================================

DROP FUNCTION IF EXISTS public.assign_role_permission(TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.assign_role_permission(
    target_role TEXT,
    permission_name TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_level int;
    target_role_level int;
BEGIN
    caller_level := COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level'))::int, 0);

    IF caller_level < 100 THEN
        RAISE EXCEPTION 'Permission denied: requires super_admin privileges';
    END IF;

    SELECT hierarchy_level INTO target_role_level
    FROM public.roles WHERE name = target_role;

    IF target_role_level IS NULL THEN
        RAISE EXCEPTION 'Role not found: %', target_role;
    END IF;

    -- Proteger roles vitales del sistema
    IF target_role IN ('super_admin', 'admin', 'viewer', 'guest') THEN
        RAISE EXCEPTION 'Cannot modify permissions of system role: %', target_role;
    END IF;

    IF target_role_level >= caller_level THEN
        RAISE EXCEPTION 'Permission denied: cannot modify role with equal or higher level';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.permissions WHERE name = permission_name) THEN
        RAISE EXCEPTION 'Permission not found: %', permission_name;
    END IF;

    INSERT INTO public.role_permissions (role, permission)
    VALUES (target_role, permission_name)
    ON CONFLICT (role, permission) DO NOTHING;

    RETURN json_build_object('success', true, 'role', target_role, 'permission', permission_name);
END;
$$;

DROP FUNCTION IF EXISTS public.remove_role_permission(TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.remove_role_permission(
    target_role TEXT,
    permission_name TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_level int;
    target_role_level int;
BEGIN
    caller_level := COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level'))::int, 0);

    IF caller_level < 100 THEN
        RAISE EXCEPTION 'Permission denied: requires super_admin privileges';
    END IF;

    SELECT hierarchy_level INTO target_role_level
    FROM public.roles WHERE name = target_role;

    IF target_role_level IS NULL THEN
        RAISE EXCEPTION 'Role not found: %', target_role;
    END IF;

    -- Proteger roles vitales del sistema
    IF target_role IN ('super_admin', 'admin', 'viewer', 'guest') THEN
        RAISE EXCEPTION 'Cannot modify permissions of system role: %', target_role;
    END IF;

    IF target_role_level >= caller_level THEN
        RAISE EXCEPTION 'Permission denied: cannot modify role with equal or higher level';
    END IF;

    DELETE FROM public.role_permissions
    WHERE role = target_role AND permission = permission_name;

    RETURN json_build_object('success', true, 'role', target_role, 'permission_removed', permission_name);
END;
$$;

-- RESTAURAR GRANTS
REVOKE ALL ON FUNCTION public.delete_role(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assign_role_permission(TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_role_permission(TEXT, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.delete_role(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_role_permission(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_role_permission(TEXT, TEXT) TO authenticated;
