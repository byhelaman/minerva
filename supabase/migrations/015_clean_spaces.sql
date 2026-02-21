-- ============================================
-- Minerva v2 — 015: Clean Internal Whitespaces
-- ============================================
-- Fixes an issue where internal consecutive spaces 
-- (like 'Juan                  Perez')
-- were bypassing the TRIM() function and being stored,
-- but masked by HTML visual collapsing in Supabase Studio.

-- 1. Retroactively clean existing records to prevent duplicates
UPDATE public.schedule_entries
SET instructor = REGEXP_REPLACE(TRIM(instructor), '\s+', ' ', 'g'),
    program = REGEXP_REPLACE(TRIM(program), '\s+', ' ', 'g');

-- 2. Update the trigger to definitively clean all future inserts/updates
CREATE OR REPLACE FUNCTION public.sanitize_schedule_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.type IS NOT NULL THEN
        NEW.type = NULLIF(TRIM(NEW.type), '');
    END IF;
    
    IF NEW.subtype IS NOT NULL THEN
        NEW.subtype = NULLIF(TRIM(NEW.subtype), '');
    END IF;
    
    IF NEW.department IS NOT NULL THEN
        NEW.department = NULLIF(TRIM(NEW.department), '');
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
    
    -- Branch normalization (UPPER and standardize)
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
