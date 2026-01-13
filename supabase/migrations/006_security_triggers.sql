-- ============================================
-- Minerva v2 - 006: Security Triggers
-- ============================================
-- Run AFTER 005_policies.sql
-- Triggers de seguridad para prevenir escalación de privilegios

-- =============================================
-- Trigger: Prevenir cambio de rol por no-admins
-- =============================================
-- Este trigger bloquea intentos de usuarios de cambiar su propio rol
-- Solo admins (hierarchy_level >= 80) pueden cambiar roles

CREATE OR REPLACE FUNCTION public.prevent_role_self_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_hierarchy_level int;
    caller_id uuid;
    target_current_level int;
    new_role_level int;
BEGIN
    -- Obtener info del usuario que hace la operación
    caller_id := auth.uid();
    caller_hierarchy_level := COALESCE(
        (SELECT (auth.jwt() ->> 'hierarchy_level'))::int,
        0
    );

    -- Si el rol está cambiando
    IF OLD.role IS DISTINCT FROM NEW.role THEN
        
        -- REGLA 1: Nadie puede modificar su propio rol (auto-downgrade prevention)
        IF OLD.id = caller_id THEN
            RAISE EXCEPTION 'Permission denied: cannot modify your own role';
        END IF;
        
        -- REGLA 2: Solo admins pueden cambiar roles
        IF caller_hierarchy_level < 80 THEN
            RAISE EXCEPTION 'Permission denied: cannot change role without admin privileges';
        END IF;
        
        -- Obtener nivel del usuario target actual
        SELECT r.hierarchy_level INTO target_current_level
        FROM public.roles r
        WHERE r.name = OLD.role;
        
        -- REGLA 3: No se puede modificar usuarios con nivel >= al tuyo
        IF target_current_level >= caller_hierarchy_level THEN
            RAISE EXCEPTION 'Permission denied: cannot modify user with equal or higher privileges';
        END IF;
        
        -- Obtener nivel del nuevo rol
        SELECT r.hierarchy_level INTO new_role_level
        FROM public.roles r
        WHERE r.name = NEW.role;
        
        -- REGLA 4: No se puede asignar un rol >= al tuyo
        IF new_role_level >= caller_hierarchy_level THEN
            RAISE EXCEPTION 'Permission denied: cannot assign role with equal or higher privileges than yours';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- Crear el trigger
DROP TRIGGER IF EXISTS check_role_update ON public.profiles;
CREATE TRIGGER check_role_update
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_role_self_update();

-- =============================================
-- NOTAS:
-- =============================================
-- 1. Un usuario normal NO puede cambiar su rol (error)
-- 2. Un admin (level 80) puede cambiar roles de otros a nivel < 80
-- 3. Un super_admin (level 100) puede cambiar cualquier rol
-- 4. Nadie puede asignarse un rol igual o mayor al suyo
