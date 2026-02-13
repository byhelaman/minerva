-- ============================================
-- Minerva v2 — 009: Reports RPC
-- ============================================
-- Function to fetch raw schedule rows for the Reports page.
-- Bypasses the default PostgREST row limit (usually 1000).
-- ACCESO: Requiere permiso 'reports.view'.

CREATE OR REPLACE FUNCTION public.get_schedules_report(
    p_start_date TEXT,
    p_end_date TEXT
)
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    result json;
BEGIN
    IF NOT public.has_permission('reports.view') THEN
        RAISE EXCEPTION 'Permission denied: requires reports.view permission';
    END IF;

    SELECT COALESCE(json_agg(t), '[]'::json) INTO result
    FROM (
        SELECT *
        FROM public.schedule_entries
        WHERE date >= p_start_date
          AND date <= p_end_date
        ORDER BY date, start_time
    ) t;

    RETURN result;
END;
$$;

COMMENT ON FUNCTION public.get_schedules_report IS 'Fetches raw schedule entries for reports, bypassing pagination limits.';

GRANT EXECUTE ON FUNCTION public.get_schedules_report TO authenticated;
