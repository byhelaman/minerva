-- ============================================
-- Minerva v2 — 006: Schedules + Realtime
-- ============================================
-- Published schedules, schedule entries, realtime subscriptions.
-- Depende de 001_core_access.sql.

-- =============================================
-- PUBLISHED SCHEDULES
-- =============================================
CREATE TABLE IF NOT EXISTS public.published_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    published_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    schedule_date TEXT NOT NULL,
    entries_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    -- Validación de formato ISO 8601 (YYYY-MM-DD)
    CONSTRAINT published_schedules_date_format CHECK (schedule_date ~ '^\d{4}-\d{2}-\d{2}$'),
    CONSTRAINT published_schedules_date_unique UNIQUE (schedule_date)
);

COMMENT ON TABLE public.published_schedules IS 'Horarios publicados por admins para distribución a usuarios';

ALTER TABLE public.published_schedules ENABLE ROW LEVEL SECURITY;

-- SELECT: usuarios con permiso de lectura o gestión
CREATE POLICY "published_schedules_select" ON public.published_schedules
    FOR SELECT TO authenticated
    USING (
        ((SELECT auth.jwt()) -> 'permissions')::jsonb ? 'schedules.read'
        OR ((SELECT auth.jwt()) -> 'permissions')::jsonb ? 'schedules.manage'
    );

CREATE POLICY "published_schedules_insert" ON public.published_schedules
    FOR INSERT TO authenticated
    WITH CHECK (((SELECT auth.jwt()) -> 'permissions')::jsonb ? 'schedules.manage');

CREATE POLICY "published_schedules_update" ON public.published_schedules
    FOR UPDATE TO authenticated
    USING (((SELECT auth.jwt()) -> 'permissions')::jsonb ? 'schedules.manage');

CREATE POLICY "published_schedules_delete" ON public.published_schedules
    FOR DELETE TO authenticated
    USING (((SELECT auth.jwt()) -> 'permissions')::jsonb ? 'schedules.manage');

-- Índices
CREATE INDEX IF NOT EXISTS idx_published_schedules_date ON public.published_schedules(schedule_date);
CREATE INDEX IF NOT EXISTS idx_published_schedules_created ON public.published_schedules(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_published_schedules_published_by ON public.published_schedules(published_by);

-- =============================================
-- SCHEDULE ENTRIES
-- =============================================
CREATE TABLE IF NOT EXISTS public.schedule_entries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

    -- Clave compuesta lógica
    date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    instructor TEXT NOT NULL,
    program TEXT NOT NULL,

    -- Campos base del horario (importados de Excel)
    shift TEXT DEFAULT '',
    branch TEXT DEFAULT '',
    end_time TEXT DEFAULT '',
    code TEXT DEFAULT '',
    minutes TEXT DEFAULT '0',
    units TEXT DEFAULT '0',

    -- Campos de incidencia (NULL = sin incidencia)
    status TEXT,
    substitute TEXT,
    type TEXT,
    subtype TEXT,
    description TEXT,
    department TEXT,
    feedback TEXT,

    -- Metadatos de control
    published_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    -- Sync Control
    synced_at TIMESTAMPTZ,
    logged_at TIMESTAMPTZ,

    -- Validaciones de formato
    CONSTRAINT schedule_entries_date_format CHECK (date ~ '^\d{4}-\d{2}-\d{2}$'),
    CONSTRAINT schedule_entries_start_time_format CHECK (start_time ~ '^\d{2}:\d{2}$'),
    CONSTRAINT schedule_entries_end_time_format CHECK (end_time = '' OR end_time ~ '^\d{2}:\d{2}$'),
    CONSTRAINT schedule_entries_unique UNIQUE (date, start_time, instructor, program)
);

COMMENT ON TABLE public.schedule_entries IS 'Horarios desglosados y gestión de incidencias diarias';

ALTER TABLE public.schedule_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "schedule_entries_select" ON public.schedule_entries
    FOR SELECT TO authenticated
    USING (
        ((SELECT auth.jwt()) -> 'permissions')::jsonb ? 'schedules.read'
        OR ((SELECT auth.jwt()) -> 'permissions')::jsonb ? 'schedules.manage'
    );

CREATE POLICY "schedule_entries_insert" ON public.schedule_entries
    FOR INSERT TO authenticated
    WITH CHECK (((SELECT auth.jwt()) -> 'permissions')::jsonb ? 'schedules.manage');

CREATE POLICY "schedule_entries_update" ON public.schedule_entries
    FOR UPDATE TO authenticated
    USING (((SELECT auth.jwt()) -> 'permissions')::jsonb ? 'schedules.manage');

CREATE POLICY "schedule_entries_delete" ON public.schedule_entries
    FOR DELETE TO authenticated
    USING (((SELECT auth.jwt()) -> 'permissions')::jsonb ? 'schedules.manage');

-- Índices
CREATE INDEX IF NOT EXISTS idx_schedule_entries_published_by ON public.schedule_entries(published_by);
-- Índice parcial: entradas sin sincronizar
CREATE INDEX IF NOT EXISTS idx_schedule_entries_unsynced ON public.schedule_entries(synced_at)
    WHERE synced_at IS NULL;

-- Trigger: actualizar updated_at automáticamente (función definida en 001)
CREATE TRIGGER update_schedule_entries_modtime
    BEFORE UPDATE ON public.schedule_entries
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- =============================================
-- REALTIME
-- =============================================
-- Habilitar Realtime para tablas de horarios
ALTER PUBLICATION supabase_realtime ADD TABLE public.published_schedules;
ALTER PUBLICATION supabase_realtime ADD TABLE public.schedule_entries;

-- Habilitar REPLICA IDENTITY FULL para profiles (necesario para Realtime updates)
ALTER TABLE public.profiles REPLICA IDENTITY FULL;

-- =============================================
-- PASO MANUAL: Habilitar Realtime para profiles
-- =============================================
-- Dashboard → Database → Replication → seleccionar `profiles` → Save
