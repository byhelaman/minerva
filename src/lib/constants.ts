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
    // Autenticación y Usuario
    AUTH_LAST_EMAIL: "minerva_auth_last_email",
    RATE_LIMIT: "minerva_rate_limit",

    // Preferencias
    THEME: "vite-ui-theme",

    // Chat
    CHAT_SESSION: "minerva_chat_session",
};

export const CHAT_SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
