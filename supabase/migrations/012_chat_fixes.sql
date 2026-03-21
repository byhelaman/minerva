-- =============================================
-- Migration 012: Chat RAG fixes
-- =============================================
-- Fix 1: chat_check_instructor_availability — return is_available:true when
--         instructor has no classes that day (no classes ≠ not found).
-- Fix 2: chat_get_stats — add 'program' as valid group_by value.

-- =============================================
-- Fix 1: chat_check_instructor_availability
-- =============================================
-- Previous behavior: if instructor not in schedule_entries on that date →
--   is_available: null, note: "Instructor no encontrado en esa fecha"
-- New behavior: no entries on that date → is_available: true (no conflicts).

CREATE OR REPLACE FUNCTION public.chat_check_instructor_availability(
    p_name       TEXT,
    p_date       TEXT,
    p_start_time TEXT,
    p_end_time   TEXT,
    p_threshold  FLOAT DEFAULT 0.15
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_matched  TEXT[];
    v_result   JSON;
BEGIN
    IF NOT public.has_permission('schedules.read') THEN
        RETURN json_build_object('error', 'Sin permiso para ver horarios');
    END IF;

    -- Match instructor name across the full date range of the table (not just p_date),
    -- so we can resolve the name even if they have no classes that specific day.
    SELECT ARRAY_AGG(DISTINCT instructor) INTO v_matched
    FROM public.schedule_entries
    WHERE public.similarity(LOWER(instructor), LOWER(p_name)) >= p_threshold;

    IF v_matched IS NULL OR array_length(v_matched, 1) = 0 THEN
        RETURN json_build_object(
            'instructor_query',    p_name,
            'matched_instructors', '[]'::JSON,
            'date',                p_date,
            'time_range',          p_start_time || '–' || p_end_time,
            'is_available',        NULL,
            'note',                'Instructor no encontrado en el sistema'
        );
    END IF;

    -- Check for conflicts on the specific date
    SELECT json_build_object(
        'instructor_query',    p_name,
        'matched_instructors', to_json(v_matched),
        'date',                p_date,
        'time_range',          p_start_time || '–' || p_end_time,
        'is_available', NOT EXISTS (
            SELECT 1 FROM public.schedule_entries
            WHERE date = p_date
              AND instructor = ANY(v_matched)
              AND end_time <> ''
              AND NOT (end_time <= p_start_time OR start_time >= p_end_time)
        ),
        'conflicts', COALESCE(
            (SELECT json_agg(row_to_json(c))
             FROM (
                 SELECT instructor, program, branch, start_time, end_time
                 FROM public.schedule_entries
                 WHERE date = p_date
                   AND instructor = ANY(v_matched)
                   AND end_time <> ''
                   AND NOT (end_time <= p_start_time OR start_time >= p_end_time)
                 ORDER BY start_time
             ) c),
            '[]'::JSON
        )
    ) INTO v_result;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.chat_check_instructor_availability(TEXT, TEXT, TEXT, TEXT, FLOAT) TO authenticated;


-- =============================================
-- Fix 2: chat_get_stats — add 'program' group_by
-- =============================================

CREATE OR REPLACE FUNCTION public.chat_get_stats(
    p_start_date  TEXT,
    p_end_date    TEXT,
    p_group_by    TEXT  DEFAULT 'instructor',  -- 'instructor' | 'date' | 'branch' | 'program'
    p_name_filter TEXT  DEFAULT NULL,
    p_threshold   FLOAT DEFAULT 0.15
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_result JSON;
BEGIN
    IF NOT public.has_permission('schedules.read') THEN
        RETURN json_build_object('error', 'Sin permiso para ver horarios');
    END IF;

    BEGIN
        IF (p_end_date::DATE - p_start_date::DATE) > 366 THEN
            RETURN json_build_object('error', 'El rango no puede superar 1 año');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RETURN json_build_object('error', 'Formato de fecha inválido (usa YYYY-MM-DD)');
    END;

    IF p_group_by NOT IN ('instructor', 'date', 'branch', 'program') THEN
        RETURN json_build_object('error', 'group_by debe ser instructor, date, branch o program');
    END IF;

    SELECT json_build_object(
        'period',   p_start_date || ' / ' || p_end_date,
        'group_by', p_group_by,
        'stats', COALESCE(
            (SELECT json_agg(json_build_object('key', grp_key, 'count', cnt) ORDER BY cnt DESC)
             FROM (
                 SELECT
                     CASE p_group_by
                         WHEN 'instructor' THEN instructor
                         WHEN 'date'       THEN date
                         WHEN 'branch'     THEN branch
                         WHEN 'program'    THEN program
                     END AS grp_key,
                     COUNT(*) AS cnt
                 FROM public.schedule_entries
                 WHERE date BETWEEN p_start_date AND p_end_date
                   AND (p_name_filter IS NULL
                        OR public.similarity(LOWER(instructor), LOWER(p_name_filter)) >= p_threshold)
                 GROUP BY grp_key
                 ORDER BY cnt DESC
                 LIMIT 50
             ) sub),
            '[]'::JSON
        )
    ) INTO v_result;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.chat_get_stats(TEXT, TEXT, TEXT, TEXT, FLOAT) TO authenticated;
