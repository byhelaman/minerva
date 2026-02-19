-- ============================================
-- Minerva v2 — 012: Reports Optimization
-- ============================================
-- 1. Batch delete RPC for schedule entries (eliminates N+1 requests)
-- 2. Optimized get_schedules_report (select only frontend-needed columns)

-- =============================================
-- BATCH DELETE SCHEDULE ENTRIES
-- =============================================
-- Accepts a JSONB array of composite keys and deletes all matching rows
-- in a single query. Replaces N sequential DELETE requests.
--
-- Usage: SELECT batch_delete_schedule_entries('[
--   {"date":"2026-01-15","program":"Math","start_time":"08:00","instructor":"John"},
--   {"date":"2026-01-15","program":"Science","start_time":"09:00","instructor":"Jane"}
-- ]'::jsonb);

CREATE OR REPLACE FUNCTION public.batch_delete_schedule_entries(p_keys jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    deleted_count integer;
BEGIN
    -- Permission check
    IF NOT public.has_permission('reports.manage') THEN
        RAISE EXCEPTION 'Permission denied: requires reports.manage';
    END IF;

    -- Validate input
    IF p_keys IS NULL OR jsonb_array_length(p_keys) = 0 THEN
        RETURN 0;
    END IF;

    -- Delete all matching rows in a single query
    DELETE FROM public.schedule_entries
    WHERE (date, program, start_time, instructor) IN (
        SELECT
            j->>'date',
            j->>'program',
            j->>'start_time',
            j->>'instructor'
        FROM jsonb_array_elements(p_keys) AS j
    );

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;

-- Grants
GRANT EXECUTE ON FUNCTION public.batch_delete_schedule_entries(jsonb) TO authenticated;

-- =============================================
-- OPTIMIZED REPORTS RPC
-- =============================================
-- Replace SELECT * with explicit columns to reduce payload size.
-- Drops: id, published_by, created_at, updated_at, synced_at, logged_at

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
        RAISE EXCEPTION 'Permission denied';
    END IF;

    SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO result
    FROM (
        SELECT
            date, program, start_time, instructor,
            shift, branch, end_time, code, minutes, units,
            status, substitute, type, subtype, description, department, feedback
        FROM public.schedule_entries
        WHERE date >= p_start_date
          AND date <= p_end_date
        ORDER BY date, start_time
    ) t;

    RETURN result;
END;
$$;
