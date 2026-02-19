// =============================================
// Shared CORS Utility for Edge Functions
// =============================================
// Centralizes origin validation and CORS headers.
// Supports ALLOWED_ORIGINS env var override.

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
 * Generate CORS headers for a request.
 * Validates the request origin against the allowed list.
 * Includes a superset of all headers/methods used across the project.
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
