-- =============================================
-- Migration 009: Add language filter to chat_find_evaluators
-- =============================================
-- Adds p_language parameter to filter evaluators by language they can evaluate in.
-- Uses existing instructor_profiles.languages[] column (TEXT[]).
-- Also includes languages[] in the returned evaluator objects.
-- Language comparison is case-insensitive (stored values may be lowercase).

CREATE OR REPLACE FUNCTION public.chat_find_evaluators(
  p_date       TEXT,
  p_start_time TEXT,
  p_end_time   TEXT,
  p_eval_type  TEXT DEFAULT NULL,  -- 'corporativo' | 'consumer_adult' | 'demo_adult' | 'consumer_kids' | 'demo_kids'
  p_language   TEXT DEFAULT NULL   -- e.g. 'English', 'Spanish'
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
         -- Optional filter by evaluation type
         AND (p_eval_type IS NULL OR ip.eval_types @> ARRAY[p_eval_type])
         -- Optional filter by language (case-insensitive — stored values may be lowercase)
         AND (p_language IS NULL OR EXISTS (
           SELECT 1 FROM unnest(ip.languages) AS l WHERE lower(l) = lower(p_language)
         ))
         -- Condition 2: has availability window fully covering the slot on this day
         AND EXISTS (
           SELECT 1
           FROM public.instructor_availability ia
           WHERE ia.profile_id  = ip.id
             AND ia.day_of_week = v_dow
             AND ia.start_time <= p_start_time
             AND ia.end_time   >= p_end_time
         )
         -- Condition 3: no schedule conflict on this specific date
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

GRANT EXECUTE ON FUNCTION public.chat_find_evaluators(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;


-- =============================================
-- chat_get_evaluators_list
-- =============================================
-- Returns all evaluators (can_evaluate = true), optionally filtered by
-- eval_type and/or language. No date/time required.

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
    -- Case-insensitive language filter
    AND (p_language IS NULL OR EXISTS (
      SELECT 1 FROM unnest(ip.languages) AS l WHERE lower(l) = lower(p_language)
    ))
  INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.chat_get_evaluators_list(TEXT, TEXT) TO authenticated;
