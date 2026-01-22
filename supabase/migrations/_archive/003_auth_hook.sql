-- ============================================
-- Minerva v2 - 003: Auth Hook (Custom Claims)
-- ============================================
-- Run AFTER 002_profiles.sql
-- REQUIRES: Habilitar hook en Dashboard → Authentication → Hooks

-- =============================================
-- Auth Hook para inyectar rol en JWT
-- =============================================
-- Esta función se ejecuta antes de emitir el JWT
-- Inyecta 'role' y 'hierarchy_level' en el token

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    claims jsonb;
    user_role text;
    user_hierarchy_level int;
    user_permissions text[];
BEGIN
    -- Obtener rol y nivel del usuario desde profiles + roles
    SELECT p.role, r.hierarchy_level
    INTO user_role, user_hierarchy_level
    FROM public.profiles p
    JOIN public.roles r ON p.role = r.name
    WHERE p.id = (event ->> 'user_id')::uuid;

    -- Obtener claims actuales
    claims := event -> 'claims';

    -- Añadir custom claims
    -- NOTA: Usamos 'user_role' en lugar de 'role' para evitar conflicto
    -- con el rol de PostgreSQL que Supabase usa internamente
    IF user_role IS NOT NULL THEN
        -- Obtener permisos del rol desde role_permissions
        SELECT array_agg(rp.permission)
        INTO user_permissions
        FROM public.role_permissions rp
        WHERE rp.role = user_role;

        claims := jsonb_set(claims, '{user_role}', to_jsonb(user_role));
        claims := jsonb_set(claims, '{hierarchy_level}', to_jsonb(user_hierarchy_level));
        claims := jsonb_set(claims, '{permissions}', to_jsonb(COALESCE(user_permissions, ARRAY[]::text[])));
    ELSE
        -- Usuario sin perfil (edge case: signup en progreso)
        claims := jsonb_set(claims, '{user_role}', '"viewer"');
        claims := jsonb_set(claims, '{hierarchy_level}', '10');
        claims := jsonb_set(claims, '{permissions}', '["schedules.read"]');
    END IF;

    -- Actualizar event con los nuevos claims
    event := jsonb_set(event, '{claims}', claims);

    RETURN event;
END;
$$;

-- Permisos para que supabase_auth_admin pueda ejecutar el hook
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;

-- Revocar acceso público (seguridad)
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;

-- El hook necesita leer profiles, roles y role_permissions
GRANT SELECT ON TABLE public.profiles TO supabase_auth_admin;
GRANT SELECT ON TABLE public.roles TO supabase_auth_admin;
GRANT SELECT ON TABLE public.role_permissions TO supabase_auth_admin;

-- =============================================
-- PASO MANUAL REQUERIDO:
-- =============================================
-- 1. Ve a: https://supabase.com/dashboard/project/_/auth/hooks
-- 2. Busca "Customize Access Token (JWT) Claims"
-- 3. Selecciona schema "public", function "custom_access_token_hook"
-- 4. Guarda
