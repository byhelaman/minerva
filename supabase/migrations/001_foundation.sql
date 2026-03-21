-- ============================================
-- Minerva v2 — 001: Foundation
-- ============================================
-- RBAC, profiles, auth hook, JWT claims, user management RPCs, account deletion.
-- Consolidates: 001_core_access, 002_user_management, 007_delete_account,
--               009_users_last_login, 020_unprotect_moderator_role
-- Run first. No dependencies.

-- =============================================
-- 1. ROLES + PERMISOS
-- =============================================
CREATE TABLE public.roles (
    name TEXT PRIMARY KEY,
    description TEXT,
    hierarchy_level INT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE public.permissions (
    name TEXT PRIMARY KEY,
    description TEXT,
    min_role_level INT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE public.role_permissions (
    role TEXT REFERENCES public.roles(name) ON DELETE CASCADE,
    permission TEXT REFERENCES public.permissions(name) ON DELETE CASCADE,
    PRIMARY KEY (role, permission)
);

CREATE INDEX idx_role_permissions_role ON public.role_permissions(role);
CREATE INDEX idx_role_permissions_permission ON public.role_permissions(permission);

-- Seed: Roles
-- Note: 'coordinator' (level 55) is added in 004_pools.sql
INSERT INTO public.roles (name, description, hierarchy_level) VALUES
    ('super_admin', 'Full system control, Zoom integration', 100),
    ('admin', 'Manage users and system settings', 80),
    ('moderator', 'Can assign users and manage Zoom links', 60),
    ('operator', 'Work with schedules and Zoom data', 50),
    ('viewer', 'Read-only access to own schedules', 10),
    ('guest', 'Unverified user. No access to data.', 0);

-- Seed: Permissions
-- Note: reports.view and reports.manage were removed in migration 012.
-- Note: pools.manage and pools.view are added in 004_pools.sql.
INSERT INTO public.permissions (name, description, min_role_level) VALUES
    ('schedules.read',  'View own schedules',                    10),
    ('schedules.write', 'Upload and edit schedules',             50),
    ('schedules.manage','Publish and manage global schedules',   80),
    ('meetings.search', 'Search Zoom meeting history',           60),
    ('meetings.create', 'Create and edit Zoom links',            60),
    ('meetings.delete', 'Delete Zoom meetings',                  80),
    ('meetings.assign', 'Assign Zoom links to schedules',        60),
    ('users.view',      'View list of users',                    80),
    ('users.manage',    'Create, delete, and change user roles', 80),
    ('system.view',     'View system settings',                  80),
    ('system.manage',   'Modify system settings',               100);

-- Seed: Role → Permission assignments
INSERT INTO public.role_permissions (role, permission) VALUES
    ('viewer',      'schedules.read'),
    ('operator',    'schedules.read'),
    ('operator',    'schedules.write'),
    ('moderator',   'schedules.read'),
    ('moderator',   'schedules.write'),
    ('moderator',   'meetings.search'),
    ('moderator',   'meetings.create'),
    ('moderator',   'meetings.assign'),
    ('admin',       'schedules.read'),
    ('admin',       'schedules.write'),
    ('admin',       'schedules.manage'),
    ('admin',       'meetings.search'),
    ('admin',       'meetings.create'),
    ('admin',       'meetings.delete'),
    ('admin',       'meetings.assign'),
    ('admin',       'users.view'),
    ('admin',       'users.manage'),
    ('admin',       'system.view'),
    ('super_admin', 'schedules.read'),
    ('super_admin', 'schedules.write'),
    ('super_admin', 'schedules.manage'),
    ('super_admin', 'meetings.search'),
    ('super_admin', 'meetings.create'),
    ('super_admin', 'meetings.delete'),
    ('super_admin', 'meetings.assign'),
    ('super_admin', 'users.view'),
    ('super_admin', 'users.manage'),
    ('super_admin', 'system.view'),
    ('super_admin', 'system.manage');

-- =============================================
-- 2. PROFILES
-- =============================================
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    display_name TEXT,
    role TEXT REFERENCES public.roles(name) DEFAULT 'guest' NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_profiles_email ON public.profiles(email);
CREATE INDEX idx_profiles_role ON public.profiles(role);

-- =============================================
-- 3. UTILITY FUNCTIONS
-- =============================================

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_modtime
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.profiles (id, email, display_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
        'guest'
    );
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- 4. AUTH HOOK — JWT Custom Claims
-- =============================================
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    claims jsonb;
    user_role text;
    user_hierarchy_level int;
    user_permissions text[];
BEGIN
    SELECT p.role, r.hierarchy_level
    INTO user_role, user_hierarchy_level
    FROM public.profiles p
    JOIN public.roles r ON p.role = r.name
    WHERE p.id = (event ->> 'user_id')::uuid;

    claims := event -> 'claims';

    IF user_role IS NOT NULL THEN
        -- Super admin automatically gets all permissions (no manual seeding required)
        IF user_hierarchy_level >= 100 THEN
            SELECT array_agg(p.name)
            INTO user_permissions
            FROM public.permissions p;
        ELSE
            SELECT array_agg(rp.permission)
            INTO user_permissions
            FROM public.role_permissions rp
            WHERE rp.role = user_role;
        END IF;

        claims := jsonb_set(claims, '{user_role}', to_jsonb(user_role));
        claims := jsonb_set(claims, '{hierarchy_level}', to_jsonb(user_hierarchy_level));
        claims := jsonb_set(claims, '{permissions}', to_jsonb(COALESCE(user_permissions, ARRAY[]::text[])));
    ELSE
        claims := jsonb_set(claims, '{user_role}', '"guest"');
        claims := jsonb_set(claims, '{hierarchy_level}', '0');
        claims := jsonb_set(claims, '{permissions}', '[]');
    END IF;

    event := jsonb_set(event, '{claims}', claims);
    RETURN event;
END;
$$;

GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;
GRANT SELECT ON TABLE public.profiles TO supabase_auth_admin;
GRANT SELECT ON TABLE public.roles TO supabase_auth_admin;
GRANT SELECT ON TABLE public.role_permissions TO supabase_auth_admin;

-- =============================================
-- 5. BASE RPCs
-- =============================================

CREATE OR REPLACE FUNCTION public.has_permission(required_permission text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    user_permissions jsonb;
BEGIN
    user_permissions := (auth.jwt() -> 'permissions')::jsonb;
    RETURN user_permissions ? required_permission;
EXCEPTION
    WHEN OTHERS THEN
        RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT json_build_object(
        'id', p.id,
        'email', p.email,
        'display_name', p.display_name,
        'role', p.role,
        'hierarchy_level', r.hierarchy_level,
        'permissions', (
            SELECT COALESCE(json_agg(perm.name), '[]'::json)
            FROM public.permissions perm
            WHERE perm.min_role_level <= r.hierarchy_level
        )
    )
    FROM public.profiles p
    JOIN public.roles r ON p.role = r.name
    WHERE p.id = (SELECT auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.check_email_exists(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (SELECT 1 FROM public.profiles WHERE email = p_email);
$$;

CREATE OR REPLACE FUNCTION public.update_my_display_name(new_display_name TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.profiles
    SET display_name = new_display_name
    WHERE id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_user_password(p_password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID;
    v_encrypted_password TEXT;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT encrypted_password INTO v_encrypted_password
    FROM auth.users WHERE id = v_user_id;

    IF v_encrypted_password IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN v_encrypted_password = extensions.crypt(p_password, v_encrypted_password);
END;
$$;

-- =============================================
-- 6. RLS POLICIES
-- =============================================
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "roles_select" ON public.roles
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "permissions_select" ON public.permissions
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "role_permissions_select" ON public.role_permissions
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "profiles_select" ON public.profiles
    FOR SELECT USING (
        id = (SELECT auth.uid())
        OR COALESCE(((SELECT auth.jwt()) ->> 'hierarchy_level')::int, 0) >= 80
    );

CREATE POLICY "profiles_insert" ON public.profiles
    FOR INSERT WITH CHECK (id = (SELECT auth.uid()));

CREATE POLICY "profiles_update" ON public.profiles
    FOR UPDATE USING (
        id = (SELECT auth.uid())
        OR COALESCE(((SELECT auth.jwt()) ->> 'hierarchy_level')::int, 0) >= 80
    );

CREATE POLICY "profiles_delete" ON public.profiles
    FOR DELETE USING (
        COALESCE(((SELECT auth.jwt()) ->> 'hierarchy_level')::int, 0) >= 100
    );

-- =============================================
-- 7. SECURITY TRIGGERS
-- =============================================

CREATE OR REPLACE FUNCTION public.prevent_email_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN NEW;
    END IF;
    IF OLD.email IS DISTINCT FROM NEW.email THEN
        RAISE EXCEPTION 'Email modification is not allowed through direct update';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER check_email_update
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_email_modification();

CREATE OR REPLACE FUNCTION public.prevent_role_self_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_hierarchy_level int;
    caller_id uuid;
    target_current_level int;
    new_role_level int;
BEGIN
    caller_id := auth.uid();
    IF caller_id IS NULL THEN
        RETURN NEW;
    END IF;
    caller_hierarchy_level := COALESCE(
        ((SELECT auth.jwt()) ->> 'hierarchy_level')::int, 0
    );

    IF OLD.role IS DISTINCT FROM NEW.role THEN
        IF OLD.id = caller_id THEN
            RAISE EXCEPTION 'Permission denied: cannot modify your own role';
        END IF;
        IF caller_hierarchy_level < 80 THEN
            RAISE EXCEPTION 'Permission denied: cannot change role without admin privileges';
        END IF;
        SELECT r.hierarchy_level INTO target_current_level
        FROM public.roles r WHERE r.name = OLD.role;
        IF target_current_level >= caller_hierarchy_level THEN
            RAISE EXCEPTION 'Permission denied: cannot modify user with equal or higher privileges';
        END IF;
        SELECT r.hierarchy_level INTO new_role_level
        FROM public.roles r WHERE r.name = NEW.role;
        IF new_role_level >= caller_hierarchy_level THEN
            RAISE EXCEPTION 'Permission denied: cannot assign role with equal or higher privileges than yours';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER check_role_update
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_role_self_update();

-- =============================================
-- 8. USER MANAGEMENT RPCs
-- =============================================

-- Final version: includes last_login_at (from 009)
CREATE OR REPLACE FUNCTION public.get_all_users()
RETURNS TABLE (
    id UUID,
    email TEXT,
    display_name TEXT,
    role TEXT,
    hierarchy_level INT,
    created_at TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.has_permission('users.view') THEN
        RAISE EXCEPTION 'Permission denied: requires users.view permission';
    END IF;

    RETURN QUERY
    SELECT p.id, p.email, p.display_name, p.role, r.hierarchy_level,
           p.created_at, au.last_sign_in_at
    FROM public.profiles p
    JOIN public.roles r ON p.role = r.name
    LEFT JOIN auth.users au ON au.id = p.id
    ORDER BY r.hierarchy_level DESC, p.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_all_roles()
RETURNS TABLE (name TEXT, description TEXT, hierarchy_level INT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT r.name, r.description, r.hierarchy_level
    FROM public.roles r
    ORDER BY r.hierarchy_level DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_all_permissions()
RETURNS TABLE (name TEXT, description TEXT, min_role_level INT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT p.name, p.description, p.min_role_level
    FROM public.permissions p
    ORDER BY p.min_role_level ASC;
$$;

CREATE OR REPLACE FUNCTION public.get_user_count()
RETURNS INT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_level int;
    user_count int;
BEGIN
    caller_level := COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level'))::int, 0);
    IF caller_level < 80 THEN
        RAISE EXCEPTION 'Permission denied: requires admin privileges';
    END IF;
    SELECT COUNT(*) INTO user_count FROM public.profiles;
    RETURN user_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_user_role(
    target_user_id UUID,
    new_role TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_id uuid;
    caller_level int;
    target_current_level int;
    new_role_level int;
BEGIN
    caller_id := auth.uid();
    caller_level := COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level'))::int, 0);

    IF NOT public.has_permission('users.manage') THEN
        RAISE EXCEPTION 'Permission denied: requires users.manage permission';
    END IF;
    IF target_user_id = caller_id THEN
        RAISE EXCEPTION 'Permission denied: cannot modify your own role';
    END IF;

    SELECT r.hierarchy_level INTO target_current_level
    FROM public.profiles p JOIN public.roles r ON p.role = r.name
    WHERE p.id = target_user_id;

    IF target_current_level IS NULL THEN
        RAISE EXCEPTION 'User not found';
    END IF;
    IF target_current_level >= caller_level THEN
        RAISE EXCEPTION 'Permission denied: cannot modify user with equal or higher privileges';
    END IF;

    SELECT r.hierarchy_level INTO new_role_level
    FROM public.roles r WHERE r.name = new_role;

    IF new_role_level IS NULL THEN
        RAISE EXCEPTION 'Invalid role: %', new_role;
    END IF;
    IF new_role_level >= caller_level THEN
        RAISE EXCEPTION 'Permission denied: cannot assign role with equal or higher privileges than yours';
    END IF;

    UPDATE public.profiles SET role = new_role WHERE id = target_user_id;
    RETURN json_build_object('success', true, 'user_id', target_user_id, 'new_role', new_role);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_user(target_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_id uuid;
    caller_level int;
    target_level int;
BEGIN
    caller_id := auth.uid();
    caller_level := COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level'))::int, 0);

    IF NOT public.has_permission('users.manage') THEN
        RAISE EXCEPTION 'Permission denied: requires users.manage permission';
    END IF;
    IF target_user_id = caller_id THEN
        RAISE EXCEPTION 'Permission denied: cannot delete your own account';
    END IF;

    SELECT r.hierarchy_level INTO target_level
    FROM public.profiles p JOIN public.roles r ON p.role = r.name
    WHERE p.id = target_user_id;

    IF target_level IS NULL THEN
        RAISE EXCEPTION 'User not found';
    END IF;
    IF target_level >= 100 THEN
        RAISE EXCEPTION 'Permission denied: cannot delete another super_admin';
    END IF;
    IF target_level >= caller_level THEN
        RAISE EXCEPTION 'Permission denied: cannot delete user with equal or higher privileges';
    END IF;

    DELETE FROM auth.users WHERE id = target_user_id;
    RETURN json_build_object('success', true, 'deleted_user_id', target_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_user_display_name(
    target_user_id UUID,
    new_display_name TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_id uuid;
    caller_level int;
    target_current_level int;
BEGIN
    caller_id := auth.uid();
    caller_level := COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level'))::int, 0);

    IF NOT public.has_permission('users.manage') THEN
        RAISE EXCEPTION 'Permission denied: requires users.manage permission';
    END IF;
    IF target_user_id = caller_id THEN
        RAISE EXCEPTION 'Permission denied: use update_my_display_name for your own account';
    END IF;

    SELECT r.hierarchy_level INTO target_current_level
    FROM public.profiles p JOIN public.roles r ON p.role = r.name
    WHERE p.id = target_user_id;

    IF target_current_level IS NULL THEN
        RAISE EXCEPTION 'User not found';
    END IF;
    IF target_current_level >= caller_level THEN
        RAISE EXCEPTION 'Permission denied: cannot modify user with equal or higher privileges';
    END IF;

    UPDATE public.profiles SET display_name = new_display_name WHERE id = target_user_id;
    UPDATE auth.users
    SET raw_user_meta_data = raw_user_meta_data || jsonb_build_object('display_name', new_display_name)
    WHERE id = target_user_id;

    RETURN json_build_object('success', true, 'user_id', target_user_id, 'new_display_name', new_display_name);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_new_user_role(
    target_user_id UUID,
    target_role TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_level int;
    target_role_level int;
BEGIN
    caller_level := COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level'))::int, 0);

    IF NOT public.has_permission('users.manage') THEN
        RAISE EXCEPTION 'Permission denied: requires users.manage permission';
    END IF;

    SELECT hierarchy_level INTO target_role_level
    FROM public.roles WHERE name = target_role;

    IF target_role_level IS NULL THEN
        RAISE EXCEPTION 'Role not found: %', target_role;
    END IF;
    IF target_role_level >= caller_level THEN
        RAISE EXCEPTION 'Permission denied: cannot assign role with equal or higher level';
    END IF;

    UPDATE public.profiles SET role = target_role WHERE id = target_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'User not found: %', target_user_id;
    END IF;

    RETURN json_build_object('success', true, 'user_id', target_user_id, 'role', target_role);
END;
$$;

-- =============================================
-- 9. ROLE MANAGEMENT RPCs
-- =============================================

CREATE OR REPLACE FUNCTION public.create_role(
    role_name TEXT,
    role_description TEXT,
    role_level INT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_level int;
BEGIN
    caller_level := COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level'))::int, 0);

    IF caller_level < 100 THEN
        RAISE EXCEPTION 'Permission denied: requires super_admin privileges';
    END IF;
    IF role_level >= caller_level THEN
        RAISE EXCEPTION 'Permission denied: cannot create role with equal or higher level than yours';
    END IF;
    IF EXISTS (SELECT 1 FROM public.roles WHERE name = role_name) THEN
        RAISE EXCEPTION 'Role already exists: %', role_name;
    END IF;

    INSERT INTO public.roles (name, description, hierarchy_level)
    VALUES (role_name, role_description, role_level);

    RETURN json_build_object('success', true, 'role_name', role_name);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_role(
    role_name TEXT,
    new_description TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_level int;
    target_role_level int;
BEGIN
    caller_level := COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level'))::int, 0);

    IF caller_level < 100 THEN
        RAISE EXCEPTION 'Permission denied: requires super_admin privileges';
    END IF;

    SELECT hierarchy_level INTO target_role_level
    FROM public.roles WHERE name = role_name;

    IF target_role_level IS NULL THEN
        RAISE EXCEPTION 'Role not found: %', role_name;
    END IF;
    IF target_role_level >= caller_level THEN
        RAISE EXCEPTION 'Permission denied: cannot edit role with equal or higher level';
    END IF;

    UPDATE public.roles SET description = new_description WHERE name = role_name;
    RETURN json_build_object('success', true, 'role_name', role_name);
END;
$$;

-- Final version from 020: 'moderator' and 'operator' are no longer protected
CREATE OR REPLACE FUNCTION public.delete_role(role_name TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_level int;
    target_role_level int;
    users_with_role int;
BEGIN
    caller_level := COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level'))::int, 0);

    IF caller_level < 100 THEN
        RAISE EXCEPTION 'Permission denied: requires super_admin privileges';
    END IF;
    IF role_name IN ('super_admin', 'guest') THEN
        RAISE EXCEPTION 'Cannot delete system role: %', role_name;
    END IF;

    SELECT hierarchy_level INTO target_role_level
    FROM public.roles WHERE name = role_name;

    IF target_role_level IS NULL THEN
        RAISE EXCEPTION 'Role not found: %', role_name;
    END IF;
    IF target_role_level >= caller_level THEN
        RAISE EXCEPTION 'Permission denied: cannot delete role with equal or higher level';
    END IF;

    SELECT COUNT(*) INTO users_with_role
    FROM public.profiles WHERE role = role_name;

    IF users_with_role > 0 THEN
        RAISE EXCEPTION 'Cannot delete role: % users are assigned to this role', users_with_role;
    END IF;

    DELETE FROM public.roles WHERE name = role_name;
    RETURN json_build_object('success', true, 'deleted_role', role_name);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_role_permissions(target_role TEXT)
RETURNS TABLE (permission TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT rp.permission
    FROM public.role_permissions rp
    WHERE rp.role = target_role
    ORDER BY rp.permission;
$$;

-- Only 'super_admin' and 'guest' are immutable — 'admin', 'viewer', etc. can be modified by super_admin
CREATE OR REPLACE FUNCTION public.assign_role_permission(
    target_role TEXT,
    permission_name TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_level int;
    target_role_level int;
BEGIN
    caller_level := COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level'))::int, 0);

    IF caller_level < 100 THEN
        RAISE EXCEPTION 'Permission denied: requires super_admin privileges';
    END IF;

    SELECT hierarchy_level INTO target_role_level
    FROM public.roles WHERE name = target_role;

    IF target_role_level IS NULL THEN
        RAISE EXCEPTION 'Role not found: %', target_role;
    END IF;
    IF target_role IN ('super_admin', 'guest') THEN
        RAISE EXCEPTION 'Cannot modify permissions of system role: %', target_role;
    END IF;
    IF target_role_level >= caller_level THEN
        RAISE EXCEPTION 'Permission denied: cannot modify role with equal or higher level';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.permissions WHERE name = permission_name) THEN
        RAISE EXCEPTION 'Permission not found: %', permission_name;
    END IF;

    INSERT INTO public.role_permissions (role, permission)
    VALUES (target_role, permission_name)
    ON CONFLICT (role, permission) DO NOTHING;

    RETURN json_build_object('success', true, 'role', target_role, 'permission', permission_name);
END;
$$;

-- Only 'super_admin' and 'guest' are immutable — 'admin', 'viewer', etc. can be modified by super_admin
CREATE OR REPLACE FUNCTION public.remove_role_permission(
    target_role TEXT,
    permission_name TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_level int;
    target_role_level int;
BEGIN
    caller_level := COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level'))::int, 0);

    IF caller_level < 100 THEN
        RAISE EXCEPTION 'Permission denied: requires super_admin privileges';
    END IF;

    SELECT hierarchy_level INTO target_role_level
    FROM public.roles WHERE name = target_role;

    IF target_role_level IS NULL THEN
        RAISE EXCEPTION 'Role not found: %', target_role;
    END IF;
    IF target_role IN ('super_admin', 'guest') THEN
        RAISE EXCEPTION 'Cannot modify permissions of system role: %', target_role;
    END IF;
    IF target_role_level >= caller_level THEN
        RAISE EXCEPTION 'Permission denied: cannot modify role with equal or higher level';
    END IF;

    DELETE FROM public.role_permissions
    WHERE role = target_role AND permission = permission_name;

    RETURN json_build_object('success', true, 'role', target_role, 'permission_removed', permission_name);
END;
$$;

-- =============================================
-- 10. DELETE OWN ACCOUNT
-- =============================================

CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    _uid UUID := auth.uid();
BEGIN
    IF _uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    UPDATE public.schedule_entries
    SET published_by = NULL
    WHERE published_by = _uid;

    DELETE FROM auth.users WHERE id = _uid;
END;
$$;

-- =============================================
-- 11. GRANTS
-- =============================================
GRANT EXECUTE ON FUNCTION public.has_permission(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_email_exists(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_my_display_name(TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.verify_user_password(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_user_password(TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.get_all_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_all_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_all_roles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_all_permissions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_user_role(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_user_display_name(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_new_user_role(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_role(TEXT, TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_role(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_role(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_role_permissions(TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.assign_role_permission(TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_role_permission(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_role_permission(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_role_permission(TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.delete_own_account() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;

-- =============================================
-- MANUAL STEP: Enable Auth Hook in Supabase Dashboard
-- =============================================
-- 1. Dashboard → Authentication → Hooks
-- 2. "Customize Access Token (JWT) Claims"
-- 3. Select schema "public", function "custom_access_token_hook"
-- 4. Save
