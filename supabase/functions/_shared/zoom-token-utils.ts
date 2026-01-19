// Supabase Edge Function: Shared Zoom Token Utils
// Obtención y refresh automático de tokens de acceso de Zoom

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ZOOM_TOKEN_URL = 'https://zoom.us/oauth/token'
const TOKEN_BUFFER_MS = 5 * 60 * 1000 // 5 minutos antes de expiración

/**
 * Obtiene un token de acceso válido de Zoom.
 * Si el token actual está por expirar, lo refresca automáticamente.
 * 
 * @param supabase - Cliente Supabase con service role
 * @returns Token de acceso válido
 * @throws Error si no hay cuenta conectada o falla el refresh
 */
export async function getValidAccessToken(supabase: SupabaseClient): Promise<string> {
    // 1. Obtener credenciales actuales desde vista desencriptada
    const { data: zoomAccount, error: zoomError } = await supabase
        .from('zoom_credentials_decrypted')
        .select('*')
        .limit(1)
        .single()

    if (zoomError || !zoomAccount) {
        throw new Error('No Zoom account connected')
    }

    // 2. Verificar expiración con buffer de seguridad
    const expiresAt = new Date(zoomAccount.expires_at).getTime()
    const now = Date.now()

    // Si aún es válido, retornar token actual
    if (expiresAt > (now + TOKEN_BUFFER_MS)) {
        return zoomAccount.access_token
    }

    // 3. Token expirando pronto - refrescar
    const clientId = Deno.env.get('ZOOM_CLIENT_ID')
    const clientSecret = Deno.env.get('ZOOM_CLIENT_SECRET')

    if (!clientId || !clientSecret) {
        throw new Error('Zoom OAuth credentials not configured')
    }

    const authString = btoa(`${clientId}:${clientSecret}`)

    // 4. Llamar a Zoom API para refresh
    const params = new URLSearchParams()
    params.append('grant_type', 'refresh_token')
    params.append('refresh_token', zoomAccount.refresh_token)

    const response = await fetch(ZOOM_TOKEN_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${authString}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params
    })

    if (!response.ok) {
        const errorBody = await response.text()
        throw new Error(`Failed to refresh Zoom token: ${errorBody}. Please reconnect credentials.`)
    }

    const data = await response.json()

    // 5. Guardar nuevos tokens en DB (RPC atómico)
    const { error: rpcError } = await supabase.rpc('store_zoom_credentials', {
        p_user_id: zoomAccount.zoom_user_id,
        p_email: zoomAccount.zoom_email,
        p_name: zoomAccount.zoom_name || 'Zoom User',
        p_access_token: data.access_token,
        p_refresh_token: data.refresh_token,
        p_scope: data.scope,
        p_expires_in: data.expires_in
    })

    if (rpcError) {
        throw new Error('Failed to save refreshed token')
    }

    return data.access_token
}
