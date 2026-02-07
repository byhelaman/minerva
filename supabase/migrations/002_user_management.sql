-- ============================================
-- Minerva v2 — 002: User Management & Permissions API
-- ============================================
-- Funciones RPC para gestión de usuarios, roles y permisos.
-- Depende de 001_core_access.sql.

-- =============================================
-- CONSULTAS DE USUARIOS
-- =============================================

CREATE OR REPLACE FUNCTION public.get_all_users()
RETURNS TABLE (
    id UUID,
    email TEXT,
    display_name TEXT,
    role TEXT,
    hierarchy_level INT,
    created_at TIMESTAMPTZ
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
    SELECT p.id, p.email, p.display_name, p.role, r.hierarchy_level, p.created_at
    FROM public.profiles p
    JOIN public.roles r ON p.role = r.name
    ORDER BY r.hierarchy_level DESC, p.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_all_roles()
RETURNS TABLE (
    name TEXT,
    description TEXT,
    hierarchy_level INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT r.name, r.description, r.hierarchy_level
    FROM public.roles r
    ORDER BY r.hierarchy_level DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_all_permissions()
RETURNS TABLE (
    name TEXT,
    description TEXT,
    min_role_level INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT p.name, p.description, p.min_role_level
    FROM public.permissions p
    ORDER BY p.min_role_level ASC;
$$;

CREATE OR REPLACE FUNCTION public.get_user_count()
RETURNS INT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_level int;
    user_count int;
BEGIN
    caller_level := COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level'))::int, 0);

    IF caller_level < 80 THEN
        RAISE EXCEPTION 'Permission denied: requires admin privileges';
    END IF;

    SELECT COUNT(*) INTO user_count FROM public.profiles;
    RETURN user_count;
END;
$$;

-- =============================================
-- GESTIÓN DE USUARIOS
-- =============================================

CREATE OR REPLACE FUNCTION public.update_user_role(
    target_user_id UUID,
    new_role TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_id uuid;
    caller_level int;
    target_current_level int;
    new_role_level int;
BEGIN
    caller_id := auth.uid();
    caller_level := COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level'))::int, 0);

    IF NOT public.has_permission('users.manage') THEN
        RAISE EXCEPTION 'Permission denied: requires users.manage permission';
    END IF;

    IF target_user_id = caller_id THEN
        RAISE EXCEPTION 'Permission denied: cannot modify your own role';
    END IF;

    SELECT r.hierarchy_level INTO target_current_level
    FROM public.profiles p
    JOIN public.roles r ON p.role = r.name
    WHERE p.id = target_user_id;

    IF target_current_level IS NULL THEN
        RAISE EXCEPTION 'User not found';
    END IF;

    IF target_current_level >= caller_level THEN
        RAISE EXCEPTION 'Permission denied: cannot modify user with equal or higher privileges';
    END IF;

    SELECT r.hierarchy_level INTO new_role_level
    FROM public.roles r WHERE r.name = new_role;

    IF new_role_level IS NULL THEN
        RAISE EXCEPTION 'Invalid role: %', new_role;
    END IF;

    IF new_role_level >= caller_level THEN
        RAISE EXCEPTION 'Permission denied: cannot assign role with equal or higher privileges than yours';
    END IF;

    UPDATE public.profiles SET role = new_role WHERE id = target_user_id;

    RETURN json_build_object('success', true, 'user_id', target_user_id, 'new_role', new_role);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_user(target_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_id uuid;
    caller_level int;
    target_level int;
BEGIN
    caller_id := auth.uid();
    caller_level := COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level'))::int, 0);

    IF NOT public.has_permission('users.manage') THEN
        RAISE EXCEPTION 'Permission denied: requires users.manage permission';
    END IF;

    IF target_user_id = caller_id THEN
        RAISE EXCEPTION 'Permission denied: cannot delete your own account';
    END IF;

    SELECT r.hierarchy_level INTO target_level
    FROM public.profiles p
    JOIN public.roles r ON p.role = r.name
    WHERE p.id = target_user_id;

    IF target_level IS NULL THEN
        RAISE EXCEPTION 'User not found';
    END IF;

    IF target_level >= 100 THEN
        RAISE EXCEPTION 'Permission denied: cannot delete another super_admin';
    END IF;

    IF target_level >= caller_level THEN
        RAISE EXCEPTION 'Permission denied: cannot delete user with equal or higher privileges';
    END IF;

    DELETE FROM auth.users WHERE id = target_user_id;

    RETURN json_build_object('success', true, 'deleted_user_id', target_user_id);
END;
$$;

-- Actualizar display name de otro usuario (solo admins)
CREATE OR REPLACE FUNCTION public.update_user_display_name(
    target_user_id UUID,
    new_display_name TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_id uuid;
    caller_level int;
    target_current_level int;
BEGIN
    caller_id := auth.uid();
    caller_level := COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level'))::int, 0);

    IF NOT public.has_permission('users.manage') THEN
        RAISE EXCEPTION 'Permission denied: requires users.manage permission';
    END IF;

    IF target_user_id = caller_id THEN
        RAISE EXCEPTION 'Permission denied: use update_my_display_name for your own account';
    END IF;

    SELECT r.hierarchy_level INTO target_current_level
    FROM public.profiles p
    JOIN public.roles r ON p.role = r.name
    WHERE p.id = target_user_id;

    IF target_current_level IS NULL THEN
        RAISE EXCEPTION 'User not found';
    END IF;

    IF target_current_level >= caller_level THEN
        RAISE EXCEPTION 'Permission denied: cannot modify user with equal or higher privileges';
    END IF;

    UPDATE public.profiles SET display_name = new_display_name WHERE id = target_user_id;
    UPDATE auth.users
    SET raw_user_meta_data = raw_user_meta_data || jsonb_build_object('display_name', new_display_name)
    WHERE id = target_user_id;

    RETURN json_build_object('success', true, 'user_id', target_user_id, 'new_display_name', new_display_name);
END;
$$;

-- Asignar rol a nuevo usuario
CREATE OR REPLACE FUNCTION public.set_new_user_role(
    target_user_id UUID,
    target_role TEXT
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

    IF NOT public.has_permission('users.manage') THEN
        RAISE EXCEPTION 'Permission denied: requires users.manage permission';
    END IF;

    SELECT hierarchy_level INTO target_role_level
    FROM public.roles WHERE name = target_role;

    IF target_role_level IS NULL THEN
        RAISE EXCEPTION 'Role not found: %', target_role;
    END IF;

    IF target_role_level >= caller_level THEN
        RAISE EXCEPTION 'Permission denied: cannot assign role with equal or higher level';
    END IF;

    UPDATE public.profiles SET role = target_role WHERE id = target_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'User not found: %', target_user_id;
    END IF;

    RETURN json_build_object('success', true, 'user_id', target_user_id, 'role', target_role);
END;
$$;

-- =============================================
-- GESTIÓN DE ROLES
-- =============================================

CREATE OR REPLACE FUNCTION public.create_role(
    role_name TEXT,
    role_description TEXT,
    role_level INT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_level int;
BEGIN
    caller_level := COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level'))::int, 0);

    IF caller_level < 100 THEN
        RAISE EXCEPTION 'Permission denied: requires super_admin privileges';
    END IF;

    IF role_level >= caller_level THEN
        RAISE EXCEPTION 'Permission denied: cannot create role with equal or higher level than yours';
    END IF;

    IF EXISTS (SELECT 1 FROM public.roles WHERE name = role_name) THEN
        RAISE EXCEPTION 'Role already exists: %', role_name;
    END IF;

    INSERT INTO public.roles (name, description, hierarchy_level)
    VALUES (role_name, role_description, role_level);

    RETURN json_build_object('success', true, 'role_name', role_name);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_role(
    role_name TEXT,
    new_description TEXT
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
    FROM public.roles WHERE name = role_name;

    IF target_role_level IS NULL THEN
        RAISE EXCEPTION 'Role not found: %', role_name;
    END IF;

    IF target_role_level >= caller_level THEN
        RAISE EXCEPTION 'Permission denied: cannot edit role with equal or higher level';
    END IF;

    UPDATE public.roles SET description = new_description WHERE name = role_name;

    RETURN json_build_object('success', true, 'role_name', role_name);
END;
$$;

-- FIX: Proteger TODOS los roles del sistema (incluye moderator y guest)
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

    -- Proteger todos los roles del sistema
    IF role_name IN ('super_admin', 'admin', 'moderator', 'operator', 'viewer', 'guest') THEN
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

CREATE OR REPLACE FUNCTION public.get_role_permissions(target_role TEXT)
RETURNS TABLE (permission TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT rp.permission
    FROM public.role_permissions rp
    WHERE rp.role = target_role
    ORDER BY rp.permission;
$$;

-- FIX: Proteger moderator y guest de modificación de permisos
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

    -- Proteger todos los roles del sistema
    IF target_role IN ('super_admin', 'admin', 'moderator', 'operator', 'viewer', 'guest') THEN
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

-- FIX: Proteger moderator y guest de modificación de permisos
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

    -- Proteger todos los roles del sistema
    IF target_role IN ('super_admin', 'admin', 'moderator', 'operator', 'viewer', 'guest') THEN
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

-- =============================================
-- GRANTS
-- =============================================
GRANT EXECUTE ON FUNCTION public.get_all_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_all_roles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_all_permissions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_user_role(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_user_display_name(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_new_user_role(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_role(TEXT, TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_role(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_role(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_role_permissions(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_role_permission(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_role_permission(TEXT, TEXT) TO authenticated;
