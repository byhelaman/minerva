// Centralized constants for file operations

// Archivos Físicos (AppLocalData)
export const STORAGE_FILES = {
    APP_SETTINGS: "minerva_app_settings.json",
    EXCEL_DATA_MIRROR: "minerva_excel_data_mirror.json",
    SCHEDULES_DRAFT: "minerva_schedules_draft.json",
    // INCIDENCES_LOG: "minerva_incidences_log.json",
};

// Claves de LocalStorage
export const STORAGE_KEYS = {
    // Configuración de Conexión
    CONNECTION_CONFIG: "minerva_connection_config", // ID y nombre del archivo conectado

    // Caché de UI (Reports)
    UI_SHEETS_CACHE_PREFIX: "minerva_ui_sheets_cache_", // + FileID
    UI_LAST_VIEWED_SHEET_PREFIX: "minerva_ui_last_viewed_sheet_", // + FileID

    // Autenticación y Usuario
    AUTH_LAST_EMAIL: "minerva_auth_last_email",
    RATE_LIMIT: "minerva_rate_limit",

    // Preferencias
    THEME: "vite-ui-theme", // Mantener default de vite-plugin-theme o cambiar si se controla manual
    LOCALE: "minerva_locale",
};

// Legacy constants for gradual migration (or to be removed)
export const LEGACY_FILES = {
    SETTINGS: "minerva-settings.json",
    AUTOSAVE: "schedule_autosave.json",
    INCIDENCES: "incidences.json",
    CACHE: "linked_source_cache.json"
};
