-- =============================================
-- Migration 017: move extensions to dedicated schema
-- =============================================
-- Follows Supabase Security Advisor recommendation.
-- Moves pg_trgm and unaccent from public to extensions schema.
-- Re-creates all functions that reference these extensions with
-- the correct extensions.* prefix (SET search_path = '' requires it).

-- Step 1: ensure extensions schema exists and move extensions
CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION "pg_trgm" SET SCHEMA extensions;
ALTER EXTENSION "unaccent" SET SCHEMA extensions;

-- Step 2: set DB-level search_path (for non-SECURITY DEFINER queries)
ALTER DATABASE postgres SET search_path TO "$user", public, extensions;

-- =============================================
-- Patch: chat_find_instructor (pg_trgm → word_similarity)
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

-- =============================================
-- Patch: chat_get_stats (pg_trgm → word_similarity)
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

-- =============================================
-- Patch: chat_check_instructor_availability (pg_trgm → word_similarity)
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

-- =============================================
-- Patch: chat_get_instructor_profile (pg_trgm → similarity)
-- =============================================
CREATE OR REPLACE FUNCTION public.chat_get_instructor_profile(
  p_name      TEXT,
  p_threshold FLOAT DEFAULT 0.15
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile RECORD;
  v_result  JSON;
BEGIN
  IF NOT public.has_permission('instructors.view') THEN
    RETURN json_build_object('error', 'Sin permiso para ver perfiles de instructores');
  END IF;

  SELECT id, code, name, is_native, languages, email,
         can_evaluate, eval_types, notes
  INTO v_profile
  FROM public.instructor_profiles
  WHERE extensions.similarity(LOWER(name), LOWER(p_name)) >= p_threshold
  ORDER BY extensions.similarity(LOWER(name), LOWER(p_name)) DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'instructor_query', p_name,
      'profile',          NULL,
      'availability',     '[]'::JSON,
      'note',             'No se encontró perfil para ese instructor'
    );
  END IF;

  SELECT json_build_object(
    'instructor_query', p_name,
    'profile', json_build_object(
      'code',          v_profile.code,
      'name',          v_profile.name,
      'is_native',     v_profile.is_native,
      'languages',     v_profile.languages,
      'email',         v_profile.email,
      'can_evaluate',  v_profile.can_evaluate,
      'eval_types',    v_profile.eval_types,
      'notes',         v_profile.notes
    ),
    'availability', COALESCE(
      (SELECT json_agg(row_to_json(a) ORDER BY a.day_of_week, a.start_time)
       FROM (
         SELECT day_of_week, start_time, end_time
         FROM public.instructor_availability
         WHERE profile_id = v_profile.id
         ORDER BY day_of_week, start_time
       ) a),
      '[]'::JSON
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- =============================================
-- Patch: chat_find_evaluators (unaccent)
-- =============================================
CREATE OR REPLACE FUNCTION public.chat_find_evaluators(
  p_date       TEXT,
  p_start_time TEXT,
  p_end_time   TEXT,
  p_eval_type  TEXT DEFAULT NULL,
  p_language   TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_dow    SMALLINT;
  v_result JSON;
BEGIN
  IF NOT public.has_permission('instructors.view') THEN
    RETURN json_build_object('error', 'Sin permiso para ver perfiles de instructores');
  END IF;

  BEGIN
    v_dow := EXTRACT(ISODOW FROM p_date::DATE)::SMALLINT;
  EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('error', 'Formato de fecha inválido (usa YYYY-MM-DD)');
  END;

  SELECT json_build_object(
    'date',        p_date,
    'time_range',  p_start_time || '–' || p_end_time,
    'day_of_week', v_dow,
    'eval_type',   p_eval_type,
    'language',    p_language,
    'evaluators', COALESCE(
      (SELECT json_agg(
         json_build_object(
           'name',       ip.name,
           'code',       ip.code,
           'eval_types', ip.eval_types,
           'languages',  ip.languages,
           'notes',      ip.notes
         ) ORDER BY ip.name
       )
       FROM public.instructor_profiles ip
       WHERE ip.can_evaluate = true
         AND (p_eval_type IS NULL OR ip.eval_types @> ARRAY[p_eval_type])
         AND (p_language IS NULL OR EXISTS (
           SELECT 1 FROM unnest(ip.languages) AS l
           WHERE extensions.unaccent(lower(l)) = extensions.unaccent(lower(p_language))
         ))
         AND EXISTS (
           SELECT 1
           FROM public.instructor_availability ia
           WHERE ia.profile_id  = ip.id
             AND ia.day_of_week = v_dow
             AND ia.start_time <= p_start_time
             AND ia.end_time   >= p_end_time
         )
         AND NOT EXISTS (
           SELECT 1
           FROM public.schedule_entries se
           WHERE se.date      = p_date
             AND se.code      = ip.code
             AND se.end_time <> ''
             AND NOT (se.end_time <= p_start_time OR se.start_time >= p_end_time)
         )
      ),
      '[]'::JSON
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- =============================================
-- Patch: chat_get_evaluators_list (unaccent)
-- =============================================
CREATE OR REPLACE FUNCTION public.chat_get_evaluators_list(
  p_eval_type TEXT DEFAULT NULL,
  p_language  TEXT DEFAULT NULL
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
  IF NOT public.has_permission('instructors.view') THEN
    RETURN json_build_object('error', 'Sin permiso para ver perfiles de instructores');
  END IF;

  SELECT json_build_object(
    'eval_type',  p_eval_type,
    'language',   p_language,
    'total',      COUNT(*),
    'evaluators', COALESCE(
      json_agg(
        json_build_object(
          'name',       ip.name,
          'code',       ip.code,
          'eval_types', ip.eval_types,
          'languages',  ip.languages,
          'notes',      ip.notes
        ) ORDER BY ip.name
      ),
      '[]'::JSON
    )
  )
  FROM public.instructor_profiles ip
  WHERE ip.can_evaluate = true
    AND (p_eval_type IS NULL OR ip.eval_types @> ARRAY[p_eval_type])
    AND (p_language IS NULL OR EXISTS (
      SELECT 1 FROM unnest(ip.languages) AS l
      WHERE extensions.unaccent(lower(l)) = extensions.unaccent(lower(p_language))
    ))
  INTO v_result;

  RETURN v_result;
END;
$$;

-- =============================================
-- Patch: chat_find_instructors (unaccent)
-- =============================================
CREATE OR REPLACE FUNCTION public.chat_find_instructors(
  p_language     TEXT    DEFAULT NULL,
  p_is_native    BOOLEAN DEFAULT NULL,
  p_can_evaluate BOOLEAN DEFAULT NULL,
  p_eval_type    TEXT    DEFAULT NULL
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
  IF NOT public.has_permission('instructors.view') THEN
    RETURN json_build_object('error', 'Sin permiso para ver perfiles de instructores');
  END IF;

  SELECT json_build_object(
    'language',     p_language,
    'is_native',    p_is_native,
    'can_evaluate', p_can_evaluate,
    'eval_type',    p_eval_type,
    'total',        COUNT(*),
    'instructors', COALESCE(
      json_agg(
        json_build_object(
          'name',         ip.name,
          'code',         ip.code,
          'languages',    ip.languages,
          'is_native',    ip.is_native,
          'can_evaluate', ip.can_evaluate,
          'eval_types',   ip.eval_types,
          'notes',        ip.notes,
          'availability', (
            SELECT COALESCE(json_agg(
              json_build_object(
                'day_of_week', ia.day_of_week,
                'start_time',  ia.start_time,
                'end_time',    ia.end_time
              ) ORDER BY ia.day_of_week, ia.start_time
            ), '[]'::JSON)
            FROM public.instructor_availability ia
            WHERE ia.profile_id = ip.id
          )
        ) ORDER BY ip.name
      ),
      '[]'::JSON
    )
  )
  FROM public.instructor_profiles ip
  WHERE
    (p_language IS NULL OR EXISTS (
      SELECT 1 FROM unnest(ip.languages) AS l
      WHERE extensions.unaccent(lower(l)) = extensions.unaccent(lower(p_language))
    ))
    AND (p_is_native IS NULL OR ip.is_native = p_is_native)
    AND (p_can_evaluate IS NULL OR ip.can_evaluate = p_can_evaluate)
    AND (p_eval_type IS NULL OR ip.eval_types @> ARRAY[p_eval_type])
  INTO v_result;

  RETURN v_result;
END;
$$;

-- =============================================
-- Patch: chat_get_available_languages (unaccent)
-- =============================================
CREATE OR REPLACE FUNCTION public.chat_get_available_languages(
  p_can_evaluate BOOLEAN DEFAULT NULL
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
  IF NOT public.has_permission('instructors.view') THEN
    RETURN json_build_object('error', 'Sin permiso para ver perfiles de instructores');
  END IF;

  SELECT json_build_object(
    'filter', json_build_object('can_evaluate', p_can_evaluate),
    'total_languages', COUNT(DISTINCT extensions.unaccent(lower(lang))),
    'languages', COALESCE(
      json_agg(
        json_build_object(
          'language', lang,
          'instructor_count', cnt
        ) ORDER BY cnt DESC, lang ASC
      ),
      '[]'::JSON
    )
  )
  FROM (
    SELECT
      trim(l) AS lang,
      COUNT(DISTINCT ip.id) AS cnt
    FROM public.instructor_profiles ip,
         unnest(ip.languages) AS l
    WHERE ip.languages IS NOT NULL
      AND array_length(ip.languages, 1) > 0
      AND (p_can_evaluate IS NULL OR ip.can_evaluate = p_can_evaluate)
    GROUP BY trim(l)
  ) sub
  INTO v_result;

  RETURN v_result;
END;
$$;
