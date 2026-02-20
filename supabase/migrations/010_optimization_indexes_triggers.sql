-- ============================================
-- Minerva v2 — 010: Indexes & Triggers Optimization
-- ============================================
-- Optimizations for 'schedule_entries' and 
-- rewrite of reporting RPCs to leverage indexed data.
-- Replaces heavy string manipulations during SELECT reports 
-- with a proactive TRIGGER on INSERT/UPDATE.

-- =============================================
-- 1. INDEXES OPTIMIZATION (Expression)
-- =============================================

-- Magical pre-computed expression index for fast Monthly Incidence Report isolation
-- USING SUBSTRING(date, 1, 7) TO EXTRACT 'YYYY-MM' (e.g. '2023-10-05' -> '2023-10')
-- This is used instead of TO_CHAR because index expressions must be strictly IMMUTABLE.
DROP INDEX IF EXISTS idx_schedule_entries_month;
CREATE INDEX IF NOT EXISTS idx_schedule_entries_month 
ON public.schedule_entries(SUBSTRING(date, 1, 7));

-- =============================================
-- 2. DATA SANITIZATION TRIGGER (Pre-computation)
-- =============================================
CREATE OR REPLACE FUNCTION public.sanitize_schedule_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.type IS NOT NULL THEN
        NEW.type = NULLIF(TRIM(NEW.type), '');
    END IF;
    
    IF NEW.subtype IS NOT NULL THEN
        NEW.subtype = NULLIF(TRIM(NEW.subtype), '');
    END IF;
    
    IF NEW.department IS NOT NULL THEN
        NEW.department = NULLIF(TRIM(NEW.department), '');
    END IF;
    
    IF NEW.instructor IS NOT NULL THEN
        NEW.instructor = NULLIF(TRIM(NEW.instructor), '');
        IF NEW.instructor IS NULL THEN
            NEW.instructor = 'none';
        END IF;
    END IF;
    
    IF NEW.program IS NOT NULL THEN
        NEW.program = NULLIF(TRIM(NEW.program), '');
    END IF;
    
    -- Branch normalization (UPPER and standardize)
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

-- Retroactively clean existing records
UPDATE public.schedule_entries SET instructor = 'none' WHERE TRIM(instructor) = '';

-- Add structural constraints
ALTER TABLE public.schedule_entries DROP CONSTRAINT IF EXISTS schedule_entries_instructor_not_empty;
ALTER TABLE public.schedule_entries ADD CONSTRAINT schedule_entries_instructor_not_empty CHECK (TRIM(instructor) <> '');

ALTER TABLE public.schedule_entries DROP CONSTRAINT IF EXISTS schedule_entries_program_not_empty;
ALTER TABLE public.schedule_entries ADD CONSTRAINT schedule_entries_program_not_empty CHECK (TRIM(program) <> '');

UPDATE public.schedule_entries SET id = id;

-- =============================================
-- 3. REFACTORING STATISTICS RPCs
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

-- Ensure permissions
GRANT EXECUTE ON FUNCTION public.get_daily_stats TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_monthly_incidence_rate TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_incidence_types TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_period_comparison TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_branch_stats TO authenticated;
