-- ============================================
-- Minerva v2 — 012: Deprecate Reports/Statistics/Incidences
-- ============================================
-- Scope:
-- 1) Remove reports permissions from RBAC.
-- 2) Drop RPCs used only by Reports/Statistics.
-- 3) Clean legacy incidence data from schedule entries.
-- 4) Clear deprecated Microsoft incidences configuration.

BEGIN;

-- =============================================
-- 1. RBAC cleanup (reports permissions)
-- =============================================
DELETE FROM public.role_permissions
WHERE permission IN ('reports.view', 'reports.manage');

DELETE FROM public.permissions
WHERE name IN ('reports.view', 'reports.manage');

-- =============================================
-- 2. Remove Reports/Statistics RPC surface
-- =============================================
REVOKE EXECUTE ON FUNCTION public.get_daily_stats(TEXT, TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_monthly_incidence_rate(TEXT, TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_incidence_types(TEXT, TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_period_comparison(TEXT, TEXT, TEXT, TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_branch_stats(TEXT, TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_schedules_report(TEXT, TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.batch_delete_schedule_entries(jsonb) FROM authenticated;

DROP FUNCTION IF EXISTS public.get_daily_stats(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.get_monthly_incidence_rate(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.get_incidence_types(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.get_period_comparison(TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.get_branch_stats(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.get_schedules_report(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.batch_delete_schedule_entries(jsonb);

-- =============================================
-- 3. Legacy incidences data cleanup
-- =============================================
UPDATE public.schedule_entries
SET
    status = NULL,
    substitute = NULL,
    type = NULL,
    subtype = NULL,
    description = NULL,
    department = NULL,
    feedback = NULL
WHERE
    status IS NOT NULL
    OR substitute IS NOT NULL
    OR type IS NOT NULL
    OR subtype IS NOT NULL
    OR description IS NOT NULL
    OR department IS NOT NULL
    OR feedback IS NOT NULL;

-- =============================================
-- 4. Microsoft deprecated incidences config cleanup
-- =============================================
UPDATE public.microsoft_account
SET
    incidences_file_id = NULL,
    incidences_file_name = NULL,
    incidences_worksheet_id = NULL,
    incidences_worksheet_name = NULL,
    incidences_table_id = NULL,
    incidences_table_name = NULL,
    updated_at = now()
WHERE
    incidences_file_id IS NOT NULL
    OR incidences_file_name IS NOT NULL
    OR incidences_worksheet_id IS NOT NULL
    OR incidences_worksheet_name IS NOT NULL
    OR incidences_table_id IS NOT NULL
    OR incidences_table_name IS NOT NULL;

COMMIT;
