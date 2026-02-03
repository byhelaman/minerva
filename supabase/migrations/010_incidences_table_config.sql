-- ============================================
-- Minerva v2 - 010: Incidences Table Configuration
-- ============================================
-- Agrega configuración granular para vincular archivo, hoja y tabla de Excel
-- para el archivo de log de incidencias.

-- =============================================
-- AGREGAR COLUMNAS
-- =============================================
ALTER TABLE public.microsoft_account
ADD COLUMN IF NOT EXISTS incidences_worksheet_id TEXT,
ADD COLUMN IF NOT EXISTS incidences_worksheet_name TEXT,
ADD COLUMN IF NOT EXISTS incidences_table_id TEXT,
ADD COLUMN IF NOT EXISTS incidences_table_name TEXT;

COMMENT ON COLUMN public.microsoft_account.incidences_worksheet_id IS 'ID de la hoja (worksheet) en Excel donde está la tabla de incidencias';
COMMENT ON COLUMN public.microsoft_account.incidences_worksheet_name IS 'Nombre de la hoja para display en UI';
COMMENT ON COLUMN public.microsoft_account.incidences_table_id IS 'ID de la tabla de Excel con datos de incidencias';
COMMENT ON COLUMN public.microsoft_account.incidences_table_name IS 'Nombre de la tabla para display en UI';

-- =============================================
-- ACTUALIZAR RPC: update_microsoft_config
-- =============================================
CREATE OR REPLACE FUNCTION update_microsoft_config(
    p_type TEXT,
    p_id TEXT,
    p_name TEXT,
    p_worksheet_id TEXT DEFAULT NULL,
    p_worksheet_name TEXT DEFAULT NULL,
    p_table_id TEXT DEFAULT NULL,
    p_table_name TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_type = 'schedules_folder' THEN
        UPDATE public.microsoft_account
        SET
            schedules_folder_id = p_id,
            schedules_folder_name = p_name,
            updated_at = now()
        WHERE id IS NOT NULL;

    ELSIF p_type = 'incidences_file' THEN
        UPDATE public.microsoft_account
        SET
            incidences_file_id = p_id,
            incidences_file_name = p_name,
            incidences_worksheet_id = p_worksheet_id,
            incidences_worksheet_name = p_worksheet_name,
            incidences_table_id = p_table_id,
            incidences_table_name = p_table_name,
            updated_at = now()
        WHERE id IS NOT NULL;

    ELSE
        RAISE EXCEPTION 'Invalid config type: %', p_type;
    END IF;
END;
$$;

COMMENT ON FUNCTION update_microsoft_config IS 'Actualiza la configuración de Microsoft OneDrive con soporte para worksheet + tabla';
