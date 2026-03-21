-- =============================================
-- Migration 014: chat_get_available_languages RPC
-- =============================================
-- Returns all distinct languages in instructor_profiles with instructor count per language.
-- Used by the chat assistant to answer "what languages do we have?" queries with real data.

CREATE OR REPLACE FUNCTION public.chat_get_available_languages(
  p_can_evaluate BOOLEAN DEFAULT NULL  -- true = only evaluators, false = only non-evaluators, null = all
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
    'total_languages', COUNT(DISTINCT lang),
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

GRANT EXECUTE ON FUNCTION public.chat_get_available_languages(BOOLEAN) TO authenticated;
