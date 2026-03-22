-- =============================================
-- Migration 016: fix unaccent schema prefix
-- =============================================
-- Supabase recomienda extensiones en schema 'extensions', no 'public'.
-- Con SET search_path = '', unaccent() debe calificarse como public.unaccent().
-- Aplicar DESPUÉS de hacer clic en "Resolve" en Supabase Security Advisor.
-- Parchea todas las funciones que usan unaccent() introducidas en migration 015.

-- =============================================
-- Patch: chat_find_evaluators
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
           WHERE public.unaccent(lower(l)) = public.unaccent(lower(p_language))
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
-- Patch: chat_get_evaluators_list
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
      WHERE public.unaccent(lower(l)) = public.unaccent(lower(p_language))
    ))
  INTO v_result;

  RETURN v_result;
END;
$$;

-- =============================================
-- Patch: chat_find_instructors
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
      WHERE public.unaccent(lower(l)) = public.unaccent(lower(p_language))
    ))
    AND (p_is_native IS NULL OR ip.is_native = p_is_native)
    AND (p_can_evaluate IS NULL OR ip.can_evaluate = p_can_evaluate)
    AND (p_eval_type IS NULL OR ip.eval_types @> ARRAY[p_eval_type])
  INTO v_result;

  RETURN v_result;
END;
$$;

-- =============================================
-- Patch: chat_get_available_languages
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
    'total_languages', COUNT(DISTINCT public.unaccent(lower(lang))),
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
