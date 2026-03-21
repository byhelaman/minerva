-- =============================================
-- Migration 013: Replace similarity() with word_similarity() for
--               schedule_entries instructor name matching
-- =============================================
-- Problem: instructor names in schedule_entries contain metadata:
--   "JOHN DOE (USA-ARG)(ONLINE) [ENG]"
-- similarity('john doe', 'john doe (usa-arg)(online) [eng]') scores low
-- because Jaccard is penalized by the extra tokens in the DB value.
-- word_similarity() measures if the query string appears *within* the DB value,
-- returning ~1.0 for 'john doe' inside the above string.
--
-- Affected RPCs (all match against schedule_entries.instructor):
--   - chat_find_instructor
--   - chat_check_instructor_availability  (supersedes migration 012 fix)
--   - chat_get_stats (p_name_filter)
--
-- NOT changed: chat_get_instructor_profile — matches against instructor_profiles.name
-- (clean names, similarity() is fine there).

-- =============================================
-- 1. chat_find_instructor
-- =============================================
CREATE OR REPLACE FUNCTION public.chat_find_instructor(
    p_name       TEXT,
    p_start_date TEXT,
    p_end_date   TEXT,
    p_threshold  FLOAT DEFAULT 0.15
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_total   BIGINT;
    v_result  JSON;
    v_matched TEXT[];
BEGIN
    IF NOT public.has_permission('schedules.read') THEN
        RETURN json_build_object('error', 'Sin permiso para ver horarios');
    END IF;

    BEGIN
        IF (p_end_date::DATE - p_start_date::DATE) > 90 THEN
            RETURN json_build_object('error', 'El rango no puede superar 90 días');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RETURN json_build_object('error', 'Formato de fecha inválido (usa YYYY-MM-DD)');
    END;

    -- word_similarity: checks if p_name appears *within* the instructor field
    -- handles "JOHN DOE (USA-ARG)(ONLINE) [ENG]" → query "john doe" scores ~1.0
    SELECT ARRAY_AGG(DISTINCT instructor) INTO v_matched
    FROM public.schedule_entries
    WHERE date BETWEEN p_start_date AND p_end_date
      AND public.word_similarity(LOWER(p_name), LOWER(instructor)) >= p_threshold;

    IF v_matched IS NULL OR array_length(v_matched, 1) = 0 THEN
        RETURN json_build_object(
            'instructor_query',    p_name,
            'matched_instructors', '[]'::JSON,
            'date_range',          p_start_date || ' / ' || p_end_date,
            'count',               0,
            'schedules',           '[]'::JSON
        );
    END IF;

    SELECT COUNT(*) INTO v_total
    FROM public.schedule_entries
    WHERE date BETWEEN p_start_date AND p_end_date
      AND instructor = ANY(v_matched);

    SELECT json_build_object(
        'instructor_query',    p_name,
        'matched_instructors', to_json(v_matched),
        'date_range',          p_start_date || ' / ' || p_end_date,
        'count',               v_total,
        'truncated',           v_total > 200,
        'schedules', COALESCE(
            (SELECT json_agg(row_to_json(s))
             FROM (
                 SELECT date, instructor, program, branch, start_time, end_time, shift
                 FROM public.schedule_entries
                 WHERE date BETWEEN p_start_date AND p_end_date
                   AND instructor = ANY(v_matched)
                 ORDER BY date, start_time
                 LIMIT 200
             ) s),
            '[]'::JSON
        )
    ) INTO v_result;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.chat_find_instructor(TEXT, TEXT, TEXT, FLOAT) TO authenticated;


-- =============================================
-- 2. chat_check_instructor_availability  (supersedes migration 012)
-- =============================================
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

    -- Global name resolution using word_similarity (not restricted to p_date)
    SELECT ARRAY_AGG(DISTINCT instructor) INTO v_matched
    FROM public.schedule_entries
    WHERE public.word_similarity(LOWER(p_name), LOWER(instructor)) >= p_threshold;

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
-- 3. chat_get_stats — word_similarity for name filter
-- =============================================
CREATE OR REPLACE FUNCTION public.chat_get_stats(
    p_start_date  TEXT,
    p_end_date    TEXT,
    p_group_by    TEXT  DEFAULT 'instructor',
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
                        OR public.word_similarity(LOWER(p_name_filter), LOWER(instructor)) >= p_threshold)
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
