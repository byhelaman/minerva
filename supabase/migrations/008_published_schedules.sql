-- ============================================
-- Minerva v2 - 008: Published Schedules
-- ============================================
-- Tabla para horarios publicados por admins.
-- Permite notificación y descarga por usuarios.

CREATE TABLE
IF NOT EXISTS public.published_schedules
(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid
(),
    published_by UUID REFERENCES auth.users
(id) ON
DELETE
SET NULL
,
    schedule_date TEXT NOT NULL,  -- Formato: YYYY-MM-DD (ISO 8601)
    schedule_data JSONB NOT NULL, -- Array de Schedule[]
    created_at TIMESTAMPTZ DEFAULT now
(),
    updated_at TIMESTAMPTZ DEFAULT now
(),
    
    CONSTRAINT published_schedules_date_unique UNIQUE
(schedule_date)
);

COMMENT ON TABLE public.published_schedules IS 'Horarios publicados por admins para distribución a usuarios';

-- =============================================
-- RLS POLICIES
-- =============================================
ALTER TABLE public.published_schedules ENABLE ROW LEVEL SECURITY;

-- Admins con schedules.manage pueden publicar y actualizar
CREATE POLICY "admins_can_manage" ON public.published_schedules
    FOR ALL TO authenticated
    USING
(
        ((SELECT auth.jwt())
-> 'permissions')::jsonb ? 'schedules.manage'
    )
    WITH CHECK
(
        ((SELECT auth.jwt())
-> 'permissions')::jsonb ? 'schedules.manage'
    );

-- Usuarios con schedules.read pueden leer
CREATE POLICY "users_can_read" ON public.published_schedules
    FOR
SELECT TO authenticated
USING
(
        ((SELECT auth.jwt())
-> 'permissions')::jsonb ? 'schedules.read'
    );

-- =============================================
-- REALTIME
-- =============================================
ALTER PUBLICATION supabase_realtime
ADD TABLE public.published_schedules;

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX
IF NOT EXISTS idx_published_schedules_date ON public.published_schedules
(schedule_date);
CREATE INDEX
IF NOT EXISTS idx_published_schedules_created ON public.published_schedules
(created_at DESC);
