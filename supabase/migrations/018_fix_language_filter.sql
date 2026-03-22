-- =============================================
-- Migration 018: fix language filter in chat_find_instructors
-- =============================================
-- Replaces extensions.unaccent() with simple lower() comparison.
-- The DB stores languages in English ("Portuguese", "German", etc.) so
-- case-insensitive exact match is sufficient — no accent normalization needed.
-- chat_get_evaluators_list already uses this pattern successfully.
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
      WHERE lower(l) = lower(p_language)
    ))
    AND (p_is_native IS NULL OR ip.is_native = p_is_native)
    AND (p_can_evaluate IS NULL OR ip.can_evaluate = p_can_evaluate)
    AND (p_eval_type IS NULL OR ip.eval_types @> ARRAY[p_eval_type])
  INTO v_result;

  RETURN v_result;
END;
$$;
