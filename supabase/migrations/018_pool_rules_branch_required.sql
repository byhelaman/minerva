-- ============================================
-- Minerva v2 — 018: Pools branch requirement
-- ============================================

ALTER TABLE public.pool_rules
    ADD COLUMN IF NOT EXISTS branch TEXT;

UPDATE public.pool_rules
SET branch = COALESCE(NULLIF(TRIM(branch), ''), 'UNASSIGNED')
WHERE branch IS NULL OR TRIM(branch) = '';

ALTER TABLE public.pool_rules
    ALTER COLUMN branch SET NOT NULL,
    ALTER COLUMN branch SET DEFAULT 'UNASSIGNED';

ALTER TABLE public.pool_rules
    DROP CONSTRAINT IF EXISTS pool_rules_branch_not_blank;

ALTER TABLE public.pool_rules
    ADD CONSTRAINT pool_rules_branch_not_blank CHECK (NULLIF(TRIM(branch), '') IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pool_rules_owner_program_norm
ON public.pool_rules (owner_id, lower(trim(program_query)));

DROP FUNCTION IF EXISTS public.create_pool_rule(TEXT, SMALLINT[], JSONB, TEXT[], TEXT[], BOOLEAN, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS public.update_my_pool_rule(UUID, TEXT, SMALLINT[], JSONB, TEXT[], TEXT[], BOOLEAN, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS public.get_my_pool_rules();

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
        pr.branch,
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
    p_branch TEXT,
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
        branch,
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
        NULLIF(TRIM(p_branch), ''),
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
    p_branch TEXT,
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
        branch = NULLIF(TRIM(p_branch), ''),
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

REVOKE ALL ON FUNCTION public.get_my_pool_rules() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_pool_rule(TEXT, TEXT, SMALLINT[], JSONB, TEXT[], TEXT[], BOOLEAN, BOOLEAN, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_my_pool_rule(UUID, TEXT, TEXT, SMALLINT[], JSONB, TEXT[], TEXT[], BOOLEAN, BOOLEAN, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_my_pool_rules() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_pool_rule(TEXT, TEXT, SMALLINT[], JSONB, TEXT[], TEXT[], BOOLEAN, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_my_pool_rule(UUID, TEXT, TEXT, SMALLINT[], JSONB, TEXT[], TEXT[], BOOLEAN, BOOLEAN, TEXT) TO authenticated;
