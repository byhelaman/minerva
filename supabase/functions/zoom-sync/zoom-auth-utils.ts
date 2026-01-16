import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ZOOM_TOKEN_URL = 'https://zoom.us/oauth/token'

export async function getValidAccessToken(supabase: SupabaseClient) {
    // 1. Obtener credenciales actuales
    const { data: zoomAccount, error: zoomError } = await supabase
        .from('zoom_credentials_decrypted')
        .select('*')
        .limit(1)
        .single()

    if (zoomError || !zoomAccount) {
        throw new Error('No Zoom account connected')
    }

    // 2. Verificar expiración (Buffer de 5 minutos)
    const expiresAt = new Date(zoomAccount.expires_at).getTime()
    const now = Date.now()
    const bufferMs = 5 * 60 * 1000 // 5 minutos

    // Si aún es válido, retornar token actual
    if (expiresAt > (now + bufferMs)) {
        console.log('Token valid')
        return zoomAccount.access_token
    }

    console.log('Token refresh required')

    // 3. Preparar credenciales para Refresh
    const clientId = Deno.env.get('ZOOM_CLIENT_ID')!
    const clientSecret = Deno.env.get('ZOOM_CLIENT_SECRET')!
    const authString = btoa(`${clientId}:${clientSecret}`)

    // 4. Llamar a Zoom API
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
        console.error('Token refresh failed')
        throw new Error(`Failed to refresh Zoom token: ${errorBody}. Please reconnect credentials.`)
    }

    const data = await response.json()

    // 5. Guardar nuevos tokens en DB (RPC Atomic)
    const { error: rpcError } = await supabase.rpc('store_zoom_credentials', {
        p_user_id: zoomAccount.zoom_user_id, // Mantenemos el ID original
        p_email: zoomAccount.zoom_email,
        p_name: zoomAccount.zoom_name || 'Zoom User',
        p_access_token: data.access_token,
        p_refresh_token: data.refresh_token,
        p_scope: data.scope,
        p_expires_in: data.expires_in
    })

    if (rpcError) {
        console.error('Credential storage failed')
        throw new Error('Failed to save refreshed token')
    }

    console.log('Token refresh complete')
    return data.access_token
}
