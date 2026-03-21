-- =============================================
-- Migration 011: chat_find_instructors RPC
-- =============================================
-- General instructor search across all instructor_profiles.
-- Filters by language (case-insensitive), is_native, can_evaluate, and/or eval_type.
-- Does NOT check schedule availability — use find_evaluators for that.

CREATE OR REPLACE FUNCTION public.chat_find_instructors(
  p_language     TEXT    DEFAULT NULL,  -- case-insensitive match against languages[]
  p_is_native    BOOLEAN DEFAULT NULL,  -- true = only native instructors, null = all
  p_can_evaluate BOOLEAN DEFAULT NULL,  -- true = only evaluators, false = only non-evaluators, null = all
  p_eval_type    TEXT    DEFAULT NULL   -- 'corporativo' | 'consumer_adult' | 'demo_adult' | 'consumer_kids' | 'demo_kids'
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
    -- Language filter: case-insensitive match against any element in languages[]
    (p_language IS NULL OR EXISTS (
      SELECT 1 FROM unnest(ip.languages) AS l WHERE lower(l) = lower(p_language)
    ))
    -- Native filter
    AND (p_is_native IS NULL OR ip.is_native = p_is_native)
    -- Evaluator filter
    AND (p_can_evaluate IS NULL OR ip.can_evaluate = p_can_evaluate)
    -- Eval type filter
    AND (p_eval_type IS NULL OR ip.eval_types @> ARRAY[p_eval_type])
  INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.chat_find_instructors(TEXT, BOOLEAN, BOOLEAN, TEXT) TO authenticated;
