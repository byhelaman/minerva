-- ============================================
-- Minerva v2 — 006: Instructor Profiles
-- ============================================
-- Two tables: instructor_profiles + instructor_availability.
-- Two chat RPCs: chat_get_instructor_profile, chat_find_evaluators.
--
-- instructor_profiles.code = schedule_entries.code (exact join key).
-- Fuzzy name matching used only for lookups, NOT for conflict checks.
--
-- Consolidates: 023_instructor_profiles
-- Depends on: 001_foundation.sql, 005_chat.sql (pg_trgm already enabled)

-- =============================================
-- 1. RBAC: instructor permissions
-- =============================================
INSERT INTO public.permissions (name, description, min_role_level) VALUES
    ('instructors.view',   'View instructor profiles and availability',          55),
    ('instructors.manage', 'Create, update and delete instructor profiles',      55)
ON CONFLICT (name) DO UPDATE
SET description = EXCLUDED.description,
    min_role_level = EXCLUDED.min_role_level;

INSERT INTO public.role_permissions (role, permission) VALUES
    ('coordinator', 'instructors.view'),
    ('coordinator', 'instructors.manage'),
    ('moderator',   'instructors.view'),
    ('admin',       'instructors.view'),
    ('admin',       'instructors.manage')
    -- super_admin: auto via custom_access_token_hook (all permissions)
ON CONFLICT (role, permission) DO NOTHING;

-- =============================================
-- 2. TABLE: instructor_profiles
-- =============================================
-- One row per instructor. code is the unique key linking to schedule_entries.

CREATE TABLE IF NOT EXISTS public.instructor_profiles (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  code         TEXT    NOT NULL,
  name         TEXT    NOT NULL,
  is_native    BOOLEAN NOT NULL DEFAULT false,
  languages    TEXT[]  NOT NULL DEFAULT '{}',
  email        TEXT,
  can_evaluate BOOLEAN NOT NULL DEFAULT false,
  eval_types   TEXT[]  NOT NULL DEFAULT '{}',
  -- Valid eval_types values: 'corporate', 'consumer_adult', 'demo_adult',
  -- 'consumer_kids', 'demo_kids'. Extensible — no CHECK constraint on array contents.
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT instructor_profiles_code_unique   UNIQUE (code),
  CONSTRAINT instructor_profiles_code_notempty CHECK (code <> ''),
  CONSTRAINT instructor_profiles_name_notempty CHECK (name <> '')
);

COMMENT ON TABLE public.instructor_profiles IS
  'One row per instructor. code links to schedule_entries.code.';
COMMENT ON COLUMN public.instructor_profiles.code IS
  'Unique instructor code — must match schedule_entries.code exactly.';
COMMENT ON COLUMN public.instructor_profiles.eval_types IS
  'Evaluation types this instructor can conduct: corporativo, consumer_adult, demo_adult, consumer_kids, demo_kids.';

ALTER TABLE public.instructor_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "instructor_profiles_select" ON public.instructor_profiles
  FOR SELECT TO authenticated
  USING (
    ((SELECT auth.jwt()) -> 'permissions')::jsonb ? 'instructors.view'
    OR ((SELECT auth.jwt()) -> 'permissions')::jsonb ? 'instructors.manage'
  );

CREATE POLICY "instructor_profiles_insert" ON public.instructor_profiles
  FOR INSERT TO authenticated
  WITH CHECK (((SELECT auth.jwt()) -> 'permissions')::jsonb ? 'instructors.manage');

CREATE POLICY "instructor_profiles_update" ON public.instructor_profiles
  FOR UPDATE TO authenticated
  USING (((SELECT auth.jwt()) -> 'permissions')::jsonb ? 'instructors.manage');

CREATE POLICY "instructor_profiles_delete" ON public.instructor_profiles
  FOR DELETE TO authenticated
  USING (((SELECT auth.jwt()) -> 'permissions')::jsonb ? 'instructors.manage');

-- Trigram index for fuzzy name search (chat lookups)
CREATE INDEX IF NOT EXISTS idx_instructor_profiles_name_trgm
  ON public.instructor_profiles USING GIN (LOWER(name) gin_trgm_ops);

-- Partial index to quickly scan evaluators
CREATE INDEX IF NOT EXISTS idx_instructor_profiles_can_evaluate
  ON public.instructor_profiles (can_evaluate) WHERE can_evaluate = true;

CREATE TRIGGER update_instructor_profiles_modtime
  BEFORE UPDATE ON public.instructor_profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- =============================================
-- 2. TABLE: instructor_availability
-- =============================================
-- Weekly recurring time windows per instructor.
-- Multiple rows per instructor/day allowed (e.g. split shifts).
-- day_of_week: 1=Monday ... 7=Sunday (ISO weekday).

CREATE TABLE IF NOT EXISTS public.instructor_availability (
  id           UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   UUID     NOT NULL
               REFERENCES public.instructor_profiles(id) ON DELETE CASCADE,
  day_of_week  SMALLINT NOT NULL,
  start_time   TEXT     NOT NULL,
  end_time     TEXT     NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT instructor_availability_dow_range  CHECK (day_of_week BETWEEN 1 AND 7),
  CONSTRAINT instructor_availability_start_fmt  CHECK (start_time ~ '^\d{2}:\d{2}$'),
  CONSTRAINT instructor_availability_end_fmt    CHECK (end_time   ~ '^\d{2}:\d{2}$'),
  CONSTRAINT instructor_availability_time_order CHECK (start_time < end_time)
);

COMMENT ON TABLE public.instructor_availability IS
  'Weekly recurring availability windows (day_of_week 1=Mon..7=Sun). Multiple rows per day allowed.';

ALTER TABLE public.instructor_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "instructor_availability_select" ON public.instructor_availability
  FOR SELECT TO authenticated
  USING (
    ((SELECT auth.jwt()) -> 'permissions')::jsonb ? 'instructors.view'
    OR ((SELECT auth.jwt()) -> 'permissions')::jsonb ? 'instructors.manage'
  );

CREATE POLICY "instructor_availability_insert" ON public.instructor_availability
  FOR INSERT TO authenticated
  WITH CHECK (((SELECT auth.jwt()) -> 'permissions')::jsonb ? 'instructors.manage');

CREATE POLICY "instructor_availability_update" ON public.instructor_availability
  FOR UPDATE TO authenticated
  USING (((SELECT auth.jwt()) -> 'permissions')::jsonb ? 'instructors.manage');

CREATE POLICY "instructor_availability_delete" ON public.instructor_availability
  FOR DELETE TO authenticated
  USING (((SELECT auth.jwt()) -> 'permissions')::jsonb ? 'instructors.manage');

-- Composite index: profile + day is always in the WHERE clause
CREATE INDEX IF NOT EXISTS idx_instructor_availability_profile_dow
  ON public.instructor_availability (profile_id, day_of_week);


-- =============================================
-- 3. RPC: chat_get_instructor_profile
-- =============================================
-- Fuzzy match by name → returns full profile + weekly availability windows.

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

  -- Pick the single best-matching profile (UNIQUE on code → one canonical profile per instructor)
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

GRANT EXECUTE ON FUNCTION public.chat_get_instructor_profile(TEXT, FLOAT) TO authenticated;


-- =============================================
-- 4. RPC: chat_find_evaluators
-- =============================================
-- Returns evaluators available for a specific date + time window.
-- Three conditions:
--   1. can_evaluate = true (+ optional eval_type and language filters)
--   2. Weekly availability window covers the full slot on that day of week
--   3. No conflicting entry in schedule_entries on that date (join by code — exact)
--
-- Language filter is case-insensitive (stored values may be lowercase).
-- NOTE: end_time >= p_end_time means the window fully contains the slot.
-- Conflict check uses se.code = ip.code (exact), not fuzzy name match.

CREATE OR REPLACE FUNCTION public.chat_find_evaluators(
  p_date       TEXT,
  p_start_time TEXT,
  p_end_time   TEXT,
  p_eval_type  TEXT DEFAULT NULL,  -- 'corporativo' | 'consumer_adult' | 'demo_adult' | 'consumer_kids' | 'demo_kids'
  p_language   TEXT DEFAULT NULL   -- e.g. 'English', 'Spanish' (case-insensitive)
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
         -- Optional filter by language (case-insensitive)
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
         -- Condition 3: no schedule conflict on this specific date (exact code join)
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
-- 5. RPC: chat_get_evaluators_list
-- =============================================
-- Returns all evaluators (can_evaluate = true), optionally filtered by
-- eval_type and/or language. No date/time required.
-- Language filter is case-insensitive.

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
      SELECT 1 FROM unnest(ip.languages) AS l WHERE lower(l) = lower(p_language)
    ))
  INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.chat_get_evaluators_list(TEXT, TEXT) TO authenticated;


-- =============================================
-- 6. RPC: chat_get_available_languages
-- =============================================
-- Returns distinct languages from instructor_profiles with instructor count.
-- Optionally filtered by can_evaluate flag.

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
    'total_languages', COUNT(DISTINCT lower(lang)),
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


-- =============================================
-- 7. RPC: chat_find_evaluator_slots
-- =============================================
-- For each day in [p_start_date, p_start_date + p_days_ahead - 1], returns
-- evaluators who have a registered weekly availability window on that day_of_week,
-- along with any schedule conflicts on the specific date.
-- The model uses this data to compute free windows and suggest available slots.

CREATE OR REPLACE FUNCTION public.chat_find_evaluator_slots(
  p_start_date TEXT,
  p_days_ahead INT     DEFAULT 5,
  p_eval_type  TEXT    DEFAULT NULL,
  p_language   TEXT    DEFAULT NULL
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

  BEGIN
    PERFORM p_start_date::DATE;
  EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('error', 'Formato de fecha inválido (usa YYYY-MM-DD)');
  END;

  SELECT json_build_object(
    'start_date', p_start_date,
    'days_ahead', p_days_ahead,
    'eval_type',  p_eval_type,
    'language',   p_language,
    'days', COALESCE(
      (SELECT json_agg(day_data ORDER BY day_date)
       FROM (
         SELECT
           d::TEXT AS day_date,
           EXTRACT(ISODOW FROM d)::SMALLINT AS day_of_week,
           (SELECT json_agg(
               json_build_object(
                 'evaluator',    ip.name,
                 'code',         ip.code,
                 'availability', (
                   SELECT json_agg(
                     json_build_object('start', ia.start_time, 'end', ia.end_time)
                     ORDER BY ia.start_time
                   )
                   FROM public.instructor_availability ia
                   WHERE ia.profile_id = ip.id
                     AND ia.day_of_week = EXTRACT(ISODOW FROM d)::SMALLINT
                 ),
                 'conflicts', COALESCE(
                   (SELECT json_agg(
                     json_build_object('start', se.start_time, 'end', se.end_time)
                     ORDER BY se.start_time
                   )
                   FROM public.schedule_entries se
                   WHERE se.date      = d::TEXT
                     AND se.code      = ip.code
                     AND se.end_time <> ''
                   ),
                   '[]'::JSON
                 )
               ) ORDER BY ip.name
             )
           FROM public.instructor_profiles ip
           WHERE ip.can_evaluate = true
             AND (p_eval_type IS NULL OR ip.eval_types @> ARRAY[p_eval_type])
             AND (p_language IS NULL OR EXISTS (
               SELECT 1 FROM unnest(ip.languages) AS l WHERE lower(l) = lower(p_language)
             ))
             AND EXISTS (
               SELECT 1 FROM public.instructor_availability ia2
               WHERE ia2.profile_id  = ip.id
                 AND ia2.day_of_week = EXTRACT(ISODOW FROM d)::SMALLINT
             )
           ) AS evaluators
         FROM generate_series(
           p_start_date::DATE,
           p_start_date::DATE + (p_days_ahead - 1),
           '1 day'::INTERVAL
         ) AS d
       ) day_data
       WHERE evaluators IS NOT NULL
      ),
      '[]'::JSON
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.chat_find_evaluator_slots(TEXT, INT, TEXT, TEXT) TO authenticated;
