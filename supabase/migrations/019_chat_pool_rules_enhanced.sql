-- ============================================
-- Minerva v2 — 019: Enhanced Pool Rules Queries
-- ============================================
-- 1. Updated: chat_get_pool_rules
--    New params: p_instructor (filter/status by instructor name), p_hard_lock (strict pools only),
--    p_count_only (return totals without rule detail).
--    New field per rule: instructor_status ('allowed'|'blocked'|'not_in_pool') when p_instructor given.
--
-- 2. New RPC: chat_get_pool_candidates
--    Returns allowed instructors for a program+branch pool, and — if a date/time slot is given —
--    whether each candidate has no schedule conflict at that moment.
--
-- DB NOTE: pool_rules.unique index is (owner_id, program_name) — branch is NOT in the key.
--   A coordinator can only have one rule per program regardless of branch.
--   Different per-branch rules require different coordinator owners.
--   This is a known schema constraint.
--
-- Depends on: 004_pools.sql, 006_instructor_profiles.sql, 010_chat_pool_rules.sql

-- =============================================
-- 1. Updated RPC: chat_get_pool_rules
-- =============================================

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT oid::regprocedure AS sig
    FROM pg_proc
    WHERE proname = 'chat_get_pool_rules'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.chat_get_pool_rules(
  p_branch      TEXT     DEFAULT NULL,  -- partial LIKE match on branch
  p_program     TEXT     DEFAULT NULL,  -- partial LIKE match on program_name
  p_instructor  TEXT     DEFAULT NULL,  -- filter: only rules where instructor appears (allowed or blocked)
  p_hard_lock   BOOLEAN  DEFAULT NULL,  -- filter: true = strict only, false = non-strict only, null = all
  p_count_only  BOOLEAN  DEFAULT FALSE  -- true = return totals only, no rule detail
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_instructor_code TEXT;
  v_result          JSON;
BEGIN
  IF NOT public.has_permission('pools.view') THEN
    RETURN json_build_object('error', 'Sin permiso para ver reglas de pool');
  END IF;

  -- Resolve instructor name → code (exact match on instructor_profiles.code)
  IF p_instructor IS NOT NULL THEN
    SELECT ip.code INTO v_instructor_code
    FROM public.instructor_profiles ip
    WHERE extensions.word_similarity(LOWER(p_instructor), LOWER(ip.name)) >= 0.4
    ORDER BY extensions.word_similarity(LOWER(p_instructor), LOWER(ip.name)) DESC
    LIMIT 1;
  END IF;

  IF p_count_only THEN
    SELECT json_build_object(
      'branch',      p_branch,
      'program',     p_program,
      'instructor',  p_instructor,
      'hard_lock',   p_hard_lock,
      'total',       COUNT(*),
      'active',      COUNT(*) FILTER (WHERE pr.is_active = true),
      'strict',      COUNT(*) FILTER (WHERE pr.hard_lock = true),
      'with_rotation_limit', COUNT(*) FILTER (WHERE pr.has_rotation_limit = true)
    )
    FROM public.pool_rules pr
    WHERE pr.is_active = true
      AND (p_branch    IS NULL OR lower(pr.branch)        LIKE '%' || lower(p_branch)   || '%')
      AND (p_program   IS NULL OR lower(pr.program_name)  LIKE '%' || lower(p_program)  || '%')
      AND (p_hard_lock IS NULL OR pr.hard_lock = p_hard_lock)
      AND (
        v_instructor_code IS NULL
        OR v_instructor_code = ANY(pr.allowed_instructors)
        OR v_instructor_code = ANY(pr.blocked_instructors)
      )
    INTO v_result;
    RETURN v_result;
  END IF;

  SELECT json_build_object(
    'branch',      p_branch,
    'program',     p_program,
    'instructor',  p_instructor,
    'hard_lock',   p_hard_lock,
    'total',       COUNT(*),
    'rules', COALESCE(
      json_agg(
        json_build_object(
          'branch',             pr.branch,
          'program_name',       pr.program_name,
          'hard_lock',          pr.hard_lock,
          'has_rotation_limit', pr.has_rotation_limit,
          'comments',           pr.comments,
          -- instructor_status: only populated when p_instructor is given
          'instructor_status', CASE
            WHEN v_instructor_code IS NULL THEN NULL
            WHEN v_instructor_code = ANY(pr.allowed_instructors) THEN 'allowed'
            WHEN v_instructor_code = ANY(pr.blocked_instructors) THEN 'blocked'
            ELSE 'not_in_pool'
          END,
          'allowed_instructors', (
            SELECT COALESCE(json_agg(
              json_build_object('code', c, 'name', COALESCE(ip2.name, c))
              ORDER BY COALESCE(ip2.name, c)
            ), '[]'::JSON)
            FROM unnest(pr.allowed_instructors) AS c
            LEFT JOIN public.instructor_profiles ip2 ON ip2.code = c
          ),
          'blocked_instructors', (
            SELECT COALESCE(json_agg(
              json_build_object('code', c, 'name', COALESCE(ip3.name, c))
              ORDER BY COALESCE(ip3.name, c)
            ), '[]'::JSON)
            FROM unnest(pr.blocked_instructors) AS c
            LEFT JOIN public.instructor_profiles ip3 ON ip3.code = c
          ),
          'day_overrides', (
            SELECT COALESCE(json_agg(
              json_build_object(
                'day_of_week', pdo.day_of_week,
                'start_time',  pdo.start_time,
                'end_time',    pdo.end_time,
                'allowed_instructors', (
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
    AND (p_branch    IS NULL OR lower(pr.branch)        LIKE '%' || lower(p_branch)   || '%')
    AND (p_program   IS NULL OR lower(pr.program_name)  LIKE '%' || lower(p_program)  || '%')
    AND (p_hard_lock IS NULL OR pr.hard_lock = p_hard_lock)
    AND (
      v_instructor_code IS NULL
      OR v_instructor_code = ANY(pr.allowed_instructors)
      OR v_instructor_code = ANY(pr.blocked_instructors)
    )
  INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.chat_get_pool_rules TO authenticated;


-- =============================================
-- 2. New RPC: chat_get_pool_candidates
-- =============================================
-- Returns allowed instructors for a program pool.
-- If p_date + p_start_time + p_end_time are provided, also checks schedule conflicts.

CREATE OR REPLACE FUNCTION public.chat_get_pool_candidates(
  p_program    TEXT,
  p_branch     TEXT  DEFAULT NULL,
  p_date       TEXT  DEFAULT NULL,
  p_start_time TEXT  DEFAULT NULL,
  p_end_time   TEXT  DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rule_id           UUID;
  v_hard_lock         BOOLEAN;
  v_has_rotation      BOOLEAN;
  v_check_avail       BOOLEAN;
  v_result            JSON;
BEGIN
  IF NOT public.has_permission('pools.view') THEN
    RETURN json_build_object('error', 'Sin permiso para ver reglas de pool');
  END IF;

  v_check_avail := (p_date IS NOT NULL AND p_start_time IS NOT NULL AND p_end_time IS NOT NULL);

  -- Find the pool rule for this program (+ optional branch filter)
  SELECT pr.id, pr.hard_lock, pr.has_rotation_limit
  INTO v_rule_id, v_hard_lock, v_has_rotation
  FROM public.pool_rules pr
  WHERE pr.is_active = true
    AND lower(pr.program_name) LIKE '%' || lower(p_program) || '%'
    AND (p_branch IS NULL OR lower(pr.branch) LIKE '%' || lower(p_branch) || '%')
  ORDER BY
    -- Prefer branch match if given
    CASE WHEN p_branch IS NOT NULL AND lower(pr.branch) LIKE '%' || lower(p_branch) || '%' THEN 0 ELSE 1 END,
    pr.updated_at DESC
  LIMIT 1;

  IF v_rule_id IS NULL THEN
    RETURN json_build_object(
      'program',    p_program,
      'branch',     p_branch,
      'pool_found', false,
      'note',       'No active pool rule found for this program.'
    );
  END IF;

  -- Build candidates list with optional availability check
  SELECT json_build_object(
    'program',         p_program,
    'branch',          p_branch,
    'pool_found',      true,
    'hard_lock',       v_hard_lock,
    'has_rotation_limit', v_has_rotation,
    'date',            p_date,
    'time_range',      CASE WHEN v_check_avail THEN p_start_time || '–' || p_end_time ELSE NULL END,
    'total_candidates', (
      SELECT COUNT(*) FROM unnest(pr.allowed_instructors) AS c
      LEFT JOIN public.instructor_profiles ip ON ip.code = c
    ),
    'available_count', CASE
      WHEN NOT v_check_avail THEN NULL
      ELSE (
        SELECT COUNT(*)
        FROM unnest(pr.allowed_instructors) AS c
        LEFT JOIN public.instructor_profiles ip ON ip.code = c
        WHERE NOT EXISTS (
          SELECT 1 FROM public.schedule_entries se
          WHERE se.date = p_date
            AND extensions.word_similarity(LOWER(COALESCE(ip.name, c)), LOWER(se.instructor)) >= 0.5
            AND se.end_time <> ''
            AND NOT (se.end_time <= p_start_time OR se.start_time >= p_end_time)
        )
      )
    END,
    'candidates', COALESCE(
      (SELECT json_agg(
        json_build_object(
          'code', c,
          'name', COALESCE(ip.name, c),
          'available', CASE
            WHEN NOT v_check_avail THEN NULL
            ELSE NOT EXISTS (
              SELECT 1 FROM public.schedule_entries se
              WHERE se.date = p_date
                AND extensions.word_similarity(LOWER(COALESCE(ip.name, c)), LOWER(se.instructor)) >= 0.5
                AND se.end_time <> ''
                AND NOT (se.end_time <= p_start_time OR se.start_time >= p_end_time)
            )
          END
        ) ORDER BY COALESCE(ip.name, c)
       )
       FROM unnest(pr.allowed_instructors) AS c
       LEFT JOIN public.instructor_profiles ip ON ip.code = c
      ),
      '[]'::JSON
    )
  )
  FROM public.pool_rules pr
  WHERE pr.id = v_rule_id
  INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.chat_get_pool_candidates TO authenticated;
