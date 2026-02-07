-- ============================================
-- Minerva v2 — 001: Core Access
-- ============================================
-- Roles, permisos, perfiles, auth hook, RPCs base, RLS, seguridad.
-- Ejecutar primero en Supabase SQL Editor.

-- =============================================
-- ROLES + PERMISOS
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

-- Índices en FK de role_permissions
CREATE INDEX idx_role_permissions_role ON public.role_permissions(role);
CREATE INDEX idx_role_permissions_permission ON public.role_permissions(permission);

-- Datos semilla: Roles
INSERT INTO public.roles (name, description, hierarchy_level) VALUES
    ('super_admin', 'Full system control, Zoom integration', 100),
    ('admin', 'Manage users and system settings', 80),
    ('moderator', 'Can assign users and manage Zoom links', 60),
    ('operator', 'Work with schedules and Zoom data', 50),
    ('viewer', 'Read-only access to own schedules', 10),
    ('guest', 'Unverified user. No access to data.', 0);

-- Datos semilla: Permisos (incluye reports.manage)
INSERT INTO public.permissions (name, description, min_role_level) VALUES
    ('schedules.read', 'View own schedules', 10),
    ('schedules.write', 'Upload and edit schedules', 50),
    ('schedules.manage', 'Publish and manage global schedules', 80),
    ('meetings.search', 'Search Zoom meeting history', 60),
    ('meetings.create', 'Create and edit Zoom links', 60),
    ('meetings.assign', 'Assign Zoom links to schedules', 60),
    ('users.view', 'View list of users', 80),
    ('users.manage', 'Create, delete, and change user roles', 80),
    ('system.view', 'View system settings', 80),
    ('system.manage', 'Modify system settings', 100),
    ('reports.view', 'View system reports', 80),
    ('reports.manage', 'Manage reports: import, delete, sync', 80);

-- Datos semilla: Asignación de permisos por rol
INSERT INTO public.role_permissions (role, permission) VALUES
    ('viewer', 'schedules.read'),
    ('operator', 'schedules.read'),
    ('operator', 'schedules.write'),
    ('moderator', 'schedules.read'),
    ('moderator', 'schedules.write'),
    ('moderator', 'meetings.search'),
    ('moderator', 'meetings.create'),
    ('moderator', 'meetings.assign'),
    ('admin', 'schedules.read'),
    ('admin', 'schedules.write'),
    ('admin', 'schedules.manage'),
    ('admin', 'meetings.search'),
    ('admin', 'meetings.create'),
    ('admin', 'meetings.assign'),
    ('admin', 'users.view'),
    ('admin', 'users.manage'),
    ('admin', 'system.view'),
    ('admin', 'reports.view'),
    ('admin', 'reports.manage'),
    ('super_admin', 'schedules.read'),
    ('super_admin', 'schedules.write'),
    ('super_admin', 'schedules.manage'),
    ('super_admin', 'meetings.search'),
    ('super_admin', 'meetings.create'),
    ('super_admin', 'meetings.assign'),
    ('super_admin', 'users.view'),
    ('super_admin', 'users.manage'),
    ('super_admin', 'system.view'),
    ('super_admin', 'system.manage'),
    ('super_admin', 'reports.view'),
    ('super_admin', 'reports.manage');

-- =============================================
-- PERFILES
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
-- FUNCIONES UTILITARIAS
-- =============================================

-- Función genérica para actualizar updated_at (reutilizable por cualquier tabla)
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

-- Crear perfil automáticamente al registrarse
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
-- AUTH HOOK (JWT Custom Claims)
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
        SELECT array_agg(rp.permission)
        INTO user_permissions
        FROM public.role_permissions rp
        WHERE rp.role = user_role;

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

-- Permisos exclusivos para auth hook
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;
GRANT SELECT ON TABLE public.profiles TO supabase_auth_admin;
GRANT SELECT ON TABLE public.roles TO supabase_auth_admin;
GRANT SELECT ON TABLE public.role_permissions TO supabase_auth_admin;

-- =============================================
-- RPCs BASE
-- =============================================

-- Verificar permisos del JWT (usado internamente por RPCs de gestión)
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

-- Obtener perfil propio con permisos
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

-- Verificar si un email ya existe (para flujo de registro)
CREATE OR REPLACE FUNCTION public.check_email_exists(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (SELECT 1 FROM public.profiles WHERE email = p_email);
$$;

-- Actualizar display name propio
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

-- Verificar contraseña del usuario actual sin crear nueva sesión
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

-- Grants para RPCs base
GRANT EXECUTE ON FUNCTION public.has_permission(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_email_exists(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_my_display_name(TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.verify_user_password(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_user_password(TEXT) TO authenticated;

-- =============================================
-- RLS POLICIES
-- =============================================
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "roles_select" ON public.roles
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "permissions_select" ON public.permissions
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "role_permissions_select" ON public.role_permissions
    FOR SELECT TO authenticated
    USING (true);

-- Perfiles: usuario ve el suyo, admins ven todos
CREATE POLICY "profiles_select" ON public.profiles
    FOR SELECT USING (
        id = (SELECT auth.uid())
        OR COALESCE(((SELECT auth.jwt()) ->> 'hierarchy_level')::int, 0) >= 80
    );

CREATE POLICY "profiles_insert" ON public.profiles
    FOR INSERT WITH CHECK (
        id = (SELECT auth.uid())
    );

-- Perfiles: usuario edita el suyo (display_name), admins editan todos (role)
-- La protección de columnas (email, role) se implementa con triggers abajo
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
-- TRIGGERS DE SEGURIDAD
-- =============================================

-- Prevenir modificación de email por UPDATE vía API
CREATE OR REPLACE FUNCTION public.prevent_email_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Permitir acceso directo a la BD (Dashboard, migrations, service_role)
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

-- Prevenir escalamiento de privilegios en cambio de rol vía API
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
    -- Permitir acceso directo a la BD (Dashboard, migrations, service_role)
    caller_id := auth.uid();
    IF caller_id IS NULL THEN
        RETURN NEW;
    END IF;
    caller_hierarchy_level := COALESCE(
        ((SELECT auth.jwt()) ->> 'hierarchy_level')::int,
        0
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
-- PASO MANUAL: Habilitar auth hook en Supabase Dashboard
-- =============================================
-- 1. Dashboard → Authentication → Hooks
-- 2. "Customize Access Token (JWT) Claims"
-- 3. Seleccionar schema "public", función "custom_access_token_hook"
-- 4. Guardar
