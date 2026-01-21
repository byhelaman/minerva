-- ============================================
-- Minerva v2 - 016: Update Logic to Granular Permissions
-- ============================================
-- Consolidates changes to Functions (from 007) and RLS Policies (from 011)
-- to ensure they use the new granular permissions (users.view, meetings.search, etc.)

-- 1. Update User Management Functions (originally in 007)

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
    
    -- Eliminar de auth.users (cascadea a profiles)
    DELETE FROM auth.users WHERE id = target_user_id;
    
    RETURN json_build_object(
        'success', true,
        'deleted_user_id', target_user_id
    );
END;
$$;

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


-- 2. Update RLS Policies for Zoom Tables (originally in 011)

-- zoom_users
DROP POLICY IF EXISTS "Allow read for valid roles" ON public.zoom_users;

CREATE POLICY "Allow read for valid roles" ON public.zoom_users
    FOR SELECT TO authenticated
    USING (
        -- Granular Permission: meetings.search
        ((auth.jwt() -> 'permissions')::jsonb ? 'meetings.search')
    );

-- zoom_meetings
DROP POLICY IF EXISTS "Allow read for valid roles" ON public.zoom_meetings;

CREATE POLICY "Allow read for valid roles" ON public.zoom_meetings
    FOR SELECT TO authenticated
    USING (
        -- Granular Permission: meetings.search
        ((auth.jwt() -> 'permissions')::jsonb ? 'meetings.search')
    );
