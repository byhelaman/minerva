-- ============================================
-- Minerva v2 — Manual Rollback: Restore Reports/Statistics/Incidences
-- ============================================
-- Purpose:
--   Fast manual rollback after deprecations 012 + 013.
--
-- IMPORTANT:
--   1) This file is MANUAL. Do NOT place it in automated migration chains.
--   2) Data previously nulled by migration 012 cannot be recovered from this script.
--      Use backup/PITR for historical incidence values.

BEGIN;

-- =============================================
-- 1) Recreate incidence columns if missing
-- =============================================
ALTER TABLE public.schedule_entries
    ADD COLUMN IF NOT EXISTS status TEXT,
    ADD COLUMN IF NOT EXISTS substitute TEXT,
    ADD COLUMN IF NOT EXISTS type TEXT,
    ADD COLUMN IF NOT EXISTS subtype TEXT,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS department TEXT,
    ADD COLUMN IF NOT EXISTS feedback TEXT;

-- =============================================
-- 2) Restore sanitize trigger function (incidence-aware)
-- =============================================
CREATE OR REPLACE FUNCTION public.sanitize_schedule_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- ===== TIME NORMALIZATION (HH:MM) =====
    IF NEW.start_time IS NOT NULL AND NEW.start_time ~ '^\d{1,2}:\d{2}' THEN
        NEW.start_time = LPAD(SPLIT_PART(NEW.start_time, ':', 1), 2, '0') || ':' || SUBSTRING(SPLIT_PART(NEW.start_time, ':', 2), 1, 2);
    END IF;

    IF NEW.end_time IS NOT NULL AND NEW.end_time <> '' AND NEW.end_time ~ '^\d{1,2}:\d{2}' THEN
        NEW.end_time = LPAD(SPLIT_PART(NEW.end_time, ':', 1), 2, '0') || ':' || SUBSTRING(SPLIT_PART(NEW.end_time, ':', 2), 1, 2);
    END IF;

    -- ===== KEY FIELDS =====
    IF NEW.instructor IS NOT NULL THEN
        NEW.instructor = NULLIF(REGEXP_REPLACE(TRIM(NEW.instructor), '\s+', ' ', 'g'), '');
        IF NEW.instructor IS NULL THEN
            NEW.instructor = 'none';
        END IF;
    END IF;

    IF NEW.program IS NOT NULL THEN
        NEW.program = NULLIF(REGEXP_REPLACE(TRIM(NEW.program), '\s+', ' ', 'g'), '');
    END IF;

    -- ===== CLASSIFICATION FIELDS =====
    IF NEW.type IS NOT NULL THEN
        NEW.type = NULLIF(TRIM(NEW.type), '');
    END IF;

    IF NEW.subtype IS NOT NULL THEN
        NEW.subtype = NULLIF(TRIM(NEW.subtype), '');
    END IF;

    IF NEW.department IS NOT NULL THEN
        NEW.department = NULLIF(TRIM(NEW.department), '');
    END IF;

    -- ===== INCIDENCE TEXT FIELDS =====
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

    -- ===== BRANCH NORMALIZATION =====
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

-- =============================================
-- 3) Restore reports permissions
-- =============================================
INSERT INTO public.permissions (name, description, min_role_level)
VALUES
    ('reports.view', 'View system reports', 80),
    ('reports.manage', 'Manage reports: import, delete, sync', 80)
ON CONFLICT (name)
DO UPDATE SET
    description = EXCLUDED.description,
    min_role_level = EXCLUDED.min_role_level;

INSERT INTO public.role_permissions (role, permission)
VALUES
    ('admin', 'reports.view'),
    ('admin', 'reports.manage'),
    ('super_admin', 'reports.view'),
    ('super_admin', 'reports.manage')
ON CONFLICT (role, permission) DO NOTHING;

-- =============================================
-- 4) Restore Reports/Statistics RPCs
-- =============================================

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
-- 5) Restore get_schedules_by_dates_v2 payload (with incidence fields)
-- =============================================
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

-- =============================================
-- 6) Grants for restored RPCs
-- =============================================
GRANT EXECUTE ON FUNCTION public.get_daily_stats(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_monthly_incidence_rate(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_incidence_types(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_period_comparison(TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_branch_stats(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_schedules_report(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.batch_delete_schedule_entries(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_schedules_by_dates_v2(TEXT[]) TO authenticated;

COMMIT;
