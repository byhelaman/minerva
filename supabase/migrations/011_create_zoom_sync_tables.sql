-- 011_create_zoom_sync_tables.sql
-- Crear tablas para Usuarios y Reuniones de Zoom (Datos Sincronizados)
-- Complementa a 009_zoom_connection.sql

-- 1. Usuarios de Zoom
CREATE TABLE IF NOT EXISTS public.zoom_users (
    id TEXT PRIMARY KEY, -- ID de Usuario de Zoom es texto
    email TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    display_name TEXT,
    created_at TIMESTAMPTZ,
    synced_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.zoom_users ENABLE ROW LEVEL SECURITY;

-- Políticas para zoom_users
-- LECTURA: Usuarios con hierarchy_level >= 50 (Operador, Admin, Super Admin)
-- Optimizado: Usa claims de auth.jwt() para evitar joins con tablas profiles/roles
CREATE POLICY "Allow read for valid roles" ON public.zoom_users
    FOR SELECT TO authenticated
    USING (
        -- Granular Permission: meetings.search
        ((auth.jwt() -> 'permissions')::jsonb ? 'meetings.search')
    );

CREATE POLICY "Allow full access for service_role" ON public.zoom_users
    FOR ALL TO service_role USING (true) WITH CHECK (true);


-- 2. Reuniones de Zoom
CREATE TABLE IF NOT EXISTS public.zoom_meetings (
    meeting_id TEXT PRIMARY KEY, -- ID de Mensaje de Zoom
    uuid TEXT,
    host_id TEXT NOT NULL, -- Referencia a zoom_users(id)
    topic TEXT,
    type INTEGER,
    start_time TIMESTAMPTZ,
    duration INTEGER,
    timezone TEXT,
    join_url TEXT,
    created_at TIMESTAMPTZ,
    synced_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.zoom_meetings ENABLE ROW LEVEL SECURITY;

-- Políticas para zoom_meetings
-- LECTURA: Usuarios con hierarchy_level >= 50 (Operador, Admin, Super Admin)
CREATE POLICY "Allow read for valid roles" ON public.zoom_meetings
    FOR SELECT TO authenticated
    USING (
        -- Granular Permission: meetings.search
        ((auth.jwt() -> 'permissions')::jsonb ? 'meetings.search')
    );

CREATE POLICY "Allow full access for service_role" ON public.zoom_meetings
    FOR ALL TO service_role USING (true) WITH CHECK (true);
