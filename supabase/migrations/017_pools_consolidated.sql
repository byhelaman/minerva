-- ============================================
-- Minerva v2 — 017: Pools consolidated schema
-- ============================================
-- Consolidates Pools evolution from:
-- 010_pools_rules.sql
-- 012_pools_days_of_week.sql
-- 013_pool_positive_by_day.sql
-- 015_pool_rules_non_empty_instructors_by_day.sql
-- 016_pool_rules_non_empty_instructors_fix_check.sql

-- =============================================
-- RBAC: permissions + role
-- =============================================
INSERT INTO public.permissions (name, description, min_role_level)
VALUES
    ('pools.manage', 'Create, update and delete own pool rules', 50),
    ('pools.view', 'View pool rules from all coordinators', 80)
ON CONFLICT (name) DO UPDATE
SET
    description = EXCLUDED.description,
    min_role_level = EXCLUDED.min_role_level;

INSERT INTO public.roles (name, description, hierarchy_level)
VALUES ('coordinator', 'Manage pool rules and schedule validations', 55)
ON CONFLICT (name) DO UPDATE
SET
    description = EXCLUDED.description,
    hierarchy_level = EXCLUDED.hierarchy_level;

INSERT INTO public.role_permissions (role, permission)
VALUES
    ('admin', 'pools.manage'),
    ('admin', 'pools.view'),
    ('super_admin', 'pools.manage'),
    ('super_admin', 'pools.view')
ON CONFLICT (role, permission) DO NOTHING;

-- =============================================
-- Table: pool_rules (final shape)
-- =============================================
CREATE TABLE IF NOT EXISTS public.pool_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    program_query TEXT NOT NULL,
    days_of_week SMALLINT[] NOT NULL DEFAULT '{}',
    allowed_instructors_by_day JSONB NOT NULL DEFAULT '{}'::jsonb,
    allowed_instructors TEXT[] NOT NULL DEFAULT '{}',
    blocked_instructors TEXT[] NOT NULL DEFAULT '{}',
    hard_lock BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pool_rules
    ADD COLUMN IF NOT EXISTS days_of_week SMALLINT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.pool_rules
    ADD COLUMN IF NOT EXISTS allowed_instructors_by_day JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.pool_rules
SET
    days_of_week = COALESCE(days_of_week, '{}'),
    allowed_instructors_by_day = COALESCE(allowed_instructors_by_day, '{}'::jsonb),
    allowed_instructors = COALESCE(allowed_instructors, '{}'),
    blocked_instructors = COALESCE(blocked_instructors, '{}')
WHERE
    days_of_week IS NULL
    OR allowed_instructors_by_day IS NULL
    OR allowed_instructors IS NULL
    OR blocked_instructors IS NULL;

ALTER TABLE public.pool_rules
    ALTER COLUMN days_of_week SET DEFAULT '{}',
    ALTER COLUMN days_of_week SET NOT NULL,
    ALTER COLUMN allowed_instructors_by_day SET DEFAULT '{}'::jsonb,
    ALTER COLUMN allowed_instructors_by_day SET NOT NULL,
    ALTER COLUMN allowed_instructors SET DEFAULT '{}',
    ALTER COLUMN allowed_instructors SET NOT NULL,
    ALTER COLUMN blocked_instructors SET DEFAULT '{}',
    ALTER COLUMN blocked_instructors SET NOT NULL;

ALTER TABLE public.pool_rules
    DROP CONSTRAINT IF EXISTS pool_rules_days_of_week_range;

ALTER TABLE public.pool_rules
    ADD CONSTRAINT pool_rules_days_of_week_range CHECK (
        days_of_week <@ ARRAY[1,2,3,4,5,6,7]::SMALLINT[]
    );

ALTER TABLE public.pool_rules
    DROP CONSTRAINT IF EXISTS pool_rules_allowed_instructors_by_day_object;

ALTER TABLE public.pool_rules
    ADD CONSTRAINT pool_rules_allowed_instructors_by_day_object CHECK (
        jsonb_typeof(allowed_instructors_by_day) = 'object'
    );

ALTER TABLE public.pool_rules
    DROP CONSTRAINT IF EXISTS pool_rules_non_empty_instructors;

ALTER TABLE public.pool_rules
    ADD CONSTRAINT pool_rules_non_empty_instructors CHECK (
        hard_lock = false
        OR array_length(allowed_instructors, 1) IS NOT NULL
        OR jsonb_path_exists(allowed_instructors_by_day, '$.*[*]')
    );

CREATE INDEX IF NOT EXISTS idx_pool_rules_owner_id ON public.pool_rules(owner_id);
CREATE INDEX IF NOT EXISTS idx_pool_rules_is_active ON public.pool_rules(is_active);

DROP TRIGGER IF EXISTS update_pool_rules_modtime ON public.pool_rules;
CREATE TRIGGER update_pool_rules_modtime
    BEFORE UPDATE ON public.pool_rules
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.pool_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pool_rules_select" ON public.pool_rules;
CREATE POLICY "pool_rules_select" ON public.pool_rules
    FOR SELECT TO authenticated
    USING (
        owner_id = (SELECT auth.uid())
        OR public.has_permission('pools.view')
    );

DROP POLICY IF EXISTS "pool_rules_insert" ON public.pool_rules;
CREATE POLICY "pool_rules_insert" ON public.pool_rules
    FOR INSERT TO authenticated
    WITH CHECK (
        owner_id = (SELECT auth.uid())
        AND public.has_permission('pools.manage')
    );

DROP POLICY IF EXISTS "pool_rules_update" ON public.pool_rules;
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

DROP POLICY IF EXISTS "pool_rules_delete" ON public.pool_rules;
CREATE POLICY "pool_rules_delete" ON public.pool_rules
    FOR DELETE TO authenticated
    USING (
        owner_id = (SELECT auth.uid())
        AND public.has_permission('pools.manage')
    );

-- =============================================
-- RPCs: owner-scoped CRUD (final signatures)
-- =============================================
DROP FUNCTION IF EXISTS public.create_pool_rule(TEXT, TEXT[], TEXT[], BOOLEAN, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS public.create_pool_rule(TEXT, SMALLINT[], TEXT[], TEXT[], BOOLEAN, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS public.create_pool_rule(TEXT, SMALLINT[], JSONB, TEXT[], TEXT[], BOOLEAN, BOOLEAN, TEXT);

DROP FUNCTION IF EXISTS public.update_my_pool_rule(UUID, TEXT, TEXT[], TEXT[], BOOLEAN, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS public.update_my_pool_rule(UUID, TEXT, SMALLINT[], TEXT[], TEXT[], BOOLEAN, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS public.update_my_pool_rule(UUID, TEXT, SMALLINT[], JSONB, TEXT[], TEXT[], BOOLEAN, BOOLEAN, TEXT);

DROP FUNCTION IF EXISTS public.get_my_pool_rules();

CREATE OR REPLACE FUNCTION public.get_my_pool_rules()
RETURNS TABLE (
    id UUID,
    owner_id UUID,
    program_query TEXT,
    days_of_week SMALLINT[],
    allowed_instructors_by_day JSONB,
    allowed_instructors TEXT[],
    blocked_instructors TEXT[],
    hard_lock BOOLEAN,
    is_active BOOLEAN,
    notes TEXT,
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
        pr.program_query,
        pr.days_of_week,
        pr.allowed_instructors_by_day,
        pr.allowed_instructors,
        pr.blocked_instructors,
        pr.hard_lock,
        pr.is_active,
        pr.notes,
        pr.created_at,
        pr.updated_at
    FROM public.pool_rules pr
    WHERE pr.owner_id = (SELECT auth.uid())
    ORDER BY pr.updated_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.create_pool_rule(
    p_program_query TEXT,
    p_days_of_week SMALLINT[] DEFAULT '{}',
    p_allowed_instructors_by_day JSONB DEFAULT '{}'::jsonb,
    p_allowed_instructors TEXT[] DEFAULT '{}',
    p_blocked_instructors TEXT[] DEFAULT '{}',
    p_hard_lock BOOLEAN DEFAULT false,
    p_is_active BOOLEAN DEFAULT true,
    p_notes TEXT DEFAULT NULL
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
        owner_id,
        program_query,
        days_of_week,
        allowed_instructors_by_day,
        allowed_instructors,
        blocked_instructors,
        hard_lock,
        is_active,
        notes
    )
    VALUES (
        (SELECT auth.uid()),
        p_program_query,
        COALESCE(p_days_of_week, '{}'),
        COALESCE(p_allowed_instructors_by_day, '{}'::jsonb),
        COALESCE(p_allowed_instructors, '{}'),
        COALESCE(p_blocked_instructors, '{}'),
        COALESCE(p_hard_lock, false),
        COALESCE(p_is_active, true),
        p_notes
    )
    RETURNING id INTO new_id;

    RETURN json_build_object('success', true, 'id', new_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_my_pool_rule(
    p_id UUID,
    p_program_query TEXT,
    p_days_of_week SMALLINT[] DEFAULT '{}',
    p_allowed_instructors_by_day JSONB DEFAULT '{}'::jsonb,
    p_allowed_instructors TEXT[] DEFAULT '{}',
    p_blocked_instructors TEXT[] DEFAULT '{}',
    p_hard_lock BOOLEAN DEFAULT false,
    p_is_active BOOLEAN DEFAULT true,
    p_notes TEXT DEFAULT NULL
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
        program_query = p_program_query,
        days_of_week = COALESCE(p_days_of_week, '{}'),
        allowed_instructors_by_day = COALESCE(p_allowed_instructors_by_day, '{}'::jsonb),
        allowed_instructors = COALESCE(p_allowed_instructors, '{}'),
        blocked_instructors = COALESCE(p_blocked_instructors, '{}'),
        hard_lock = COALESCE(p_hard_lock, false),
        is_active = COALESCE(p_is_active, true),
        notes = p_notes
    WHERE id = p_id
      AND owner_id = (SELECT auth.uid());

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pool rule not found or not owned by caller';
    END IF;

    RETURN json_build_object('success', true, 'id', p_id);
END;
$$;

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
    WHERE id = p_id
      AND owner_id = (SELECT auth.uid());

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pool rule not found or not owned by caller';
    END IF;

    RETURN json_build_object('success', true, 'id', p_id);
END;
$$;

-- =============================================
-- Grants
-- =============================================
REVOKE ALL ON FUNCTION public.get_my_pool_rules() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_pool_rule(TEXT, SMALLINT[], JSONB, TEXT[], TEXT[], BOOLEAN, BOOLEAN, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_my_pool_rule(UUID, TEXT, SMALLINT[], JSONB, TEXT[], TEXT[], BOOLEAN, BOOLEAN, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_my_pool_rule(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_my_pool_rules() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_pool_rule(TEXT, SMALLINT[], JSONB, TEXT[], TEXT[], BOOLEAN, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_my_pool_rule(UUID, TEXT, SMALLINT[], JSONB, TEXT[], TEXT[], BOOLEAN, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_my_pool_rule(UUID) TO authenticated;
