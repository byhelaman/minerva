-- ============================================
-- Minerva v2 — 011: Fix Zoom Meetings RLS
-- ============================================
-- Agrega políticas de escritura (INSERT, UPDATE, DELETE) para usuarios autenticados
-- basadas en permisos específicos, ya que zoom-api ahora usa el cliente de usuario.

-- 1. INSERT: Requiere permiso 'meetings.create'
CREATE POLICY "zoom_meetings_insert" ON public.zoom_meetings
    FOR INSERT TO authenticated
    WITH CHECK (
        ((SELECT auth.jwt()) -> 'permissions')::jsonb ? 'meetings.create'
    );

-- 2. UPDATE: Requiere permiso 'meetings.create'
CREATE POLICY "zoom_meetings_update" ON public.zoom_meetings
    FOR UPDATE TO authenticated
    USING (
        ((SELECT auth.jwt()) -> 'permissions')::jsonb ? 'meetings.create'
    )
    WITH CHECK (
        ((SELECT auth.jwt()) -> 'permissions')::jsonb ? 'meetings.create'
    );

-- 3. DELETE: Requiere permiso 'meetings.delete'
CREATE POLICY "zoom_meetings_delete" ON public.zoom_meetings
    FOR DELETE TO authenticated
    USING (
        ((SELECT auth.jwt()) -> 'permissions')::jsonb ? 'meetings.delete'
    );
