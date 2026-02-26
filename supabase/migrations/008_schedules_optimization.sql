-- ============================================
-- Minerva v2 — 008: Schedule Optimization
-- ============================================
-- Consolidates all schedule-related optimizations into a single file:
-- - Expression indexes for fast monthly queries
-- - Data sanitization trigger (TRIM, REGEXP_REPLACE, NULLIF, HH:MM time normalization)
-- - Structural constraints (instructor/program not empty)
-- - Statistics RPCs (5 functions)
-- - Reporting RPCs (reports + batch delete)
-- - Date-based RPCs (bulk fetch + key fetch)
-- All RPCs include input validation and consumption limits.
--
-- Supersedes: 008, 009, 010, 015, 016, 017
-- Depends on: 006_schedules_realtime.sql

-- =============================================
-- 1. EXPRESSION INDEX
-- =============================================

-- Pre-computed index for fast monthly isolation using SUBSTRING(date, 1, 7)
-- IMMUTABLE-safe: avoids TO_CHAR dependency
DROP INDEX IF EXISTS idx_schedule_entries_month;
CREATE INDEX IF NOT EXISTS idx_schedule_entries_month
ON public.schedule_entries(SUBSTRING(date, 1, 7));

-- =============================================
-- 2. DATA SANITIZATION TRIGGER
-- =============================================

CREATE OR REPLACE FUNCTION public.sanitize_schedule_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- ===== TIME NORMALIZATION (HH:MM) =====
    -- Pad single-digit hours: "8:00" → "08:00", strip seconds: "08:00:00" → "08:00"
    IF NEW.start_time IS NOT NULL AND NEW.start_time ~ '^\d{1,2}:\d{2}' THEN
        NEW.start_time = LPAD(SPLIT_PART(NEW.start_time, ':', 1), 2, '0') || ':' || SUBSTRING(SPLIT_PART(NEW.start_time, ':', 2), 1, 2);
    END IF;

    IF NEW.end_time IS NOT NULL AND NEW.end_time <> '' AND NEW.end_time ~ '^\d{1,2}:\d{2}' THEN
        NEW.end_time = LPAD(SPLIT_PART(NEW.end_time, ':', 1), 2, '0') || ':' || SUBSTRING(SPLIT_PART(NEW.end_time, ':', 2), 1, 2);
    END IF;

    -- ===== KEY FIELDS: TRIM + collapse internal whitespace =====
    IF NEW.instructor IS NOT NULL THEN
        NEW.instructor = NULLIF(REGEXP_REPLACE(TRIM(NEW.instructor), '\s+', ' ', 'g'), '');
        IF NEW.instructor IS NULL THEN
            NEW.instructor = 'none';
        END IF;
    END IF;

    IF NEW.program IS NOT NULL THEN
        NEW.program = NULLIF(REGEXP_REPLACE(TRIM(NEW.program), '\s+', ' ', 'g'), '');
    END IF;

    -- ===== CLASSIFICATION FIELDS: TRIM + NULLIF =====
    IF NEW.type IS NOT NULL THEN
        NEW.type = NULLIF(TRIM(NEW.type), '');
    END IF;

    IF NEW.subtype IS NOT NULL THEN
        NEW.subtype = NULLIF(TRIM(NEW.subtype), '');
    END IF;

    IF NEW.department IS NOT NULL THEN
        NEW.department = NULLIF(TRIM(NEW.department), '');
    END IF;

    -- ===== INCIDENCE TEXT FIELDS: TRIM + NULLIF =====
    IF NEW.status IS NOT NULL THEN
        NEW.status = NULLIF(TRIM(NEW.status), '');
    END IF;

    IF NEW.substitute IS NOT NULL THEN
        NEW.substitute = NULLIF(TRIM(NEW.substitute), '');
    END IF;

    IF NEW.description IS NOT NULL THEN
        NEW.description = NULLIF(TRIM(NEW.description), '');
    END IF;

    IF NEW.feedback IS NOT NULL THEN
        NEW.feedback = NULLIF(TRIM(NEW.feedback), '');
    END IF;

    -- ===== BRANCH NORMALIZATION (UPPER + standardize) =====
    IF NEW.branch IS NOT NULL THEN
        NEW.branch = UPPER(TRIM(NEW.branch));
        IF NEW.branch LIKE 'HUB%' THEN
            NEW.branch = 'HUB';
        ELSIF NEW.branch LIKE 'MOLINA%' OR NEW.branch LIKE 'LA MOLINA%' THEN
            NEW.branch = 'LA MOLINA';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sanitize_schedule_entry ON public.schedule_entries;
CREATE TRIGGER trg_sanitize_schedule_entry
    BEFORE INSERT OR UPDATE ON public.schedule_entries
    FOR EACH ROW
    EXECUTE FUNCTION public.sanitize_schedule_entry();

-- =============================================
-- 3. RETROACTIVE DATA CLEANUP
-- =============================================

-- Fix empty instructors
UPDATE public.schedule_entries SET instructor = 'none' WHERE TRIM(instructor) = '';

-- Collapse internal whitespace in key fields
UPDATE public.schedule_entries
SET instructor = REGEXP_REPLACE(TRIM(instructor), '\s+', ' ', 'g'),
    program = REGEXP_REPLACE(TRIM(program), '\s+', ' ', 'g');

-- Re-run trigger on all rows (normalizes times, branches, NULLIF on all text fields)
UPDATE public.schedule_entries SET id = id;

-- =============================================
-- 4. STRUCTURAL CONSTRAINTS
-- =============================================

ALTER TABLE public.schedule_entries DROP CONSTRAINT IF EXISTS schedule_entries_instructor_not_empty;
ALTER TABLE public.schedule_entries ADD CONSTRAINT schedule_entries_instructor_not_empty CHECK (TRIM(instructor) <> '');

ALTER TABLE public.schedule_entries DROP CONSTRAINT IF EXISTS schedule_entries_program_not_empty;
ALTER TABLE public.schedule_entries ADD CONSTRAINT schedule_entries_program_not_empty CHECK (TRIM(program) <> '');

-- =============================================
-- 5. STATISTICS RPCs
-- =============================================
-- NOTA: Se usa COUNT(se.type) para incidencias porque el trigger garantiza
-- que type nunca será '' (siempre NULL o un valor real via NULLIF).

CREATE OR REPLACE FUNCTION public.get_daily_stats(
    p_start_date TEXT,
    p_end_date TEXT
)
RETURNS TABLE(date TEXT, total_classes BIGINT, incidences BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.has_permission('reports.view') THEN
        RAISE EXCEPTION 'Permission denied: requires reports.view permission';
    END IF;

    RETURN QUERY
    SELECT
        se.date,
        COUNT(*)::BIGINT AS total_classes,
        COUNT(se.type)::BIGINT AS incidences
    FROM public.schedule_entries se
    WHERE se.date >= p_start_date
      AND se.date <= p_end_date
    GROUP BY se.date
    ORDER BY se.date;
END;
$$;

COMMENT ON FUNCTION public.get_daily_stats IS 'Daily aggregation of total classes and incidences for the area chart';

CREATE OR REPLACE FUNCTION public.get_monthly_incidence_rate(
    p_start_date TEXT,
    p_end_date TEXT
)
RETURNS TABLE(month TEXT, total BIGINT, incidences BIGINT, rate NUMERIC)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.has_permission('reports.view') THEN
        RAISE EXCEPTION 'Permission denied: requires reports.view permission';
    END IF;

    RETURN QUERY
    SELECT
        SUBSTRING(se.date, 1, 7) AS month,
        COUNT(*)::BIGINT AS total,
        COUNT(se.type)::BIGINT AS incidences,
        ROUND(
            CASE WHEN COUNT(*) > 0
                THEN (COUNT(se.type)::NUMERIC / COUNT(*)::NUMERIC) * 100
                ELSE 0
            END, 1
        ) AS rate
    FROM public.schedule_entries se
    WHERE se.date >= p_start_date
      AND se.date <= p_end_date
    GROUP BY SUBSTRING(se.date, 1, 7)
    ORDER BY month;
END;
$$;

COMMENT ON FUNCTION public.get_monthly_incidence_rate IS 'Monthly incidence rate for the bar chart';

CREATE OR REPLACE FUNCTION public.get_incidence_types(
    p_start_date TEXT,
    p_end_date TEXT
)
RETURNS TABLE(type TEXT, count BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.has_permission('reports.view') THEN
        RAISE EXCEPTION 'Permission denied: requires reports.view permission';
    END IF;

    RETURN QUERY
    SELECT
        se.type,
        COUNT(*)::BIGINT AS count
    FROM public.schedule_entries se
    WHERE se.date >= p_start_date
      AND se.date <= p_end_date
      AND se.type IS NOT NULL
    GROUP BY se.type
    ORDER BY count DESC;
END;
$$;

COMMENT ON FUNCTION public.get_incidence_types IS 'Distribution of incidence types for the horizontal bar chart';

CREATE OR REPLACE FUNCTION public.get_period_comparison(
    p_cur_start TEXT,
    p_cur_end TEXT,
    p_prev_start TEXT,
    p_prev_end TEXT
)
RETURNS TABLE(period TEXT, total BIGINT, incidences BIGINT, rate NUMERIC)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.has_permission('reports.view') THEN
        RAISE EXCEPTION 'Permission denied: requires reports.view permission';
    END IF;

    RETURN QUERY
    SELECT 'current' AS period,
        COUNT(*)::BIGINT AS total,
        COUNT(se.type)::BIGINT AS incidences,
        ROUND(
            CASE WHEN COUNT(*) > 0
                THEN (COUNT(se.type)::NUMERIC / COUNT(*)::NUMERIC) * 100
                ELSE 0
            END, 1
        ) AS rate
    FROM public.schedule_entries se
    WHERE se.date >= p_cur_start AND se.date <= p_cur_end

    UNION ALL

    SELECT 'previous' AS period,
        COUNT(*)::BIGINT AS total,
        COUNT(se.type)::BIGINT AS incidences,
        ROUND(
            CASE WHEN COUNT(*) > 0
                THEN (COUNT(se.type)::NUMERIC / COUNT(*)::NUMERIC) * 100
                ELSE 0
            END, 1
        ) AS rate
    FROM public.schedule_entries se
    WHERE se.date >= p_prev_start AND se.date <= p_prev_end;
END;
$$;

COMMENT ON FUNCTION public.get_period_comparison IS 'Comparison of incidence rates between two periods for the donut chart';

CREATE OR REPLACE FUNCTION public.get_branch_stats(
    p_start_date TEXT,
    p_end_date TEXT
)
RETURNS TABLE(branch TEXT, total_classes BIGINT, incidences BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.has_permission('reports.view') THEN
        RAISE EXCEPTION 'Permission denied: requires reports.view permission';
    END IF;

    RETURN QUERY
    SELECT
        COALESCE(NULLIF(se.branch, ''), 'none') AS branch,
        COUNT(*)::BIGINT AS total_classes,
        COUNT(se.type)::BIGINT AS incidences
    FROM public.schedule_entries se
    WHERE se.date >= p_start_date
      AND se.date <= p_end_date
    GROUP BY COALESCE(NULLIF(se.branch, ''), 'none')
    ORDER BY total_classes DESC;
END;
$$;

COMMENT ON FUNCTION public.get_branch_stats IS 'Aggregation per branch for the stacked bar chart';

-- =============================================
-- 6. REPORTING RPCs (with limits)
-- =============================================

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

    -- Max 366 days range
    IF (p_end_date::date - p_start_date::date) > 366 THEN
        RAISE EXCEPTION 'Date range too large (max 366 days)';
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

CREATE OR REPLACE FUNCTION public.batch_delete_schedule_entries(p_keys jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    deleted_count integer;
BEGIN
    IF NOT public.has_permission('reports.manage') THEN
        RAISE EXCEPTION 'Permission denied: requires reports.manage';
    END IF;

    IF p_keys IS NULL OR jsonb_array_length(p_keys) = 0 THEN
        RETURN 0;
    END IF;

    -- Max 500 keys per batch
    IF jsonb_array_length(p_keys) > 500 THEN
        RAISE EXCEPTION 'Too many keys to delete (max 500)';
    END IF;

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

-- =============================================
-- 7. DATE-BASED RPCs (with limits)
-- =============================================

-- Full payload for schedule viewing
CREATE OR REPLACE FUNCTION public.get_schedules_by_dates(p_dates TEXT[])
RETURNS SETOF public.schedule_entries
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.has_permission('schedules.read') AND NOT public.has_permission('schedules.manage') THEN
        RAISE EXCEPTION 'Permiso denegado: requiere schedules.read o schedules.manage';
    END IF;

    IF array_length(p_dates, 1) > 90 THEN
        RAISE EXCEPTION 'Too many dates requested (max 90)';
    END IF;

    RETURN QUERY
        SELECT *
        FROM public.schedule_entries
        WHERE date = ANY(p_dates)
        ORDER BY date, start_time;
END;
$$;

-- Full payload as JSON (avoids PostgREST URL limits for large date arrays)
CREATE OR REPLACE FUNCTION public.get_schedules_by_dates_v2(p_dates TEXT[])
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    result json;
BEGIN
    IF NOT (public.has_permission('schedules.read') OR public.has_permission('schedules.manage')) THEN
        RAISE EXCEPTION 'Permission denied';
    END IF;

    IF array_length(p_dates, 1) > 90 THEN
        RAISE EXCEPTION 'Too many dates requested (max 90)';
    END IF;

    SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO result
    FROM (
        SELECT
            date, program, start_time, instructor,
            shift, branch, end_time, code, minutes, units,
            status, substitute, type, subtype, description, department, feedback
        FROM public.schedule_entries
        WHERE date = ANY(p_dates)
    ) t;

    RETURN result;
END;
$$;

-- Published schedules by dates
CREATE OR REPLACE FUNCTION public.get_published_by_dates(p_dates TEXT[])
RETURNS SETOF public.published_schedules
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.has_permission('schedules.read') AND NOT public.has_permission('schedules.manage') THEN
        RAISE EXCEPTION 'Permiso denegado: requiere schedules.read o schedules.manage';
    END IF;

    IF array_length(p_dates, 1) > 90 THEN
        RAISE EXCEPTION 'Too many dates requested (max 90)';
    END IF;

    RETURN QUERY
        SELECT *
        FROM public.published_schedules
        WHERE schedule_date = ANY(p_dates)
        ORDER BY schedule_date;
END;
$$;

-- Lightweight key lookup for duplicate detection during import
CREATE OR REPLACE FUNCTION public.get_existing_keys_by_dates(p_dates TEXT[])
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    result json;
BEGIN
    IF NOT (public.has_permission('schedules.read') OR public.has_permission('schedules.manage')) THEN
        RAISE EXCEPTION 'Permission denied';
    END IF;

    IF array_length(p_dates, 1) > 90 THEN
        RAISE EXCEPTION 'Too many dates requested (max 90)';
    END IF;

    SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO result
    FROM (
        SELECT date, program, start_time, instructor
        FROM public.schedule_entries
        WHERE date = ANY(p_dates)
    ) t;

    RETURN result;
END;
$$;

-- =============================================
-- 8. GRANTS
-- =============================================
GRANT EXECUTE ON FUNCTION public.get_daily_stats TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_monthly_incidence_rate TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_incidence_types TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_period_comparison TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_branch_stats TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_schedules_report TO authenticated;
GRANT EXECUTE ON FUNCTION public.batch_delete_schedule_entries(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_schedules_by_dates TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_schedules_by_dates_v2(TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_published_by_dates TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_existing_keys_by_dates(TEXT[]) TO authenticated;
