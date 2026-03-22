-- ============================================
-- Minerva v2 — 018: Chat Improvements
-- ============================================
-- 1. New RPC: chat_get_instructor_free_windows
--    Computes free time slots for an instructor on a date by subtracting
--    their scheduled classes from their registered availability windows.
--
-- 2. Updated: chat_find_evaluators
--    Adds diagnostics.reason when result is empty, explaining why:
--    'no_evaluators_for_filter' | 'no_availability_window' | 'all_have_conflicts'
--
-- 3. Updated: chat_check_instructor_availability
--    Adds reason field: 'class_conflict' | 'instructor_not_found' | 'available'
--
-- Depends on: 005_chat.sql, 006_instructor_profiles.sql

-- =============================================
-- 1. RPC: chat_get_instructor_free_windows
-- =============================================
-- Returns the free time slots for an instructor on a given date.
-- Algorithm: for each availability window (from instructor_availability),
-- subtract scheduled classes (from schedule_entries) to produce gap intervals.

CREATE OR REPLACE FUNCTION public.chat_get_instructor_free_windows(
    p_name      TEXT,
    p_date      TEXT,
    p_threshold FLOAT DEFAULT 0.15
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_profile_id   UUID;
    v_profile_name TEXT;
    v_dow          INT;
    v_free_windows JSON[];
    r_avail        RECORD;
    r_busy         RECORD;
    v_cursor       TEXT;
BEGIN
    IF NOT public.has_permission('schedules.read') THEN
        RETURN json_build_object('error', 'Sin permiso para ver horarios');
    END IF;

    -- Fuzzy match against instructor_profiles
    SELECT id, name INTO v_profile_id, v_profile_name
    FROM public.instructor_profiles
    WHERE extensions.word_similarity(LOWER(p_name), LOWER(name)) >= p_threshold
    ORDER BY extensions.word_similarity(LOWER(p_name), LOWER(name)) DESC
    LIMIT 1;

    IF v_profile_id IS NULL THEN
        RETURN json_build_object(
            'instructor_query', p_name,
            'error',            'Instructor not found in profiles',
            'note',             'No registered profile — cannot compute availability windows.'
        );
    END IF;

    -- Convert PostgreSQL DOW (0=Sun…6=Sat) to our convention (1=Mon…7=Sun)
    v_dow := CASE EXTRACT(DOW FROM p_date::DATE)
                 WHEN 0 THEN 7
                 ELSE EXTRACT(DOW FROM p_date::DATE)::INT
             END;

    v_free_windows := '{}';

    -- For each availability window on this day of week, subtract busy intervals
    FOR r_avail IN
        SELECT start_time, end_time
        FROM public.instructor_availability
        WHERE profile_id = v_profile_id
          AND day_of_week = v_dow
        ORDER BY start_time
    LOOP
        v_cursor := r_avail.start_time;

        FOR r_busy IN
            SELECT start_time, end_time
            FROM public.schedule_entries
            WHERE date = p_date
              AND extensions.word_similarity(LOWER(v_profile_name), LOWER(instructor)) >= 0.5
              AND end_time <> ''
              AND start_time < r_avail.end_time
              AND end_time   > r_avail.start_time
            ORDER BY start_time
        LOOP
            -- Gap before this class
            IF v_cursor < r_busy.start_time THEN
                v_free_windows := array_append(
                    v_free_windows,
                    json_build_object('start', v_cursor, 'end', r_busy.start_time)
                );
            END IF;
            -- Advance cursor past this class
            IF r_busy.end_time > v_cursor THEN
                v_cursor := r_busy.end_time;
            END IF;
        END LOOP;

        -- Remaining gap after last class
        IF v_cursor < r_avail.end_time THEN
            v_free_windows := array_append(
                v_free_windows,
                json_build_object('start', v_cursor, 'end', r_avail.end_time)
            );
        END IF;
    END LOOP;

    RETURN json_build_object(
        'instructor_query',    p_name,
        'matched_name',        v_profile_name,
        'date',                p_date,
        'has_availability',    EXISTS (
            SELECT 1 FROM public.instructor_availability
            WHERE profile_id = v_profile_id AND day_of_week = v_dow
        ),
        'availability_windows', COALESCE(
            (SELECT json_agg(
                json_build_object('start', start_time, 'end', end_time)
                ORDER BY start_time
             )
             FROM public.instructor_availability
             WHERE profile_id = v_profile_id AND day_of_week = v_dow),
            '[]'::JSON
        ),
        'classes', COALESCE(
            (SELECT json_agg(
                json_build_object(
                    'start',   start_time,
                    'end',     end_time,
                    'program', program,
                    'branch',  branch
                ) ORDER BY start_time
             )
             FROM public.schedule_entries
             WHERE date = p_date
               AND extensions.word_similarity(LOWER(v_profile_name), LOWER(instructor)) >= 0.5
               AND end_time <> ''),
            '[]'::JSON
        ),
        'free_windows', COALESCE(to_json(v_free_windows), '[]'::JSON)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.chat_get_instructor_free_windows TO authenticated;


-- =============================================
-- 2. Updated RPC: chat_find_evaluators
-- =============================================
-- Same logic as before, plus diagnostics.reason when count = 0.

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT oid::regprocedure AS sig
    FROM pg_proc
    WHERE proname = 'chat_find_evaluators'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.chat_find_evaluators(
    p_date       TEXT,
    p_start_time TEXT,
    p_end_time   TEXT,
    p_eval_type  TEXT  DEFAULT NULL,
    p_language   TEXT  DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_dow                   INT;
    v_count_filter          BIGINT;
    v_count_with_window     BIGINT;
    v_count_available       BIGINT;
    v_reason                TEXT;
    v_result                JSON;
BEGIN
    IF NOT public.has_permission('instructors.view') THEN
        RETURN json_build_object('error', 'Sin permiso para ver instructores');
    END IF;

    v_dow := CASE EXTRACT(DOW FROM p_date::DATE)
                 WHEN 0 THEN 7
                 ELSE EXTRACT(DOW FROM p_date::DATE)::INT
             END;

    -- Step 1: Evaluators matching the type/language filter
    SELECT COUNT(DISTINCT ip.id) INTO v_count_filter
    FROM public.instructor_profiles ip
    WHERE ip.can_evaluate = true
      AND (p_eval_type IS NULL OR p_eval_type = ANY(ip.eval_types))
      AND (p_language  IS NULL OR p_language  = ANY(ip.languages));

    -- Step 2: Of those, which have an availability window covering the slot on this DOW
    SELECT COUNT(DISTINCT ip.id) INTO v_count_with_window
    FROM public.instructor_profiles ip
    JOIN public.instructor_availability ia ON ia.profile_id = ip.id
    WHERE ip.can_evaluate = true
      AND (p_eval_type IS NULL OR p_eval_type = ANY(ip.eval_types))
      AND (p_language  IS NULL OR p_language  = ANY(ip.languages))
      AND ia.day_of_week = v_dow
      AND ia.start_time  <= p_start_time
      AND ia.end_time    >= p_end_time;

    -- Step 3: Final count (no conflicts)
    SELECT COUNT(DISTINCT ip.id) INTO v_count_available
    FROM public.instructor_profiles ip
    JOIN public.instructor_availability ia ON ia.profile_id = ip.id
    WHERE ip.can_evaluate = true
      AND (p_eval_type IS NULL OR p_eval_type = ANY(ip.eval_types))
      AND (p_language  IS NULL OR p_language  = ANY(ip.languages))
      AND ia.day_of_week = v_dow
      AND ia.start_time  <= p_start_time
      AND ia.end_time    >= p_end_time
      AND NOT EXISTS (
          SELECT 1 FROM public.schedule_entries se
          WHERE se.date       = p_date
            AND se.instructor = ip.code
            AND se.end_time  <> ''
            AND NOT (se.end_time <= p_start_time OR se.start_time >= p_end_time)
      );

    -- Determine reason when result is empty
    IF v_count_available = 0 THEN
        v_reason := CASE
            WHEN v_count_filter     = 0 THEN 'no_evaluators_for_filter'
            WHEN v_count_with_window = 0 THEN 'no_availability_window'
            ELSE                              'all_have_conflicts'
        END;
    END IF;

    SELECT json_build_object(
        'date',       p_date,
        'time_range', p_start_time || '–' || p_end_time,
        'eval_type',  p_eval_type,
        'language',   p_language,
        'count',      v_count_available,
        'evaluators', COALESCE(
            (SELECT json_agg(json_build_object(
                'name',       ip.name,
                'eval_types', ip.eval_types,
                'languages',  ip.languages
             ))
             FROM public.instructor_profiles ip
             JOIN public.instructor_availability ia ON ia.profile_id = ip.id
             WHERE ip.can_evaluate = true
               AND (p_eval_type IS NULL OR p_eval_type = ANY(ip.eval_types))
               AND (p_language  IS NULL OR p_language  = ANY(ip.languages))
               AND ia.day_of_week = v_dow
               AND ia.start_time  <= p_start_time
               AND ia.end_time    >= p_end_time
               AND NOT EXISTS (
                   SELECT 1 FROM public.schedule_entries se
                   WHERE se.date       = p_date
                     AND se.instructor = ip.code
                     AND se.end_time  <> ''
                     AND NOT (se.end_time <= p_start_time OR se.start_time >= p_end_time)
               )
            ),
            '[]'::JSON
        ),
        'diagnostics', CASE
            WHEN v_count_available > 0 THEN NULL
            ELSE json_build_object(
                'total_for_filter',   v_count_filter,
                'with_window',        v_count_with_window,
                'without_conflicts',  v_count_available,
                'reason',             v_reason
            )
        END
    ) INTO v_result;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.chat_find_evaluators TO authenticated;


-- =============================================
-- 3. Updated RPC: chat_check_instructor_availability
-- =============================================
-- Adds a 'reason' field explaining unavailability.

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT oid::regprocedure AS sig
    FROM pg_proc
    WHERE proname = 'chat_check_instructor_availability'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig;
  END LOOP;
END;
$$;

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
    v_matched TEXT[];
    v_result  JSON;
BEGIN
    IF NOT public.has_permission('schedules.read') THEN
        RETURN json_build_object('error', 'Sin permiso para ver horarios');
    END IF;

    -- Global name resolution across all schedule_entries
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
            'reason',              'instructor_not_found',
            'note',                'Instructor not found in schedule_entries'
        );
    END IF;

    SELECT json_build_object(
        'instructor_query',    p_name,
        'matched_instructors', to_json(v_matched),
        'date',                p_date,
        'time_range',          p_start_time || '–' || p_end_time,
        'is_available', NOT EXISTS (
            SELECT 1 FROM public.schedule_entries
            WHERE date       = p_date
              AND instructor  = ANY(v_matched)
              AND end_time   <> ''
              AND NOT (end_time <= p_start_time OR start_time >= p_end_time)
        ),
        'reason', CASE
            WHEN EXISTS (
                SELECT 1 FROM public.schedule_entries
                WHERE date       = p_date
                  AND instructor  = ANY(v_matched)
                  AND end_time   <> ''
                  AND NOT (end_time <= p_start_time OR start_time >= p_end_time)
            ) THEN 'class_conflict'
            ELSE 'available'
        END,
        'conflicts', COALESCE(
            (SELECT json_agg(row_to_json(c))
             FROM (
                 SELECT instructor, program, branch, start_time, end_time
                 FROM public.schedule_entries
                 WHERE date       = p_date
                   AND instructor  = ANY(v_matched)
                   AND end_time   <> ''
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
