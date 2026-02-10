-- ============================================================================
-- 007: Delete Own Account
-- Permite a los usuarios eliminar su propia cuenta de forma segura.
-- La función elimina el registro de auth.users, lo cual dispara CASCADE
-- en profiles y zoom_users, y SET NULL en bug_reports y published_schedules.
-- ============================================================================

-- Función RPC: delete_own_account
-- Se ejecuta como SECURITY DEFINER para tener acceso a auth.users.
-- Solo permite que un usuario se elimine a sí mismo (auth.uid()).
CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    _uid UUID := auth.uid();
BEGIN
    IF _uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Limpiar schedule_entries.published_by (no tiene ON DELETE CASCADE/SET NULL)
    UPDATE public.schedule_entries
    SET published_by = NULL
    WHERE published_by = _uid;

    -- Eliminar de auth.users — cascadea a profiles, zoom_users
    -- y hace SET NULL en bug_reports.user_id, published_schedules.published_by
    DELETE FROM auth.users WHERE id = _uid;
END;
$$;

-- Permisos: solo usuarios autenticados pueden invocar esta función
REVOKE ALL ON FUNCTION public.delete_own_account() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;
