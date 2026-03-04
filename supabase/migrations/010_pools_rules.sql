-- ============================================
-- Minerva v2 — 010: Pools Rules
-- ============================================
-- Reglas por coordinador para validación de asignación de instructores por programa.

-- =============================================
-- RBAC: permisos + rol coordinator
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
-- Pools rules
-- =============================================
CREATE TABLE IF NOT EXISTS public.pool_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    program_query TEXT NOT NULL,
    allowed_instructors TEXT[] NOT NULL DEFAULT '{}',
    blocked_instructors TEXT[] NOT NULL DEFAULT '{}',
    hard_lock BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pool_rules_non_empty_instructors CHECK (
        hard_lock = false OR array_length(allowed_instructors, 1) IS NOT NULL
    )
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
-- RPC: Pools CRUD (owner scoped)
-- =============================================
CREATE OR REPLACE FUNCTION public.get_my_pool_rules()
RETURNS TABLE (
    id UUID,
    owner_id UUID,
    program_query TEXT,
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
        allowed_instructors,
        blocked_instructors,
        hard_lock,
        is_active,
        notes
    )
    VALUES (
        (SELECT auth.uid()),
        p_program_query,
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
REVOKE ALL ON FUNCTION public.create_pool_rule(TEXT, TEXT[], TEXT[], BOOLEAN, BOOLEAN, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_my_pool_rule(UUID, TEXT, TEXT[], TEXT[], BOOLEAN, BOOLEAN, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_my_pool_rule(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_my_pool_rules() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_pool_rule(TEXT, TEXT[], TEXT[], BOOLEAN, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_my_pool_rule(UUID, TEXT, TEXT[], TEXT[], BOOLEAN, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_my_pool_rule(UUID) TO authenticated;