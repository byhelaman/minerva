-- Migration: Add reports.manage permission
-- Allows users with this permission to perform management actions in the Reports page
-- Including: Import data, Delete entries, Sync to Excel, and other modifications

-- Add the new permission
INSERT INTO public.permissions (name, description, min_role_level) VALUES
    ('reports.manage', 'Manage reports: import, delete, sync', 80)
ON CONFLICT (name) DO NOTHING;

-- Assign to admin and super_admin roles
INSERT INTO public.role_permissions (role, permission) VALUES
    ('admin', 'reports.manage'),
    ('super_admin', 'reports.manage')
ON CONFLICT (role, permission) DO NOTHING;
