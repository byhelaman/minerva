-- =============================================
-- Migration 010: chat_get_pool_rules RPC
-- =============================================
-- Allows the chat RAG system to query pool rules.
-- Returns rules optionally filtered by branch and/or program (partial match).
-- Joins instructor_profiles to resolve codes → names where possible.

CREATE OR REPLACE FUNCTION public.chat_get_pool_rules(
  p_branch  TEXT DEFAULT NULL,  -- partial match on branch (case-insensitive)
  p_program TEXT DEFAULT NULL   -- partial match on program_name (case-insensitive)
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
  IF NOT public.has_permission('pools.view') THEN
    RETURN json_build_object('error', 'Sin permiso para ver reglas de pool');
  END IF;

  SELECT json_build_object(
    'branch',  p_branch,
    'program', p_program,
    'total',   COUNT(*),
    'rules', COALESCE(
      json_agg(
        json_build_object(
          'branch',               pr.branch,
          'program_name',         pr.program_name,
          'hard_lock',            pr.hard_lock,
          'has_rotation_limit',   pr.has_rotation_limit,
          'comments',             pr.comments,
          -- Resolve codes → names via instructor_profiles where available
          'allowed_instructors', (
            SELECT COALESCE(json_agg(
              json_build_object(
                'code', c,
                'name', COALESCE(ip2.name, c)
              ) ORDER BY COALESCE(ip2.name, c)
            ), '[]'::JSON)
            FROM unnest(pr.allowed_instructors) AS c
            LEFT JOIN public.instructor_profiles ip2 ON ip2.code = c
          ),
          'blocked_instructors', (
            SELECT COALESCE(json_agg(
              json_build_object(
                'code', c,
                'name', COALESCE(ip3.name, c)
              ) ORDER BY COALESCE(ip3.name, c)
            ), '[]'::JSON)
            FROM unnest(pr.blocked_instructors) AS c
            LEFT JOIN public.instructor_profiles ip3 ON ip3.code = c
          ),
          'day_overrides', (
            SELECT COALESCE(json_agg(
              json_build_object(
                'day_of_week',          pdo.day_of_week,
                'start_time',           pdo.start_time,
                'end_time',             pdo.end_time,
                'allowed_instructors',  (
                  SELECT COALESCE(json_agg(
                    json_build_object('code', c, 'name', COALESCE(ip4.name, c))
                  ), '[]'::JSON)
                  FROM unnest(pdo.allowed_instructors) AS c
                  LEFT JOIN public.instructor_profiles ip4 ON ip4.code = c
                )
              ) ORDER BY pdo.day_of_week, pdo.start_time
            ), '[]'::JSON)
            FROM public.pool_rule_day_overrides pdo
            WHERE pdo.rule_id = pr.id
          )
        ) ORDER BY pr.branch, pr.program_name
      ),
      '[]'::JSON
    )
  )
  FROM public.pool_rules pr
  WHERE pr.is_active = true
    AND (p_branch  IS NULL OR lower(pr.branch)       LIKE '%' || lower(p_branch)  || '%')
    AND (p_program IS NULL OR lower(pr.program_name) LIKE '%' || lower(p_program) || '%')
  INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.chat_get_pool_rules(TEXT, TEXT) TO authenticated;
