-- ============================================
-- Minerva v2 — 023: Instructor Profiles
-- ============================================
-- Two tables: instructor_profiles + instructor_availability.
-- Two chat RPCs: chat_get_instructor_profile, chat_find_evaluators.
--
-- instructor_profiles.code = schedule_entries.code (exact join key).
-- Fuzzy name matching used only for lookups, NOT for conflict checks.
--
-- Depends on: 001_core_access.sql, 022_chat_rag_functions.sql (pg_trgm ya activo)

-- =============================================
-- 1. TABLE: instructor_profiles
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
  -- Valid eval_types values: 'corporativo', 'consumer_adult', 'demo_adult',
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
    ((SELECT auth.jwt()) -> 'permissions')::jsonb ? 'schedules.read'
    OR ((SELECT auth.jwt()) -> 'permissions')::jsonb ? 'schedules.manage'
  );

CREATE POLICY "instructor_profiles_insert" ON public.instructor_profiles
  FOR INSERT TO authenticated
  WITH CHECK (((SELECT auth.jwt()) -> 'permissions')::jsonb ? 'schedules.manage');

CREATE POLICY "instructor_profiles_update" ON public.instructor_profiles
  FOR UPDATE TO authenticated
  USING (((SELECT auth.jwt()) -> 'permissions')::jsonb ? 'schedules.manage');

CREATE POLICY "instructor_profiles_delete" ON public.instructor_profiles
  FOR DELETE TO authenticated
  USING (((SELECT auth.jwt()) -> 'permissions')::jsonb ? 'schedules.manage');

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
    ((SELECT auth.jwt()) -> 'permissions')::jsonb ? 'schedules.read'
    OR ((SELECT auth.jwt()) -> 'permissions')::jsonb ? 'schedules.manage'
  );

CREATE POLICY "instructor_availability_insert" ON public.instructor_availability
  FOR INSERT TO authenticated
  WITH CHECK (((SELECT auth.jwt()) -> 'permissions')::jsonb ? 'schedules.manage');

CREATE POLICY "instructor_availability_update" ON public.instructor_availability
  FOR UPDATE TO authenticated
  USING (((SELECT auth.jwt()) -> 'permissions')::jsonb ? 'schedules.manage');

CREATE POLICY "instructor_availability_delete" ON public.instructor_availability
  FOR DELETE TO authenticated
  USING (((SELECT auth.jwt()) -> 'permissions')::jsonb ? 'schedules.manage');

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
  IF NOT public.has_permission('schedules.read') THEN
    RETURN json_build_object('error', 'Sin permiso para ver horarios');
  END IF;

  -- Pick the single best-matching profile (UNIQUE on code → one canonical profile per instructor)
  SELECT id, code, name, is_native, languages, email,
         can_evaluate, eval_types, notes
  INTO v_profile
  FROM public.instructor_profiles
  WHERE public.similarity(LOWER(name), LOWER(p_name)) >= p_threshold
  ORDER BY public.similarity(LOWER(name), LOWER(p_name)) DESC
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
--   1. can_evaluate = true (+ optional eval_type filter via array containment)
--   2. Weekly availability window covers the full slot on that day of week
--   3. No conflicting entry in schedule_entries on that date (join by code — exact)
--
-- NOTE: end_time >= p_end_time means the window fully contains the slot.
-- Conflict check uses se.code = ip.code (exact), not fuzzy name match.

CREATE OR REPLACE FUNCTION public.chat_find_evaluators(
  p_date       TEXT,
  p_start_time TEXT,
  p_end_time   TEXT,
  p_eval_type  TEXT DEFAULT NULL  -- optional: 'corporativo' | 'consumer_adult' | 'demo_adult' | 'consumer_kids' | 'demo_kids'
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
  IF NOT public.has_permission('schedules.read') THEN
    RETURN json_build_object('error', 'Sin permiso para ver horarios');
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
    'evaluators', COALESCE(
      (SELECT json_agg(
         json_build_object(
           'name',       ip.name,
           'code',       ip.code,
           'eval_types', ip.eval_types,
           'notes',      ip.notes
         ) ORDER BY ip.name
       )
       FROM public.instructor_profiles ip
       WHERE ip.can_evaluate = true
         -- Optional filter by evaluation type (array containment)
         AND (p_eval_type IS NULL OR ip.eval_types @> ARRAY[p_eval_type])
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

GRANT EXECUTE ON FUNCTION public.chat_find_evaluators(TEXT, TEXT, TEXT, TEXT) TO authenticated;
