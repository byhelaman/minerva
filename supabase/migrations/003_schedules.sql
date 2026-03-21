-- ============================================
-- Minerva v2 — 003: Schedules
-- ============================================
-- published_schedules, schedule_entries (final schema, no incidence columns),
-- sanitization trigger, indexes, and schedule RPCs.
-- Consolidates: 006_schedules_realtime, 008_schedules_optimization,
--               011_step0_index_hardening, 012_deprecate_reports_statistics,
--               013_drop_incidence_columns, 014_recreate_schedule_entries_drop_microsoft
-- Depends on: 001_foundation.sql
-- Note: statistics RPCs (get_daily_stats, etc.) and reporting RPCs
--       (get_schedules_report, batch_delete_schedule_entries) were removed in 012.

-- =============================================
-- 1. PUBLISHED SCHEDULES
-- =============================================
CREATE TABLE IF NOT EXISTS public.published_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    published_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    schedule_date TEXT NOT NULL,
    entries_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT published_schedules_date_format CHECK (schedule_date ~ '^\d{4}-\d{2}-\d{2}$'),
    CONSTRAINT published_schedules_date_unique UNIQUE (schedule_date)
);

COMMENT ON TABLE public.published_schedules IS 'Horarios publicados por admins para distribución a usuarios';

ALTER TABLE public.published_schedules ENABLE ROW LEVEL SECURITY;

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

-- Note: idx_published_schedules_date (non-unique) omitted — the UNIQUE constraint
-- already creates an index on schedule_date (see 011_step0_index_hardening).
CREATE INDEX IF NOT EXISTS idx_published_schedules_created ON public.published_schedules(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_published_schedules_published_by ON public.published_schedules(published_by);

CREATE TRIGGER update_published_schedules_modtime
    BEFORE UPDATE ON public.published_schedules
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- =============================================
-- 2. SCHEDULE ENTRIES (final schema — no incidence columns)
-- =============================================
CREATE TABLE public.schedule_entries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

    date TEXT NOT NULL,
    shift TEXT DEFAULT '',
    branch TEXT DEFAULT '',
    start_time TEXT NOT NULL,
    end_time TEXT DEFAULT '',
    code TEXT DEFAULT '',
    instructor TEXT NOT NULL,
    program TEXT NOT NULL,
    minutes TEXT DEFAULT '0',
    units TEXT DEFAULT '0',

    published_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT schedule_entries_date_format CHECK (date ~ '^\d{4}-\d{2}-\d{2}$'),
    CONSTRAINT schedule_entries_start_time_format CHECK (start_time ~ '^\d{2}:\d{2}$'),
    CONSTRAINT schedule_entries_end_time_format CHECK (end_time = '' OR end_time ~ '^\d{2}:\d{2}$'),
    CONSTRAINT schedule_entries_unique UNIQUE (date, start_time, instructor, program),
    CONSTRAINT schedule_entries_instructor_not_empty CHECK (TRIM(instructor) <> ''),
    CONSTRAINT schedule_entries_program_not_empty CHECK (TRIM(program) <> '')
);

COMMENT ON TABLE public.schedule_entries IS 'Horarios base sin campos de incidencias';

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

CREATE INDEX IF NOT EXISTS idx_schedule_entries_published_by ON public.schedule_entries(published_by);
CREATE INDEX IF NOT EXISTS idx_schedule_entries_date ON public.schedule_entries(date);
CREATE INDEX IF NOT EXISTS idx_schedule_entries_date_start_time ON public.schedule_entries(date, start_time);
CREATE INDEX IF NOT EXISTS idx_schedule_entries_month ON public.schedule_entries(SUBSTRING(date, 1, 7));

-- =============================================
-- 3. SANITIZATION TRIGGER
-- =============================================

CREATE OR REPLACE FUNCTION public.sanitize_schedule_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.start_time IS NOT NULL AND NEW.start_time ~ '^\d{1,2}:\d{2}' THEN
        NEW.start_time = LPAD(SPLIT_PART(NEW.start_time, ':', 1), 2, '0') || ':' || SUBSTRING(SPLIT_PART(NEW.start_time, ':', 2), 1, 2);
    END IF;

    IF NEW.end_time IS NOT NULL AND NEW.end_time <> '' AND NEW.end_time ~ '^\d{1,2}:\d{2}' THEN
        NEW.end_time = LPAD(SPLIT_PART(NEW.end_time, ':', 1), 2, '0') || ':' || SUBSTRING(SPLIT_PART(NEW.end_time, ':', 2), 1, 2);
    END IF;

    IF NEW.instructor IS NOT NULL THEN
        NEW.instructor = NULLIF(REGEXP_REPLACE(TRIM(NEW.instructor), '\s+', ' ', 'g'), '');
        IF NEW.instructor IS NULL THEN
            NEW.instructor = 'none';
        END IF;
    END IF;

    IF NEW.program IS NOT NULL THEN
        NEW.program = NULLIF(REGEXP_REPLACE(TRIM(NEW.program), '\s+', ' ', 'g'), '');
    END IF;

    IF NEW.branch IS NOT NULL THEN
        NEW.branch = NULLIF(REGEXP_REPLACE(TRIM(NEW.branch), '\s+', ' ', 'g'), '');
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER update_schedule_entries_modtime
    BEFORE UPDATE ON public.schedule_entries
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_sanitize_schedule_entry
    BEFORE INSERT OR UPDATE ON public.schedule_entries
    FOR EACH ROW
    EXECUTE FUNCTION public.sanitize_schedule_entry();

-- =============================================
-- 4. REALTIME
-- =============================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.published_schedules;
ALTER PUBLICATION supabase_realtime ADD TABLE public.schedule_entries;
ALTER TABLE public.profiles REPLICA IDENTITY FULL;

-- =============================================
-- 5. SCHEDULE RPCs
-- =============================================

CREATE OR REPLACE FUNCTION public.get_schedules_by_dates(p_dates TEXT[])
RETURNS SETOF public.schedule_entries
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.has_permission('schedules.read') AND NOT public.has_permission('schedules.manage') THEN
        RAISE EXCEPTION 'Permiso denegado: requiere schedules.read o schedules.manage';
    END IF;
    IF array_length(p_dates, 1) > 90 THEN
        RAISE EXCEPTION 'Too many dates requested (max 90)';
    END IF;
    RETURN QUERY
        SELECT * FROM public.schedule_entries
        WHERE date = ANY(p_dates)
        ORDER BY date, start_time;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_schedules_by_dates_v2(p_dates TEXT[])
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    result json;
BEGIN
    IF NOT (public.has_permission('schedules.read') OR public.has_permission('schedules.manage')) THEN
        RAISE EXCEPTION 'Permission denied';
    END IF;
    IF array_length(p_dates, 1) > 90 THEN
        RAISE EXCEPTION 'Too many dates requested (max 90)';
    END IF;
    SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO result
    FROM (
        SELECT date, program, start_time, instructor,
               shift, branch, end_time, code, minutes, units
        FROM public.schedule_entries
        WHERE date = ANY(p_dates)
    ) t;
    RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_existing_keys_by_dates(p_dates TEXT[])
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    result json;
BEGIN
    IF NOT (public.has_permission('schedules.read') OR public.has_permission('schedules.manage')) THEN
        RAISE EXCEPTION 'Permission denied';
    END IF;
    IF array_length(p_dates, 1) > 90 THEN
        RAISE EXCEPTION 'Too many dates requested (max 90)';
    END IF;
    SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO result
    FROM (
        SELECT date, program, start_time, instructor
        FROM public.schedule_entries
        WHERE date = ANY(p_dates)
    ) t;
    RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_published_by_dates(p_dates TEXT[])
RETURNS SETOF public.published_schedules
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.has_permission('schedules.read') AND NOT public.has_permission('schedules.manage') THEN
        RAISE EXCEPTION 'Permiso denegado: requiere schedules.read o schedules.manage';
    END IF;
    IF array_length(p_dates, 1) > 90 THEN
        RAISE EXCEPTION 'Too many dates requested (max 90)';
    END IF;
    RETURN QUERY
        SELECT * FROM public.published_schedules
        WHERE schedule_date = ANY(p_dates)
        ORDER BY schedule_date;
END;
$$;

-- =============================================
-- 6. GRANTS
-- =============================================
GRANT EXECUTE ON FUNCTION public.get_schedules_by_dates(TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_schedules_by_dates_v2(TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_existing_keys_by_dates(TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_published_by_dates(TEXT[]) TO authenticated;

-- =============================================
-- MANUAL STEP: Enable Realtime for profiles
-- =============================================
-- Dashboard → Database → Replication → select 'profiles' → Save
