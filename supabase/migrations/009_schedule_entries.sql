-- ============================================
-- Minerva v2 - 009: Schedule Entries
-- ============================================
-- Tabla principal para los horarios desglosados (una fila por clase).
-- Permite incidencias individuales y sync granular.

CREATE TABLE IF NOT EXISTS public.schedule_entries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

    -- Clave compuesta lógica (Unique constraint abajo)
    date TEXT NOT NULL,         -- 'YYYY-MM-DD'
    program TEXT NOT NULL,
    start_time TEXT NOT NULL,   -- 'HH:mm'
    instructor TEXT NOT NULL,

    -- Campos base del horario (importados de Excel)
    shift TEXT DEFAULT '',
    branch TEXT DEFAULT '',
    end_time TEXT DEFAULT '',
    code TEXT DEFAULT '',
    minutes TEXT DEFAULT '0',   -- Se guarda como texto para evitar precision issues si viene sucio, o integer
    units TEXT DEFAULT '0',
    
    -- Campos de incidencia (NULL = sin incidencia)
    status TEXT,                -- 'Yes', 'No'.
    substitute TEXT,            -- Nombre del sustituto
    type TEXT,                  -- 'Falta', 'Permiso', 'Enfermedad', etc.
    subtype TEXT,               -- Detalle adicional
    description TEXT,           -- Comentarios libres
    department TEXT,            -- Para reportes
    feedback TEXT,              -- Feedback del instructor/admin

    -- Metadatos de control
    published_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    -- Sync Control
    synced_at TIMESTAMPTZ,      -- Cuándo se escribió en el Excel de horarios (Worksheet)
    logged_at TIMESTAMPTZ,      -- Cuándo se escribió en el Log de Incidencias

    CONSTRAINT schedule_entries_unique UNIQUE(date, program, start_time, instructor)
);

COMMENT ON TABLE public.schedule_entries IS 'Horarios desglosados y gestión de incidencias diarias';

-- =============================================
-- RLS POLICIES
-- =============================================
ALTER TABLE public.schedule_entries ENABLE ROW LEVEL SECURITY;

-- SELECT: Combined check
CREATE POLICY "schedule_entries_select" ON public.schedule_entries
    FOR SELECT TO authenticated
    USING (
        ((select auth.jwt()) -> 'permissions')::jsonb ? 'schedules.read'
        OR
        ((select auth.jwt()) -> 'permissions')::jsonb ? 'schedules.manage'
    );

-- WRITE: Explicit policies for admins
CREATE POLICY "schedule_entries_insert" ON public.schedule_entries
    FOR INSERT TO authenticated
    WITH CHECK (((select auth.jwt()) -> 'permissions')::jsonb ? 'schedules.manage');

CREATE POLICY "schedule_entries_update" ON public.schedule_entries
    FOR UPDATE TO authenticated
    USING (((select auth.jwt()) -> 'permissions')::jsonb ? 'schedules.manage');

CREATE POLICY "schedule_entries_delete" ON public.schedule_entries
    FOR DELETE TO authenticated
    USING (((select auth.jwt()) -> 'permissions')::jsonb ? 'schedules.manage');

-- =============================================
-- REALTIME
-- =============================================
-- Importante para que el dashboard se actualice si otro admin cambia incidencias
ALTER PUBLICATION supabase_realtime ADD TABLE public.schedule_entries;

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX IF NOT EXISTS idx_schedule_entries_date ON public.schedule_entries(date);
CREATE INDEX IF NOT EXISTS idx_schedule_entries_sync ON public.schedule_entries(synced_at) WHERE synced_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_schedule_entries_instructor ON public.schedule_entries(instructor);

-- =============================================
-- TRIGGERS
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

CREATE TRIGGER update_schedule_entries_modtime
    BEFORE UPDATE ON public.schedule_entries
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();
