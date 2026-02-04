-- ============================================
-- Minerva v2 - 008: Published Schedules
-- ============================================
-- Tabla para horarios publicados por admins.
-- Permite notificación y descarga por usuarios.

CREATE TABLE IF NOT EXISTS public.published_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    published_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    schedule_date TEXT NOT NULL,  -- Formato: YYYY-MM-DD (ISO 8601)
    entries_count INT DEFAULT 0, -- Número de entradas en el horario
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    CONSTRAINT published_schedules_date_unique UNIQUE (schedule_date)
);

COMMENT ON TABLE public.published_schedules IS 'Horarios publicados por admins para distribución a usuarios';

-- =============================================
-- RLS POLICIES
-- =============================================
ALTER TABLE public.published_schedules ENABLE ROW LEVEL SECURITY;

-- SELECT: Combined check for Read OR Manage permissions
CREATE POLICY "published_schedules_select" ON public.published_schedules
    FOR SELECT TO authenticated
    USING (
        ((select auth.jwt()) -> 'permissions')::jsonb ? 'schedules.read'
        OR
        ((select auth.jwt()) -> 'permissions')::jsonb ? 'schedules.manage'
    );

-- WRITE: Explicit policies for admins (manage permission)
CREATE POLICY "published_schedules_insert" ON public.published_schedules
    FOR INSERT TO authenticated
    WITH CHECK (((select auth.jwt()) -> 'permissions')::jsonb ? 'schedules.manage');

CREATE POLICY "published_schedules_update" ON public.published_schedules
    FOR UPDATE TO authenticated
    USING (((select auth.jwt()) -> 'permissions')::jsonb ? 'schedules.manage');

CREATE POLICY "published_schedules_delete" ON public.published_schedules
    FOR DELETE TO authenticated
    USING (((select auth.jwt()) -> 'permissions')::jsonb ? 'schedules.manage');

-- =============================================
-- REALTIME
-- =============================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.published_schedules;

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX IF NOT EXISTS idx_published_schedules_date ON public.published_schedules(schedule_date);
CREATE INDEX IF NOT EXISTS idx_published_schedules_created ON public.published_schedules(created_at DESC);
