-- ============================================
-- Minerva v2 - 018: Security Patch (Delete User)
-- ============================================
-- Fixes a privilege escalation vulnerability where a lower-level admin
-- could delete a higher-level admin.

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
