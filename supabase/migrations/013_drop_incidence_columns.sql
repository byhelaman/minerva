-- ============================================
-- Minerva v2 — 013: Drop incidence columns (hard deprecation)
-- ============================================
-- Removes all incidence columns from schedule_entries and updates dependent SQL objects.

BEGIN;

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
        NEW.branch = UPPER(TRIM(NEW.branch));
        IF NEW.branch LIKE 'HUB%' THEN
            NEW.branch = 'HUB';
        ELSIF NEW.branch LIKE 'MOLINA%' OR NEW.branch LIKE 'LA MOLINA%' THEN
            NEW.branch = 'LA MOLINA';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

ALTER TABLE public.schedule_entries
    DROP COLUMN IF EXISTS status,
    DROP COLUMN IF EXISTS substitute,
    DROP COLUMN IF EXISTS type,
    DROP COLUMN IF EXISTS subtype,
    DROP COLUMN IF EXISTS description,
    DROP COLUMN IF EXISTS department,
    DROP COLUMN IF EXISTS feedback;

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
        SELECT
            date, program, start_time, instructor,
            shift, branch, end_time, code, minutes, units
        FROM public.schedule_entries
        WHERE date = ANY(p_dates)
    ) t;

    RETURN result;
END;
$$;

COMMIT;
