-- ============================================
-- Minerva v2 — 021: Add rotation limit to tools
-- ============================================

-- 1. Add the column to the table
ALTER TABLE public.pool_rules
    ADD COLUMN IF NOT EXISTS has_rotation_limit BOOLEAN DEFAULT FALSE;

-- 2. Update the RPCs
DROP FUNCTION IF EXISTS public.create_pool_rule(TEXT, TEXT, SMALLINT[], JSONB, TEXT[], TEXT[], BOOLEAN, BOOLEAN, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS public.update_my_pool_rule(UUID, TEXT, TEXT, SMALLINT[], JSONB, TEXT[], TEXT[], BOOLEAN, BOOLEAN, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS public.get_my_pool_rules();

-- 3. Recreate the functions to include rotation_limit
CREATE OR REPLACE FUNCTION public.get_my_pool_rules()
RETURNS TABLE (
    id UUID,
    owner_id UUID,
    branch TEXT,
    program_query TEXT,
    days_of_week SMALLINT[],
    allowed_instructors_by_day JSONB,
    allowed_instructors TEXT[],
    blocked_instructors TEXT[],
    hard_lock BOOLEAN,
    is_active BOOLEAN,
    has_rotation_limit BOOLEAN,
    comments TEXT,
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
        pr.program_query,
        pr.days_of_week,
        pr.allowed_instructors_by_day,
        pr.allowed_instructors,
        pr.blocked_instructors,
        pr.hard_lock,
        pr.is_active,
        pr.has_rotation_limit,
        pr.comments,
        pr.created_at,
        pr.updated_at
    FROM public.pool_rules pr
    WHERE pr.owner_id = (SELECT auth.uid())
    ORDER BY pr.updated_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.create_pool_rule(
    p_branch TEXT,
    p_program_query TEXT,
    p_days_of_week SMALLINT[] DEFAULT '{}',
    p_allowed_instructors_by_day JSONB DEFAULT '{}'::jsonb,
    p_allowed_instructors TEXT[] DEFAULT '{}',
    p_blocked_instructors TEXT[] DEFAULT '{}',
    p_hard_lock BOOLEAN DEFAULT false,
    p_is_active BOOLEAN DEFAULT true,
    p_has_rotation_limit BOOLEAN DEFAULT false,
    p_comments TEXT DEFAULT NULL
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
        branch,
        program_query,
        days_of_week,
        allowed_instructors_by_day,
        allowed_instructors,
        blocked_instructors,
        hard_lock,
        is_active,
        has_rotation_limit,
        comments
    )
    VALUES (
        (SELECT auth.uid()),
        NULLIF(TRIM(p_branch), ''),
        p_program_query,
        COALESCE(p_days_of_week, '{}'),
        COALESCE(p_allowed_instructors_by_day, '{}'::jsonb),
        COALESCE(p_allowed_instructors, '{}'),
        COALESCE(p_blocked_instructors, '{}'),
        COALESCE(p_hard_lock, false),
        COALESCE(p_is_active, true),
        COALESCE(p_has_rotation_limit, false),
        p_comments
    )
    RETURNING id INTO new_id;

    RETURN json_build_object('success', true, 'id', new_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_my_pool_rule(
    p_id UUID,
    p_branch TEXT,
    p_program_query TEXT,
    p_days_of_week SMALLINT[] DEFAULT '{}',
    p_allowed_instructors_by_day JSONB DEFAULT '{}'::jsonb,
    p_allowed_instructors TEXT[] DEFAULT '{}',
    p_blocked_instructors TEXT[] DEFAULT '{}',
    p_hard_lock BOOLEAN DEFAULT false,
    p_is_active BOOLEAN DEFAULT true,
    p_has_rotation_limit BOOLEAN DEFAULT false,
    p_comments TEXT DEFAULT NULL
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
        program_query = p_program_query,
        days_of_week = COALESCE(p_days_of_week, '{}'),
        allowed_instructors_by_day = COALESCE(p_allowed_instructors_by_day, '{}'::jsonb),
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

    RETURN json_build_object('success', true, 'id', p_id);
END;
$$;

-- 4. Grants
REVOKE ALL ON FUNCTION public.get_my_pool_rules() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_pool_rule(TEXT, TEXT, SMALLINT[], JSONB, TEXT[], TEXT[], BOOLEAN, BOOLEAN, BOOLEAN, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_my_pool_rule(UUID, TEXT, TEXT, SMALLINT[], JSONB, TEXT[], TEXT[], BOOLEAN, BOOLEAN, BOOLEAN, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_my_pool_rules() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_pool_rule(TEXT, TEXT, SMALLINT[], JSONB, TEXT[], TEXT[], BOOLEAN, BOOLEAN, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_my_pool_rule(UUID, TEXT, TEXT, SMALLINT[], JSONB, TEXT[], TEXT[], BOOLEAN, BOOLEAN, BOOLEAN, TEXT) TO authenticated;
