-- ============================================
-- Minerva v2 - 013: Webhook Events Cleanup
-- ============================================
-- Función para limpiar webhook_events procesados antiguos
-- Previene crecimiento indefinido de la tabla

-- Función de limpieza: elimina eventos procesados más antiguos que N días
CREATE OR REPLACE FUNCTION public.cleanup_old_webhook_events(days_to_keep int DEFAULT 30)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    deleted_count int;
BEGIN
    -- Eliminar eventos procesados más antiguos que el número de días especificado
    WITH deleted AS (
        DELETE FROM public.webhook_events
        WHERE processed = true
          AND created_at < now() - (days_to_keep || ' days')::interval
        RETURNING *
    )
    SELECT count(*) INTO deleted_count FROM deleted;
    
    -- Log para monitoring
    RAISE NOTICE 'Deleted % old webhook events (older than % days)', deleted_count, days_to_keep;
    
    RETURN deleted_count;
END;
$$;

-- Revocar acceso público por seguridad
REVOKE EXECUTE ON FUNCTION public.cleanup_old_webhook_events(int) FROM PUBLIC, anon, authenticated;

-- Dar acceso solo a service_role (para cronjobs)
GRANT EXECUTE ON FUNCTION public.cleanup_old_webhook_events(int) TO service_role;

-- =============================================
-- CONFIGURACIÓN DEL CRONJOB
-- =============================================
-- Para habilitar la limpieza automática, configurar un cronjob en Supabase:
--
-- 1. Ve a: https://supabase.com/dashboard/project/_/database/extensions
-- 2. Habilita la extensión pg_cron
--
-- 3. Ejecuta en SQL Editor:
--    SELECT cron.schedule(
--        'cleanup-webhook-events',     -- nombre del job
--        '0 3 * * *',                  -- cada día a las 3:00 AM
--        $$SELECT public.cleanup_old_webhook_events(30)$$
--    );
--
-- 4. Para verificar jobs programados:
--    SELECT * FROM cron.job;
--
-- 5. Para ver historial de ejecuciones:
--    SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
