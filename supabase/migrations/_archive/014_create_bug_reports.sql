-- ============================================
-- Minerva v2 - 014: Bug Reports
-- ============================================
-- Run AFTER 013_webhook_cleanup.sql

-- 1. Crear tabla bug_reports
CREATE TABLE IF NOT EXISTS public.bug_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL CHECK (char_length(title) >= 5 AND char_length(title) <= 50),
    description TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_email TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.bug_reports IS 'Reportes de bugs enviados por usuarios';

-- 2. Habilitar RLS
ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

-- 3. Política: CUALQUIERA puede crear reportes (incluso anónimos, para bugs de login)
CREATE POLICY "bug_reports_insert" ON public.bug_reports
    FOR INSERT TO anon, authenticated
    WITH CHECK (true);

-- 4. Política: Usuarios autenticados pueden ver sus propios reportes
CREATE POLICY "bug_reports_select_own" ON public.bug_reports
    FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));

-- 5. Política: Admins pueden ver todos los reportes (usa JWT claim para rendimiento)
-- hierarchy_level >= 80 = admin
CREATE POLICY "bug_reports_select_admin" ON public.bug_reports
    FOR SELECT TO authenticated
    USING (
        COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level'))::int, 0) >= 80
    );

-- 6. Política: Admins pueden actualizar status de reportes
CREATE POLICY "bug_reports_update_admin" ON public.bug_reports
    FOR UPDATE TO authenticated
    USING (
        COALESCE((SELECT (auth.jwt() ->> 'hierarchy_level'))::int, 0) >= 80
    );

-- 7. Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_bug_reports_user_id ON public.bug_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_bug_reports_status ON public.bug_reports(status);
CREATE INDEX IF NOT EXISTS idx_bug_reports_created_at ON public.bug_reports(created_at DESC);
