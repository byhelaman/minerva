-- ============================================
-- Minerva v2 — 011: Step 0 Index Hardening
-- ============================================
-- Objetivo:
-- 1) eliminar redundancia de índice en published_schedules
-- 2) mejorar rutas de consulta en schedule_entries y pool_rules
--
-- Nota: aplicar después de 010_pools_rules.sql

-- ============================================================
-- published_schedules: eliminar índice redundante en schedule_date
-- ============================================================
-- Ya existe unique index `published_schedules_date_unique` sobre (schedule_date).
-- El índice no-único adicional en la misma columna es redundante.
DROP INDEX IF EXISTS public.idx_published_schedules_date;

-- ============================================================
-- schedule_entries: acelerar filtros y orden por fecha/hora
-- ============================================================
-- date sigue como TEXT (YYYY-MM-DD), por lo que btree conserva orden lexicográfico útil.
CREATE INDEX IF NOT EXISTS idx_schedule_entries_date
ON public.schedule_entries(date);

CREATE INDEX IF NOT EXISTS idx_schedule_entries_date_start_time
ON public.schedule_entries(date, start_time);

-- ============================================================
-- pool_rules: acelerar lectura por owner y estado
-- ============================================================
-- get_my_pool_rules() filtra owner_id y ordena por updated_at DESC.
CREATE INDEX IF NOT EXISTS idx_pool_rules_owner_updated
ON public.pool_rules(owner_id, updated_at DESC);

-- Consultas comunes de reglas activas por owner.
CREATE INDEX IF NOT EXISTS idx_pool_rules_owner_active
ON public.pool_rules(owner_id)
WHERE is_active = true;
