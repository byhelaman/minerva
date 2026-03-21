-- ============================================
-- Minerva v2 — 004: Pool Rules
-- ============================================
-- Pool rules for instructor assignment validation.
-- Includes refactor: program_name (was program_query), pool_rule_day_overrides
-- (replaces allowed_instructors_by_day JSONB + days_of_week SMALLINT[]).
-- Consolidates: 017_pools_consolidated, 018_pool_rules_branch_required,
--               019_rename_pool_notes, 020_unprotect_moderator_role,
--               021_pool_rotation_limit + refactor
-- Depends on: 001_foundation.sql

-- =============================================
-- 1. RBAC: coordinator role + pool permissions
-- =============================================
INSERT INTO public.roles (name, description, hierarchy_level)
VALUES ('coordinator', 'Manage pool rules and schedule validations', 55)
ON CONFLICT (name) DO UPDATE
SET description = EXCLUDED.description,
    hierarchy_level = EXCLUDED.hierarchy_level;

INSERT INTO public.permissions (name, description, min_role_level) VALUES
    ('pools.manage', 'Create, update and delete own pool rules', 50),
    ('pools.view',   'View pool rules from all coordinators',    80)
ON CONFLICT (name) DO UPDATE
SET description = EXCLUDED.description,
    min_role_level = EXCLUDED.min_role_level;

INSERT INTO public.role_permissions (role, permission) VALUES
    ('coordinator', 'schedules.read'),
    ('coordinator', 'pools.manage'),
    ('coordinator', 'pools.view'),
    ('admin',       'pools.manage'),
    ('admin',       'pools.view'),
    ('super_admin', 'pools.manage'),
    ('super_admin', 'pools.view')
ON CONFLICT (role, permission) DO NOTHING;

-- =============================================
-- 2. TABLE: pool_rules
-- =============================================
-- program_name: was program_query in older migrations.
-- days_of_week and allowed_instructors_by_day were removed in this refactor.
-- Use pool_rule_day_overrides for per-day instructor + schedule overrides.

CREATE TABLE IF NOT EXISTS public.pool_rules (
    id                  UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id            UUID     NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    branch              TEXT     NOT NULL DEFAULT 'UNASSIGNED',
    program_name        TEXT     NOT NULL,
    allowed_instructors TEXT[]   NOT NULL DEFAULT '{}',
    blocked_instructors TEXT[]   NOT NULL DEFAULT '{}',
    hard_lock           BOOLEAN  NOT NULL DEFAULT false,
    is_active           BOOLEAN  NOT NULL DEFAULT true,
    has_rotation_limit  BOOLEAN  NOT NULL DEFAULT false,
    comments            TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pool_rules_branch_not_blank CHECK (NULLIF(TRIM(branch), '') IS NOT NULL),
    CONSTRAINT pool_rules_program_not_empty CHECK (TRIM(program_name) <> '')
);

-- Unique rule per owner + program (case-insensitive, trimmed)
CREATE UNIQUE INDEX IF NOT EXISTS uq_pool_rules_owner_program_norm
    ON public.pool_rules (owner_id, lower(trim(program_name)));

CREATE INDEX IF NOT EXISTS idx_pool_rules_owner_id ON public.pool_rules(owner_id);
CREATE INDEX IF NOT EXISTS idx_pool_rules_is_active ON public.pool_rules(is_active);
CREATE INDEX IF NOT EXISTS idx_pool_rules_owner_updated ON public.pool_rules(owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_pool_rules_owner_active ON public.pool_rules(owner_id)
    WHERE is_active = true;

CREATE TRIGGER update_pool_rules_modtime
    BEFORE UPDATE ON public.pool_rules
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.pool_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pool_rules_select" ON public.pool_rules
    FOR SELECT TO authenticated
    USING (
        owner_id = (SELECT auth.uid())
        OR public.has_permission('pools.view')
    );

CREATE POLICY "pool_rules_insert" ON public.pool_rules
    FOR INSERT TO authenticated
    WITH CHECK (
        owner_id = (SELECT auth.uid())
        AND public.has_permission('pools.manage')
    );

CREATE POLICY "pool_rules_update" ON public.pool_rules
    FOR UPDATE TO authenticated
    USING (
        owner_id = (SELECT auth.uid())
        AND public.has_permission('pools.manage')
    )
    WITH CHECK (
        owner_id = (SELECT auth.uid())
        AND public.has_permission('pools.manage')
    );

CREATE POLICY "pool_rules_delete" ON public.pool_rules
    FOR DELETE TO authenticated
    USING (
        owner_id = (SELECT auth.uid())
        AND public.has_permission('pools.manage')
    );

-- =============================================
-- 3. TABLE: pool_rule_day_overrides
-- =============================================
-- Per-day instructor pool overrides with optional schedule window.
-- Multiple rows per (rule_id, day_of_week) allowed (split shifts).
-- start_time and end_time are required — they define when the rule applies.
-- day_of_week: 1=Monday ... 7=Sunday (ISO weekday).

CREATE TABLE IF NOT EXISTS public.pool_rule_day_overrides (
    id                  UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id             UUID     NOT NULL REFERENCES public.pool_rules(id) ON DELETE CASCADE,
    day_of_week         SMALLINT NOT NULL,
    start_time          TEXT     NOT NULL,
    end_time            TEXT     NOT NULL,
    allowed_instructors TEXT[]   NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pool_rule_day_overrides_dow_range  CHECK (day_of_week BETWEEN 1 AND 7),
    CONSTRAINT pool_rule_day_overrides_start_fmt  CHECK (start_time ~ '^\d{2}:\d{2}$'),
    CONSTRAINT pool_rule_day_overrides_end_fmt    CHECK (end_time   ~ '^\d{2}:\d{2}$'),
    CONSTRAINT pool_rule_day_overrides_time_order CHECK (start_time < end_time)
);

COMMENT ON TABLE public.pool_rule_day_overrides IS
    'Per-day schedule windows with instructor overrides. Multiple rows per day allowed (split shifts).';
COMMENT ON COLUMN public.pool_rule_day_overrides.start_time IS
    'Window start (HH:MM). Required — defines when this override applies.';
COMMENT ON COLUMN public.pool_rule_day_overrides.end_time IS
    'Window end (HH:MM). Required — must be > start_time.';

CREATE INDEX IF NOT EXISTS idx_pool_rule_day_overrides_rule_dow
    ON public.pool_rule_day_overrides (rule_id, day_of_week);

ALTER TABLE public.pool_rule_day_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pool_rule_day_overrides_select" ON public.pool_rule_day_overrides
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.pool_rules pr
            WHERE pr.id = rule_id
              AND (pr.owner_id = (SELECT auth.uid()) OR public.has_permission('pools.view'))
        )
    );

CREATE POLICY "pool_rule_day_overrides_insert" ON public.pool_rule_day_overrides
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.pool_rules pr
            WHERE pr.id = rule_id
              AND pr.owner_id = (SELECT auth.uid())
              AND public.has_permission('pools.manage')
        )
    );

CREATE POLICY "pool_rule_day_overrides_update" ON public.pool_rule_day_overrides
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.pool_rules pr
            WHERE pr.id = rule_id
              AND pr.owner_id = (SELECT auth.uid())
              AND public.has_permission('pools.manage')
        )
    );

CREATE POLICY "pool_rule_day_overrides_delete" ON public.pool_rule_day_overrides
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.pool_rules pr
            WHERE pr.id = rule_id
              AND pr.owner_id = (SELECT auth.uid())
              AND public.has_permission('pools.manage')
        )
    );

-- =============================================
-- 4. RPC: get_my_pool_rules
-- =============================================
-- Returns caller's pool rules including day_overrides as JSON array.

CREATE OR REPLACE FUNCTION public.get_my_pool_rules()
RETURNS TABLE (
    id UUID,
    owner_id UUID,
    branch TEXT,
    program_name TEXT,
    allowed_instructors TEXT[],
    blocked_instructors TEXT[],
    hard_lock BOOLEAN,
    is_active BOOLEAN,
    has_rotation_limit BOOLEAN,
    comments TEXT,
    day_overrides JSON,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT
        pr.id,
        pr.owner_id,
        pr.branch,
        pr.program_name,
        pr.allowed_instructors,
        pr.blocked_instructors,
        pr.hard_lock,
        pr.is_active,
        pr.has_rotation_limit,
        pr.comments,
        COALESCE(
            (SELECT json_agg(
                json_build_object(
                    'id',                   o.id,
                    'day_of_week',          o.day_of_week,
                    'start_time',           o.start_time,
                    'end_time',             o.end_time,
                    'allowed_instructors',  o.allowed_instructors
                ) ORDER BY o.day_of_week, o.start_time
             )
             FROM public.pool_rule_day_overrides o WHERE o.rule_id = pr.id),
            '[]'::json
        ) AS day_overrides,
        pr.created_at,
        pr.updated_at
    FROM public.pool_rules pr
    WHERE pr.owner_id = (SELECT auth.uid())
    ORDER BY pr.updated_at DESC;
$$;

-- =============================================
-- 5. RPC: create_pool_rule
-- =============================================
-- p_day_overrides format: [{"day_of_week":1,"start_time":"08:00","end_time":"12:00","allowed_instructors":["Alice"]}]

CREATE OR REPLACE FUNCTION public.create_pool_rule(
    p_branch TEXT,
    p_program_name TEXT,
    p_allowed_instructors TEXT[] DEFAULT '{}',
    p_blocked_instructors TEXT[] DEFAULT '{}',
    p_hard_lock BOOLEAN DEFAULT false,
    p_is_active BOOLEAN DEFAULT true,
    p_has_rotation_limit BOOLEAN DEFAULT false,
    p_comments TEXT DEFAULT NULL,
    p_day_overrides JSONB DEFAULT '[]'::jsonb
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    new_id UUID;
BEGIN
    IF NOT public.has_permission('pools.manage') THEN
        RAISE EXCEPTION 'Permission denied: requires pools.manage permission';
    END IF;

    INSERT INTO public.pool_rules (
        owner_id, branch, program_name,
        allowed_instructors, blocked_instructors,
        hard_lock, is_active, has_rotation_limit, comments
    )
    VALUES (
        (SELECT auth.uid()),
        NULLIF(TRIM(p_branch), ''),
        p_program_name,
        COALESCE(p_allowed_instructors, '{}'),
        COALESCE(p_blocked_instructors, '{}'),
        COALESCE(p_hard_lock, false),
        COALESCE(p_is_active, true),
        COALESCE(p_has_rotation_limit, false),
        p_comments
    )
    RETURNING id INTO new_id;

    -- Insert day overrides
    INSERT INTO public.pool_rule_day_overrides (rule_id, day_of_week, start_time, end_time, allowed_instructors)
    SELECT
        new_id,
        (el->>'day_of_week')::SMALLINT,
        el->>'start_time',
        el->>'end_time',
        ARRAY(SELECT jsonb_array_elements_text(el->'allowed_instructors'))
    FROM jsonb_array_elements(COALESCE(p_day_overrides, '[]'::jsonb)) AS el;

    RETURN json_build_object('success', true, 'id', new_id);
END;
$$;

-- =============================================
-- 6. RPC: update_my_pool_rule
-- =============================================

CREATE OR REPLACE FUNCTION public.update_my_pool_rule(
    p_id UUID,
    p_branch TEXT,
    p_program_name TEXT,
    p_allowed_instructors TEXT[] DEFAULT '{}',
    p_blocked_instructors TEXT[] DEFAULT '{}',
    p_hard_lock BOOLEAN DEFAULT false,
    p_is_active BOOLEAN DEFAULT true,
    p_has_rotation_limit BOOLEAN DEFAULT false,
    p_comments TEXT DEFAULT NULL,
    p_day_overrides JSONB DEFAULT '[]'::jsonb
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.has_permission('pools.manage') THEN
        RAISE EXCEPTION 'Permission denied: requires pools.manage permission';
    END IF;

    UPDATE public.pool_rules
    SET
        branch = NULLIF(TRIM(p_branch), ''),
        program_name = p_program_name,
        allowed_instructors = COALESCE(p_allowed_instructors, '{}'),
        blocked_instructors = COALESCE(p_blocked_instructors, '{}'),
        hard_lock = COALESCE(p_hard_lock, false),
        is_active = COALESCE(p_is_active, true),
        has_rotation_limit = COALESCE(p_has_rotation_limit, false),
        comments = p_comments
    WHERE id = p_id
      AND owner_id = (SELECT auth.uid());

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pool rule not found or not owned by caller';
    END IF;

    -- Replace day overrides: delete existing, insert new
    DELETE FROM public.pool_rule_day_overrides WHERE rule_id = p_id;

    INSERT INTO public.pool_rule_day_overrides (rule_id, day_of_week, start_time, end_time, allowed_instructors)
    SELECT
        p_id,
        (el->>'day_of_week')::SMALLINT,
        el->>'start_time',
        el->>'end_time',
        ARRAY(SELECT jsonb_array_elements_text(el->'allowed_instructors'))
    FROM jsonb_array_elements(COALESCE(p_day_overrides, '[]'::jsonb)) AS el;

    RETURN json_build_object('success', true, 'id', p_id);
END;
$$;

-- =============================================
-- 7. RPC: delete_my_pool_rule
-- =============================================

CREATE OR REPLACE FUNCTION public.delete_my_pool_rule(p_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.has_permission('pools.manage') THEN
        RAISE EXCEPTION 'Permission denied: requires pools.manage permission';
    END IF;

    DELETE FROM public.pool_rules
    WHERE id = p_id AND owner_id = (SELECT auth.uid());

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pool rule not found or not owned by caller';
    END IF;

    RETURN json_build_object('success', true, 'id', p_id);
END;
$$;

-- =============================================
-- 8. GRANTS
-- =============================================
REVOKE ALL ON FUNCTION public.get_my_pool_rules() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_pool_rule(TEXT, TEXT, TEXT[], TEXT[], BOOLEAN, BOOLEAN, BOOLEAN, TEXT, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_my_pool_rule(UUID, TEXT, TEXT, TEXT[], TEXT[], BOOLEAN, BOOLEAN, BOOLEAN, TEXT, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_my_pool_rule(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_my_pool_rules() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_pool_rule(TEXT, TEXT, TEXT[], TEXT[], BOOLEAN, BOOLEAN, BOOLEAN, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_my_pool_rule(UUID, TEXT, TEXT, TEXT[], TEXT[], BOOLEAN, BOOLEAN, BOOLEAN, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_my_pool_rule(UUID) TO authenticated;
