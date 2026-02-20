// =============================================
// Utilidad compartida para el manejo de Errores en Edge Functions
// =============================================
// Estandariza la respuesta de errores considerando cabeceras de CORS.

/**
 * Procesa un error capturado en el bloque catch principal de una Edge Function.
 * - Errores de "Unauthorized" devuelven status 401.
 * - Otros errores devuelven status 500 y no exponen detalles internos excesivos por seguridad.
 *
 * @param error - El error capturado (generalmente de tipo `unknown`)
 * @param corsHeaders - Las cabeceras CORS construidas para esta funcion.
 * @returns Una respuesta HTTP estandarizada en formato JSON (Response)
 */
export function handleEdgeError(error: unknown, corsHeaders: Record<string, string>): Response {
    console.error('Edge Function Error:', error instanceof Error ? error.message : 'Unknown Error')

    const message = error instanceof Error ? error.message : 'Unknown error'
    const isAuthError = message.startsWith('Unauthorized')

    return new Response(JSON.stringify({ error: isAuthError ? message : 'Internal server error' }), {
        status: isAuthError ? 401 : 500,
        headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
        }
    });
}

export function jsonResponse(data: unknown, status = 200, corsHeaders: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
}
