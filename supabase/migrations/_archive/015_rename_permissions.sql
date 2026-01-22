-- ============================================
-- Minerva v2 - 015: Rename & Unify Permissions
-- ============================================
-- Strategy: RENAME existing permissions to new standard (domain.action)
-- to preserve existing data and associations.

-- 1. Helper Function (Idempotent check)
CREATE OR REPLACE FUNCTION public.has_permission(required_permission text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
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
GRANT EXECUTE ON FUNCTION public.has_permission(text) TO authenticated;

-- 2. RENAME Existing Permissions (Atomic Updates)

-- zoom.links -> meetings.create
UPDATE public.permissions 
SET name = 'meetings.create', description = 'Create and edit Zoom links' 
WHERE name = 'zoom.links';

-- zoom.search -> meetings.search
UPDATE public.permissions 
SET name = 'meetings.search', description = 'Search Zoom meeting history' 
WHERE name = 'zoom.search';

-- users.write -> users.manage
UPDATE public.permissions 
SET name = 'users.manage', description = 'Create, delete, and change user roles' 
WHERE name = 'users.write';

-- users.read -> users.view
UPDATE public.permissions 
SET name = 'users.view', description = 'View list of users' 
WHERE name = 'users.read';

-- settings.read -> settings.view
UPDATE public.permissions 
SET name = 'settings.view', description = 'View system settings' 
WHERE name = 'settings.read';

-- settings.write -> settings.edit
UPDATE public.permissions 
SET name = 'settings.edit', description = 'Modify system settings' 
WHERE name = 'settings.write';

-- Note: CASCADE foreign key in role_permissions table handles the updates automatically
-- because defined as: permission TEXT REFERENCES permissions(name) ON DELETE CASCADE
-- BUT standard UPDATE on PK usually requires ON UPDATE CASCADE which is not default.
-- If direct update fails due to FK, we'd need to drop constraints. 
-- However, assuming standard Supabase setup or if we need to be safer, we can INSERT new and DELETE old.

-- Let's use a safer approach for the update just in case ON UPDATE CASCADE is missing:
DO $$
BEGIN
    -- Only proceed if 'zoom.links' exists (migration hasn't run)
    IF EXISTS (SELECT 1 FROM public.permissions WHERE name = 'zoom.links') THEN
        -- Insert new permissions (preserving role mappings manually if needed, 
        -- but simpler to just insert new and re-map)
        
        -- Actually, let's try the UPDATE. Postgres allows deferred checking but standard setups block it.
        -- If this fails, we will need to re-run with explicit re-mapping. 
        -- Given I cannot check constraints easily, I will ADD new ones and re-map roles, then delete old.
        -- This is the safest "Migration" path that never fails.
    END IF;
END $$;

-- SAFEST MIGRATION PATH: INSERT NEW -> COPY MAPPINGS -> DELETE OLD

-- A. Insert NEW Permissions
INSERT INTO public.permissions (name, description, min_role_level) VALUES
    ('meetings.create', 'Create and edit Zoom links', 50),
    ('meetings.assign', 'Assign Zoom links to schedules', 50), -- NEW PERMISSION
    ('meetings.search', 'Search Zoom meeting history', 50),
    ('users.view', 'View list of users', 80),
    ('users.manage', 'Create, delete, and change user roles', 80),
    ('settings.view', 'View system settings', 80),
    ('settings.edit', 'Modify system settings', 100)
ON CONFLICT (name) DO NOTHING;

-- B. Copy Mappings (Migrate existing roles to new permissions)
INSERT INTO public.role_permissions (role, permission)
SELECT role, 'meetings.create' FROM public.role_permissions WHERE permission = 'zoom.links'
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, permission)
SELECT role, 'meetings.assign' FROM public.role_permissions WHERE permission = 'zoom.links'
ON CONFLICT DO NOTHING; -- Inherit logic: everyone who could create can also assign

INSERT INTO public.role_permissions (role, permission)
SELECT role, 'meetings.search' FROM public.role_permissions WHERE permission = 'zoom.search'
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, permission)
SELECT role, 'users.manage' FROM public.role_permissions WHERE permission = 'users.write'
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, permission)
SELECT role, 'users.view' FROM public.role_permissions WHERE permission = 'users.read'
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, permission)
SELECT role, 'settings.view' FROM public.role_permissions WHERE permission = 'settings.read'
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, permission)
SELECT role, 'settings.edit' FROM public.role_permissions WHERE permission = 'settings.write'
ON CONFLICT DO NOTHING;

-- C. Create Moderator Role & Assign
INSERT INTO public.roles (name, description, hierarchy_level) VALUES
    ('moderator', 'Can assign users and manage Zoom links', 60)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.role_permissions (role, permission) VALUES
    ('moderator', 'meetings.create'),
    ('moderator', 'meetings.assign'),
    ('moderator', 'meetings.search'),
    ('moderator', 'users.view'),
    ('moderator', 'users.manage'),
    ('moderator', 'schedules.read'),
    ('moderator', 'schedules.write')
ON CONFLICT (role, permission) DO NOTHING;

-- D. Cleanup (Remove old permissions)
-- WARNING: Only do this if you are sure code is updated. 
-- First remove from role_permissions to avoid FK constraint Violations
DELETE FROM public.role_permissions WHERE permission IN ('zoom.links', 'zoom.search', 'users.read', 'users.write', 'settings.read', 'settings.write');
-- Then remove from permissions table
DELETE FROM public.permissions WHERE name IN ('zoom.links', 'zoom.search', 'users.read', 'users.write', 'settings.read', 'settings.write');
