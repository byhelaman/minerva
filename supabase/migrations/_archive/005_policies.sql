-- ============================================
-- Minerva v2 - 005: RLS Policies
-- ============================================
-- Run AFTER 004_functions.sql
-- Performance: usa auth.jwt() para leer claims sin consultar BD

-- =============================================
-- ENABLE RLS
-- =============================================
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- =============================================
-- ROLES TABLE (read-only for authenticated)
-- =============================================
CREATE POLICY "roles_select" ON public.roles
    FOR SELECT TO authenticated
    USING (true);

-- =============================================
-- PERMISSIONS TABLE (read-only for authenticated)
-- =============================================
CREATE POLICY "permissions_select" ON public.permissions
    FOR SELECT TO authenticated
    USING (true);

-- =============================================
-- ROLE_PERMISSIONS TABLE (read-only for authenticated)
-- =============================================
CREATE POLICY "role_permissions_select" ON public.role_permissions
    FOR SELECT TO authenticated
    USING (true);

-- =============================================
-- PROFILES TABLE
-- =============================================
-- Nota: hierarchy_level se lee del JWT (Custom Claim)
-- Esto evita consultas a BD y recursión en RLS

-- SELECT: propio perfil O admin (hierarchy_level >= 80)
CREATE POLICY "profiles_select" ON public.profiles
    FOR SELECT USING (
        id = (SELECT auth.uid())
        OR COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level'))::int, 0) >= 80
    );

-- INSERT: solo via trigger (auto-create on signup)
CREATE POLICY "profiles_insert" ON public.profiles
    FOR INSERT WITH CHECK (
        id = (SELECT auth.uid())
    );

-- UPDATE: propio perfil O admin
CREATE POLICY "profiles_update" ON public.profiles
    FOR UPDATE USING (
        id = (SELECT auth.uid())
        OR COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level'))::int, 0) >= 80
    );

-- DELETE: solo super_admin (hierarchy_level >= 100)
CREATE POLICY "profiles_delete" ON public.profiles
    FOR DELETE USING (
        COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level'))::int, 0) >= 100
    );
