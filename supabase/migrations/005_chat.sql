-- ============================================
-- Minerva v2 — 005: Chat RAG Functions
-- ============================================
-- 6 RPCs for the chatbot to query schedule_entries directly.
-- All use SECURITY DEFINER + has_permission('schedules.read').
-- pg_trgm for fuzzy instructor name matching.
-- NOTE: end_time can be '' (empty string, not NULL) — all overlap
--       checks must guard with AND end_time <> '' before comparing.
-- NOTE: instructor names in schedule_entries contain metadata suffixes
--       (e.g. "(USA-ARG)(ONLINE) [ENG]"). Use word_similarity() instead of
--       similarity() so the query matches against a substring of the field.
-- Consolidates: 022_chat_rag_functions
-- Depends on: 001_foundation.sql, 003_schedules.sql

-- =============================================
-- 1. EXTENSIONS & INDEXES
-- =============================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_schedule_entries_instructor_trgm
    ON public.schedule_entries USING GIN (LOWER(instructor) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_schedule_entries_date_branch_program
    ON public.schedule_entries (date, branch, program);

CREATE INDEX IF NOT EXISTS idx_schedule_entries_date_covering
    ON public.schedule_entries (date)
    INCLUDE (instructor, program, branch, start_time, end_time, shift);

-- =============================================
-- 2. RPC: chat_get_schedules
-- =============================================
-- Returns schedules for a single date with optional filters.
-- p_time: HH:MM — returns only classes active at that exact moment.

CREATE OR REPLACE FUNCTION public.chat_get_schedules(
    p_date       TEXT,
    p_program    TEXT    DEFAULT NULL,
    p_branch     TEXT    DEFAULT NULL,
    p_time       TEXT    DEFAULT NULL,
    p_count_only BOOLEAN DEFAULT FALSE
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_total  BIGINT;
    v_result JSON;
BEGIN
    IF NOT public.has_permission('schedules.read') THEN
        RETURN json_build_object('error', 'Sin permiso para ver horarios');
    END IF;

    SELECT COUNT(*) INTO v_total
    FROM public.schedule_entries
    WHERE date = p_date
      AND (p_program IS NULL OR LOWER(program) LIKE '%' || LOWER(p_program) || '%')
      AND (p_branch  IS NULL OR LOWER(branch)  LIKE '%' || LOWER(p_branch)  || '%')
      AND (p_time    IS NULL OR (
            start_time <= p_time
            AND (end_time = '' OR end_time > p_time)
          ));

    IF p_count_only THEN
        RETURN json_build_object('date', p_date, 'count', v_total);
    END IF;

    SELECT json_build_object(
        'date',      p_date,
        'count',     v_total,
        'truncated', v_total > 100,
        'schedules', COALESCE(
            (SELECT json_agg(row_to_json(s))
             FROM (
                 SELECT instructor, program, branch, start_time, end_time, shift
                 FROM public.schedule_entries
                 WHERE date = p_date
                   AND (p_program IS NULL OR LOWER(program) LIKE '%' || LOWER(p_program) || '%')
                   AND (p_branch  IS NULL OR LOWER(branch)  LIKE '%' || LOWER(p_branch)  || '%')
                   AND (p_time    IS NULL OR (
                         start_time <= p_time
                         AND (end_time = '' OR end_time > p_time)
                       ))
                 ORDER BY start_time
                 LIMIT 100
             ) s),
            '[]'::JSON
        )
    ) INTO v_result;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.chat_get_schedules TO authenticated;

-- =============================================
-- 3. RPC: chat_find_instructor
-- =============================================
-- Finds an instructor's classes across a date range using fuzzy matching.
-- Uses word_similarity() to handle names with metadata suffixes.
-- p_threshold: pg_trgm threshold (0.0–1.0, default 0.15).
-- Max range: 90 days. Max results: 200.

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

    SELECT ARRAY_AGG(DISTINCT instructor) INTO v_matched
    FROM public.schedule_entries
    WHERE date BETWEEN p_start_date AND p_end_date
      AND extensions.word_similarity(LOWER(p_name), LOWER(instructor)) >= p_threshold;

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

GRANT EXECUTE ON FUNCTION public.chat_find_instructor TO authenticated;

-- =============================================
-- 4. RPC: chat_get_schedules_range
-- =============================================
-- Returns schedules for a multi-day range with optional filters.
-- Max range: 90 days.

CREATE OR REPLACE FUNCTION public.chat_get_schedules_range(
    p_start_date TEXT,
    p_end_date   TEXT,
    p_program    TEXT    DEFAULT NULL,
    p_branch     TEXT    DEFAULT NULL,
    p_count_only BOOLEAN DEFAULT FALSE,
    p_limit      INT     DEFAULT 100
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_limit  INT := LEAST(p_limit, 200);
    v_total  BIGINT;
    v_result JSON;
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

    SELECT COUNT(*) INTO v_total
    FROM public.schedule_entries
    WHERE date BETWEEN p_start_date AND p_end_date
      AND (p_program IS NULL OR LOWER(program) LIKE '%' || LOWER(p_program) || '%')
      AND (p_branch  IS NULL OR LOWER(branch)  LIKE '%' || LOWER(p_branch)  || '%');

    IF p_count_only THEN
        RETURN json_build_object(
            'start_date', p_start_date,
            'end_date',   p_end_date,
            'count',      v_total
        );
    END IF;

    SELECT json_build_object(
        'start_date', p_start_date,
        'end_date',   p_end_date,
        'count',      v_total,
        'truncated',  v_total > v_limit,
        'schedules', COALESCE(
            (SELECT json_agg(row_to_json(s))
             FROM (
                 SELECT date, instructor, program, branch, start_time, end_time, shift
                 FROM public.schedule_entries
                 WHERE date BETWEEN p_start_date AND p_end_date
                   AND (p_program IS NULL OR LOWER(program) LIKE '%' || LOWER(p_program) || '%')
                   AND (p_branch  IS NULL OR LOWER(branch)  LIKE '%' || LOWER(p_branch)  || '%')
                 ORDER BY date, start_time
                 LIMIT v_limit
             ) s),
            '[]'::JSON
        )
    ) INTO v_result;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.chat_get_schedules_range TO authenticated;

-- =============================================
-- 5. RPC: chat_get_stats
-- =============================================
-- Aggregate class counts grouped by instructor, date, branch, or program.
-- p_name_filter: optional word_similarity filter for instructor name.

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
                        OR extensions.word_similarity(LOWER(p_name_filter), LOWER(instructor)) >= p_threshold)
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

-- =============================================
-- 6. RPC: chat_check_instructor_availability
-- =============================================
-- Checks if a specific named instructor has conflicts in a time range.
-- Name resolution is global (not restricted to p_date) using word_similarity,
-- so an instructor with no classes on that date still resolves correctly
-- and returns is_available: true (no classes ≠ not found).

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

    -- Global name resolution: word_similarity handles metadata suffixes in instructor names
    SELECT ARRAY_AGG(DISTINCT instructor) INTO v_matched
    FROM public.schedule_entries
    WHERE extensions.word_similarity(LOWER(p_name), LOWER(instructor)) >= p_threshold;

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

GRANT EXECUTE ON FUNCTION public.chat_check_instructor_availability TO authenticated;

-- =============================================
-- 7. RPC: chat_find_available_instructors
-- =============================================
-- Returns instructors who have classes on p_date but NO overlap with the
-- requested time range. p_instructor_list restricts to a subset (optional).

CREATE OR REPLACE FUNCTION public.chat_find_available_instructors(
    p_date            TEXT,
    p_start_time      TEXT,
    p_end_time        TEXT,
    p_instructor_list TEXT[] DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_available TEXT[];
    v_result    JSON;
BEGIN
    IF NOT public.has_permission('schedules.read') THEN
        RETURN json_build_object('error', 'Sin permiso para ver horarios');
    END IF;

    IF p_instructor_list IS NOT NULL THEN
        SELECT ARRAY_AGG(instr ORDER BY instr) INTO v_available
        FROM UNNEST(p_instructor_list) AS instr
        WHERE NOT EXISTS (
            SELECT 1 FROM public.schedule_entries
            WHERE date = p_date
              AND LOWER(instructor) = LOWER(instr)
              AND end_time <> ''
              AND NOT (end_time <= p_start_time OR start_time >= p_end_time)
        );
    ELSE
        SELECT ARRAY_AGG(instructor ORDER BY instructor) INTO v_available
        FROM (
            SELECT DISTINCT instructor
            FROM public.schedule_entries
            WHERE date = p_date

            EXCEPT

            SELECT DISTINCT instructor
            FROM public.schedule_entries
            WHERE date = p_date
              AND end_time <> ''
              AND NOT (end_time <= p_start_time OR start_time >= p_end_time)
        ) sub;
    END IF;

    RETURN json_build_object(
        'date',                  p_date,
        'time_range',            p_start_time || '–' || p_end_time,
        'available_count',       COALESCE(array_length(v_available, 1), 0),
        'available_instructors', COALESCE(to_json(v_available), '[]'::JSON)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.chat_find_available_instructors TO authenticated;
