-- ============================================
-- Minerva v2 - 001: Roles and Permissions
-- ============================================
-- Run this FIRST in Supabase SQL Editor

-- Roles table with hierarchy
CREATE TABLE public.roles (
    name TEXT PRIMARY KEY,
    description TEXT,
    hierarchy_level INT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Permissions table
CREATE TABLE public.permissions (
    name TEXT PRIMARY KEY,
    description TEXT,
    min_role_level INT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Role to permission mapping (for reference/admin UI)
CREATE TABLE public.role_permissions (
    role TEXT REFERENCES public.roles(name) ON DELETE CASCADE,
    permission TEXT REFERENCES public.permissions(name) ON DELETE CASCADE,
    PRIMARY KEY (role, permission)
);

-- =============================================
-- SEED DATA
-- =============================================

-- Roles (hierarchy: higher = more permissions)
INSERT INTO public.roles (name, description, hierarchy_level) VALUES
    ('super_admin', 'Full system control, Zoom integration', 100),
    ('admin', 'Manage users and system settings', 80),
    ('moderator', 'Can assign users and manage Zoom links', 60),
    ('operator', 'Work with schedules and Zoom data', 50),
    ('viewer', 'Read-only access to own schedules', 10);

-- Permissions
INSERT INTO public.permissions (name, description, min_role_level) VALUES
    -- Schedules
    ('schedules.read', 'View own schedules', 10),
    ('schedules.write', 'Upload and edit schedules', 50),
    -- Meetings (Zoom)
    ('meetings.search', 'Search Zoom meeting history', 60),
    ('meetings.create', 'Create and edit Zoom links', 60),
    ('meetings.assign', 'Assign Zoom links to schedules', 60),
    -- Users
    ('users.view', 'View list of users', 80),
    ('users.manage', 'Create, delete, and change user roles', 80),
    -- Settings
    ('settings.view', 'View system settings', 80),
    ('settings.edit', 'Modify system settings', 100);

-- Role-Permission mappings (explicit for admin UI)
INSERT INTO public.role_permissions (role, permission) VALUES
    -- viewer
    ('viewer', 'schedules.read'),
    -- operator (includes viewer permissions)
    ('operator', 'schedules.read'),
    ('operator', 'schedules.write'),
    -- moderator (includes operator permissions + users.view/manage partially)
    ('moderator', 'schedules.read'),
    ('moderator', 'schedules.write'),
    ('moderator', 'meetings.search'),
    ('moderator', 'meetings.create'),
    ('moderator', 'meetings.assign'),
    -- admin (includes operator permissions)
    ('admin', 'schedules.read'),
    ('admin', 'schedules.write'),
    ('admin', 'meetings.search'),
    ('admin', 'meetings.create'),
    ('admin', 'meetings.assign'),
    ('admin', 'users.view'),
    ('admin', 'users.manage'),
    ('admin', 'settings.view'),
    -- super_admin (all permissions)
    ('super_admin', 'schedules.read'),
    ('super_admin', 'schedules.write'),
    ('super_admin', 'meetings.search'),
    ('super_admin', 'meetings.create'),
    ('super_admin', 'meetings.assign'),
    ('super_admin', 'users.view'),
    ('super_admin', 'users.manage'),
    ('super_admin', 'settings.view'),
    ('super_admin', 'settings.edit');
