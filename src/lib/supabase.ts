import { createClient } from "@supabase/supabase-js";
import { logger } from "./logger";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase environment variables");
}

/**
 * Cliente Supabase configurado para aplicaciones de escritorio (Tauri)
 * 
 * Estrategia de sesión para apps desktop:
 * - persistSession: true → guarda tokens en localStorage para sobrevivir cierres de app
 * - autoRefreshToken: true → refresca automáticamente el JWT antes de que expire
 * - detectSessionInUrl: false → no es necesario en desktop (no hay OAuth redirects por URL)
 * - storageKey: personalizado para evitar conflictos
 * 
 * El refresh token tiene una expiración larga (por defecto 7 días en Supabase).
 * Cuando el usuario reabre la app:
 * 1. Se carga la sesión desde localStorage
 * 2. Si el JWT expiró pero el refresh token es válido, se renueva automáticamente
 * 3. Si el refresh token también expiró, el usuario debe re-autenticarse
 */
export const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        // Persistir sesión en localStorage (sobrevive cierres de app)
        persistSession: true,

        // Refrescar token automáticamente antes de que expire
        autoRefreshToken: true,

        // No detectar sesión en URL (no aplica para desktop apps)
        detectSessionInUrl: false,

        // Key única para esta app
        storageKey: "minerva-auth-token",

        // Tipo de almacenamiento (localStorage por defecto, funciona bien en Tauri)
        storage: localStorage,

        // Flow type para login (PKCE es más seguro)
        flowType: "pkce",
    },
    global: {
        // Headers personalizados para identificar la app
        headers: {
            "x-app-name": "minerva-desktop",
            "x-app-version": import.meta.env.VITE_APP_VERSION || "0.1.0",
        },
    },
});

/**
 * Gestión de auto-refresh para aplicaciones desktop (Tauri)
 * 
 * IMPORTANTE: En entornos non-browser como Tauri, Supabase NO puede detectar
 * automáticamente si la app está en primer plano o en background.
 * 
 * Según la documentación oficial:
 * - Llamar startAutoRefresh() cuando la app está en foco
 * - Llamar stopAutoRefresh() cuando la app pierde foco
 * 
 * Esto optimiza recursos y previene refresh innecesarios en background.
 */

// Variable para tracking del estado de auto-refresh
let isAutoRefreshActive = false;

/**
 * Inicia el auto-refresh de sesión
 * Solo debe llamarse cuando la app está en primer plano
 */
export const startSessionRefresh = () => {
    if (!isAutoRefreshActive) {
        supabase.auth.startAutoRefresh();
        isAutoRefreshActive = true;
        logger.debug("[Supabase] Auto-refresh started");
    }
};

/**
 * Detiene el auto-refresh de sesión
 * Debe llamarse cuando la app pasa a background
 */
export const stopSessionRefresh = () => {
    if (isAutoRefreshActive) {
        supabase.auth.stopAutoRefresh();
        isAutoRefreshActive = false;
        logger.debug("[Supabase] Auto-refresh stopped");
    }
};

// Iniciar auto-refresh al cargar (la app inicia en foreground)
startSessionRefresh();

// Listener para manejar cambios de visibilidad del documento
// Esto funciona en Tauri cuando la ventana se minimiza/restaura
if (typeof window !== "undefined" && typeof document !== "undefined") {
    document.addEventListener("visibilitychange", async () => {
        if (document.visibilityState === "visible") {
            // App vuelve a primer plano
            startSessionRefresh();

            // Verificar si la sesión necesita refresh proactivo
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                const expiresAt = session.expires_at;
                const now = Math.floor(Date.now() / 1000);
                const fiveMinutes = 5 * 60;

                // Si el token expira en menos de 5 minutos, refrescar proactivamente
                if (expiresAt && (expiresAt - now) < fiveMinutes) {
                    logger.debug("[Supabase] Token expiring soon - refreshing proactively");
                    await supabase.auth.refreshSession();
                }
            }
        } else {
            // App pasa a background
            stopSessionRefresh();
        }
    });

    // También escuchar eventos de foco de ventana (más confiable en algunas situaciones)
    window.addEventListener("focus", () => {
        startSessionRefresh();
    });

    window.addEventListener("blur", () => {
        stopSessionRefresh();
    });
}
