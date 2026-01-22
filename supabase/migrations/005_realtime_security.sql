-- ============================================
-- Minerva v2 - 005: Realtime Security
-- ============================================
-- Ejecutar después de 004_webhooks_bug_reports.sql.

ALTER TABLE public.profiles REPLICA IDENTITY FULL;

-- Nota: Habilitar Realtime para `profiles` en Dashboard:
-- Database > Replication > seleccionar `profiles` > Save
