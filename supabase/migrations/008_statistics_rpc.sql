-- ============================================
-- Minerva v2 — 008: Statistics RPC Functions
-- ============================================
-- Server-side aggregation functions for the Statistics page.
-- Avoids the default 1000-row pagination limit of PostgREST.
-- Depends on 006_schedules_realtime.sql (schedule_entries table).
--
-- NOTA: Se usa "type IS NOT NULL" como indicador de incidencia,
-- ya que toda incidencia siempre tiene un tipo asignado.

-- =============================================
-- 1. Daily stats: classes and incidences per day
-- =============================================
CREATE OR REPLACE FUNCTION public.get_daily_stats(
    p_start_date TEXT,
    p_end_date TEXT
)
RETURNS TABLE(date TEXT, total_classes BIGINT, incidences BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    SELECT
        se.date,
        COUNT(*)::BIGINT AS total_classes,
        COUNT(se.type)::BIGINT AS incidences
    FROM public.schedule_entries se
    WHERE se.date >= p_start_date
      AND se.date <= p_end_date
    GROUP BY se.date
    ORDER BY se.date;
$$;

COMMENT ON FUNCTION public.get_daily_stats IS 'Daily aggregation of total classes and incidences for the area chart';

-- =============================================
-- 2. Monthly incidence rate (% and counts)
-- =============================================
CREATE OR REPLACE FUNCTION public.get_monthly_incidence_rate(
    p_start_date TEXT,
    p_end_date TEXT
)
RETURNS TABLE(month TEXT, total BIGINT, incidences BIGINT, rate NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    SELECT
        TO_CHAR(TO_DATE(se.date, 'YYYY-MM-DD'), 'YYYY-MM') AS month,
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
    GROUP BY TO_CHAR(TO_DATE(se.date, 'YYYY-MM-DD'), 'YYYY-MM')
    ORDER BY month;
$$;

COMMENT ON FUNCTION public.get_monthly_incidence_rate IS 'Monthly incidence rate (percentage and counts) for the bar chart';

-- =============================================
-- 3. Incidence type distribution
-- =============================================
CREATE OR REPLACE FUNCTION public.get_incidence_types(
    p_start_date TEXT,
    p_end_date TEXT
)
RETURNS TABLE(type TEXT, count BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    SELECT
        TRIM(se.type) AS type,
        COUNT(*)::BIGINT AS count
    FROM public.schedule_entries se
    WHERE se.date >= p_start_date
      AND se.date <= p_end_date
      AND se.type IS NOT NULL
    GROUP BY TRIM(se.type)
    ORDER BY count DESC;
$$;

COMMENT ON FUNCTION public.get_incidence_types IS 'Distribution of incidence types for the horizontal bar chart';

-- =============================================
-- 4. Period comparison (current vs previous)
-- =============================================
CREATE OR REPLACE FUNCTION public.get_period_comparison(
    p_cur_start TEXT,
    p_cur_end TEXT,
    p_prev_start TEXT,
    p_prev_end TEXT
)
RETURNS TABLE(period TEXT, total BIGINT, incidences BIGINT, rate NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
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
$$;

COMMENT ON FUNCTION public.get_period_comparison IS 'Comparison of incidence rates between two periods for the donut chart';

-- =============================================
-- Grant execute permissions to authenticated users
-- =============================================
GRANT EXECUTE ON FUNCTION public.get_daily_stats TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_monthly_incidence_rate TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_incidence_types TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_period_comparison TO authenticated;
