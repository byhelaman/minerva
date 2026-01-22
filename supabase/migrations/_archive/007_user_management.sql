-- ============================================
-- Minerva v2 - 007: User Management Functions
-- ============================================
-- Run AFTER 006_security_triggers.sql
-- Funciones RPC para gestión de usuarios desde el frontend

-- =============================================
-- API: Get all users with their roles (admin only)
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
DECLARE
    caller_level int;
BEGIN
    caller_level := COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level'))::int, 0);
    
    -- 1. Verificar permiso de ver usuarios (users.view)
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
        p.created_at
    FROM public.profiles p
    JOIN public.roles r ON p.role = r.name
    ORDER BY r.hierarchy_level DESC, p.created_at;
END;
$$;

-- =============================================
-- API: Get all roles (authenticated)
-- =============================================
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

-- =============================================
-- API: Update user role (admin only)
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
    caller_level int;
    caller_id uuid;
    target_current_level int;
    new_role_level int;
BEGIN
    caller_id := auth.uid();
    caller_level := COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level'))::int, 0);
    
    -- 1. Verificar si tiene permiso de gestionar usuarios (users.manage)
    IF NOT public.has_permission('users.manage') THEN
        RAISE EXCEPTION 'Permission denied: requires users.manage permission';
    END IF;
    
    -- Prevenir auto-modificación
    IF target_user_id = caller_id THEN
        RAISE EXCEPTION 'Permission denied: cannot modify your own role';
    END IF;
    
    -- Obtener nivel del rol target actual
    SELECT r.hierarchy_level INTO target_current_level
    FROM public.profiles p
    JOIN public.roles r ON p.role = r.name
    WHERE p.id = target_user_id;
    
    IF target_current_level IS NULL THEN
        RAISE EXCEPTION 'User not found';
    END IF;
    
    -- Verificar que el caller tiene mayor nivel que el target
    IF target_current_level >= caller_level THEN
        RAISE EXCEPTION 'Permission denied: cannot modify user with equal or higher privileges';
    END IF;
    
    -- Obtener nivel del nuevo rol
    SELECT r.hierarchy_level INTO new_role_level
    FROM public.roles r
    WHERE r.name = new_role;
    
    IF new_role_level IS NULL THEN
        RAISE EXCEPTION 'Invalid role: %', new_role;
    END IF;
    
    -- Verificar que el nuevo rol es menor al nivel del caller
    IF new_role_level >= caller_level THEN
        RAISE EXCEPTION 'Permission denied: cannot assign role with equal or higher privileges than yours';
    END IF;
    
    -- Ejecutar el update
    UPDATE public.profiles
    SET role = new_role
    WHERE id = target_user_id;
    
    RETURN json_build_object(
        'success', true,
        'user_id', target_user_id,
        'new_role', new_role
    );
END;
$$;

-- =============================================
-- API: Delete user (super_admin only)
-- =============================================
CREATE OR REPLACE FUNCTION public.delete_user(target_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_level int;
    caller_id uuid;
    target_level int;
BEGIN
    caller_id := auth.uid();
    caller_level := COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level'))::int, 0);
    
    -- Verificar que el caller es super_admin
    -- 1. Verificar permiso de gestionar usuarios (users.manage)
    IF NOT public.has_permission('users.manage') THEN
        RAISE EXCEPTION 'Permission denied: requires users.manage permission';
    END IF;
    
    -- Prevenir auto-eliminación
    IF target_user_id = caller_id THEN
        RAISE EXCEPTION 'Permission denied: cannot delete your own account';
    END IF;
    
    -- Obtener nivel del target
    SELECT r.hierarchy_level INTO target_level
    FROM public.profiles p
    JOIN public.roles r ON p.role = r.name
    WHERE p.id = target_user_id;
    
    IF target_level IS NULL THEN
        RAISE EXCEPTION 'User not found';
    END IF;
    
    -- No se puede eliminar a otro super_admin
    IF target_level >= 100 THEN
        RAISE EXCEPTION 'Permission denied: cannot delete another super_admin';
    END IF;

    -- SEGURIDAD: No se puede eliminar usuarios con nivel >= al tuyo
    IF target_level >= caller_level THEN
        RAISE EXCEPTION 'Permission denied: cannot delete user with equal or higher privileges';
    END IF;
    
    -- Eliminar de auth.users (cascadea a profiles)
    DELETE FROM auth.users WHERE id = target_user_id;
    
    RETURN json_build_object(
        'success', true,
        'deleted_user_id', target_user_id
    );
END;
$$;

-- =============================================
-- API: Get user count (admin only)
-- =============================================
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
-- Permisos
-- =============================================
GRANT EXECUTE ON FUNCTION public.get_all_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_all_roles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_user_role(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_count() TO authenticated;

-- =============================================
-- API: Get all permissions (authenticated)
-- =============================================
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

-- =============================================
-- API: Create a new role (super_admin only)
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
    
    -- Solo super_admin puede crear roles
    IF caller_level < 100 THEN
        RAISE EXCEPTION 'Permission denied: requires super_admin privileges';
    END IF;
    
    -- Validar que el nivel del nuevo rol sea menor al del caller
    IF role_level >= caller_level THEN
        RAISE EXCEPTION 'Permission denied: cannot create role with equal or higher level than yours';
    END IF;
    
    -- Validar nombre único
    IF EXISTS (SELECT 1 FROM public.roles WHERE name = role_name) THEN
        RAISE EXCEPTION 'Role already exists: %', role_name;
    END IF;
    
    -- Insertar el rol
    INSERT INTO public.roles (name, description, hierarchy_level)
    VALUES (role_name, role_description, role_level);
    
    RETURN json_build_object(
        'success', true,
        'role_name', role_name
    );
END;
$$;

-- =============================================
-- API: Update role description (super_admin only)
-- =============================================
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
    
    -- Solo super_admin puede editar roles
    IF caller_level < 100 THEN
        RAISE EXCEPTION 'Permission denied: requires super_admin privileges';
    END IF;
    
    -- Obtener nivel del rol a editar
    SELECT hierarchy_level INTO target_role_level
    FROM public.roles WHERE name = role_name;
    
    IF target_role_level IS NULL THEN
        RAISE EXCEPTION 'Role not found: %', role_name;
    END IF;
    
    -- No se puede editar roles con nivel >= al tuyo
    IF target_role_level >= caller_level THEN
        RAISE EXCEPTION 'Permission denied: cannot edit role with equal or higher level';
    END IF;
    
    -- Actualizar descripción
    UPDATE public.roles
    SET description = new_description
    WHERE name = role_name;
    
    RETURN json_build_object(
        'success', true,
        'role_name', role_name
    );
END;
$$;

-- =============================================
-- API: Delete a role (super_admin only)
-- =============================================
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
    
    -- Solo super_admin puede eliminar roles
    IF caller_level < 100 THEN
        RAISE EXCEPTION 'Permission denied: requires super_admin privileges';
    END IF;
    
    -- Proteger roles del sistema
    IF role_name IN ('super_admin', 'admin', 'operator', 'viewer') THEN
        RAISE EXCEPTION 'Cannot delete system role: %', role_name;
    END IF;
    
    -- Obtener nivel del rol a eliminar
    SELECT hierarchy_level INTO target_role_level
    FROM public.roles WHERE name = role_name;
    
    IF target_role_level IS NULL THEN
        RAISE EXCEPTION 'Role not found: %', role_name;
    END IF;
    
    -- No se puede eliminar roles con nivel >= al tuyo
    IF target_role_level >= caller_level THEN
        RAISE EXCEPTION 'Permission denied: cannot delete role with equal or higher level';
    END IF;
    
    -- Verificar que no hay usuarios con este rol
    SELECT COUNT(*) INTO users_with_role
    FROM public.profiles WHERE role = role_name;
    
    IF users_with_role > 0 THEN
        RAISE EXCEPTION 'Cannot delete role: % users are assigned to this role', users_with_role;
    END IF;
    
    -- Eliminar el rol
    DELETE FROM public.roles WHERE name = role_name;
    
    RETURN json_build_object(
        'success', true,
        'deleted_role', role_name
    );
END;
$$;

-- =============================================
-- Permisos adicionales
-- =============================================
GRANT EXECUTE ON FUNCTION public.get_all_permissions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_role(TEXT, TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_role(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_role(TEXT) TO authenticated;

-- =============================================
-- API: Get permissions for a role (authenticated)
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

-- =============================================
-- API: Assign permission to role (super_admin only)
-- =============================================
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
    
    -- Solo super_admin puede asignar permisos
    IF caller_level < 100 THEN
        RAISE EXCEPTION 'Permission denied: requires super_admin privileges';
    END IF;
    
    -- Verificar que el rol existe y obtener su nivel
    SELECT hierarchy_level INTO target_role_level
    FROM public.roles WHERE name = target_role;
    
    IF target_role_level IS NULL THEN
        RAISE EXCEPTION 'Role not found: %', target_role;
    END IF;
    
    -- Proteger roles del sistema
    IF target_role IN ('super_admin', 'admin', 'operator', 'viewer') THEN
        RAISE EXCEPTION 'Cannot modify permissions of system role: %', target_role;
    END IF;
    
    -- No se pueden editar permisos de roles con nivel >= al tuyo
    IF target_role_level >= caller_level THEN
        RAISE EXCEPTION 'Permission denied: cannot modify role with equal or higher level';
    END IF;
    
    -- Verificar que el permiso existe
    IF NOT EXISTS (SELECT 1 FROM public.permissions WHERE name = permission_name) THEN
        RAISE EXCEPTION 'Permission not found: %', permission_name;
    END IF;
    
    -- Insertar (ignorar si ya existe)
    INSERT INTO public.role_permissions (role, permission)
    VALUES (target_role, permission_name)
    ON CONFLICT (role, permission) DO NOTHING;
    
    RETURN json_build_object(
        'success', true,
        'role', target_role,
        'permission', permission_name
    );
END;
$$;

-- =============================================
-- API: Remove permission from role (super_admin only)
-- =============================================
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
    
    -- Solo super_admin puede quitar permisos
    IF caller_level < 100 THEN
        RAISE EXCEPTION 'Permission denied: requires super_admin privileges';
    END IF;
    
    -- Verificar que el rol existe y obtener su nivel
    SELECT hierarchy_level INTO target_role_level
    FROM public.roles WHERE name = target_role;
    
    IF target_role_level IS NULL THEN
        RAISE EXCEPTION 'Role not found: %', target_role;
    END IF;
    
    -- Proteger roles del sistema
    IF target_role IN ('super_admin', 'admin', 'operator', 'viewer') THEN
        RAISE EXCEPTION 'Cannot modify permissions of system role: %', target_role;
    END IF;
    
    -- No se pueden editar permisos de roles con nivel >= al tuyo
    IF target_role_level >= caller_level THEN
        RAISE EXCEPTION 'Permission denied: cannot modify role with equal or higher level';
    END IF;
    
    -- Eliminar el permiso
    DELETE FROM public.role_permissions
    WHERE role = target_role AND permission = permission_name;
    
    RETURN json_build_object(
        'success', true,
        'role', target_role,
        'permission_removed', permission_name
    );
END;
$$;

-- =============================================
-- Permisos para role_permissions management
-- =============================================
GRANT EXECUTE ON FUNCTION public.get_role_permissions(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_role_permission(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_role_permission(TEXT, TEXT) TO authenticated;

-- =============================================
-- API: Set user role after creation (admin only)
-- Usado después de crear un usuario via signUp
-- =============================================
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
    -- Verificar que el usuario tiene permiso admin
    caller_level := COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level'))::int, 0);
    
    -- 1. Verificar permiso de gestionar usuarios (users.manage)
    IF NOT public.has_permission('users.manage') THEN
        RAISE EXCEPTION 'Permission denied: requires users.manage permission';
    END IF;
    
    -- Obtener nivel del rol objetivo
    SELECT hierarchy_level INTO target_role_level
    FROM public.roles WHERE name = target_role;
    
    IF target_role_level IS NULL THEN
        RAISE EXCEPTION 'Role not found: %', target_role;
    END IF;
    
    -- No se puede asignar un rol con nivel >= al tuyo
    IF target_role_level >= caller_level THEN
        RAISE EXCEPTION 'Permission denied: cannot assign role with equal or higher level';
    END IF;
    
    -- Actualizar el rol del nuevo usuario
    UPDATE public.profiles
    SET role = target_role
    WHERE id = target_user_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'User not found: %', target_user_id;
    END IF;
    
    RETURN json_build_object(
        'success', true,
        'user_id', target_user_id,
        'role', target_role
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_new_user_role(UUID, TEXT) TO authenticated;
