-- ============================================
-- Minerva v2 - 008: Realtime Security
-- ============================================
-- Habilita Realtime en la tabla profiles para
-- detectar cambios de rol/permisos en tiempo real

-- Habilitar REPLICA IDENTITY para Realtime
-- Esto permite que Supabase envíe el contenido completo
-- de la fila cuando hay un UPDATE o DELETE
ALTER TABLE public.profiles REPLICA IDENTITY FULL;

-- NOTA: También debes habilitar Realtime para la tabla `profiles`
-- desde el Dashboard de Supabase:
-- Database > Replication > Seleccionar `profiles` > Save
