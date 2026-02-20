// =============================================
// Utilidad CORS compartida para Edge Functions
// =============================================
// Centraliza la validación de dominios permitidos (origins) y cabeceras CORS.
// Permite anulación mediante la variable de entorno ALLOWED_ORIGINS.

const DEFAULT_ORIGINS = [
    'http://localhost:1420',
    'tauri://localhost',
    'http://tauri.localhost',
]

const ALLOWED_ORIGINS: string[] = (() => {
    const envOrigins = Deno.env.get('ALLOWED_ORIGINS')
    if (envOrigins) {
        return envOrigins.split(',').map(o => o.trim()).filter(Boolean)
    }
    return DEFAULT_ORIGINS
})()

/**
 * Genera cabeceras CORS para una petición.
 * Valida el domain origen de la petición frente a la lista permitida.
 * Incluye un conjunto de todas las cabeceras/métodos utilizados a lo largo del proyecto.
 */
export function getCorsHeaders(req: Request): Record<string, string> {
    const origin = req.headers.get('origin') || ''
    const isAllowed = ALLOWED_ORIGINS.includes(origin)
    return {
        'Access-Control-Allow-Origin': isAllowed ? origin : 'null',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-name, x-app-version, x-internal-key, x-zm-signature, x-zm-request-timestamp',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    }
}
