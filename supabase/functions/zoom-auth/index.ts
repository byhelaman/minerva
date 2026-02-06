// Supabase Edge Function: zoom-auth
// Maneja el flujo de autenticación (Server-to-Server OAuth)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyPermission } from '../_shared/auth-utils.ts'

const ZOOM_CLIENT_ID = Deno.env.get('ZOOM_CLIENT_ID')!
const ZOOM_CLIENT_SECRET = Deno.env.get('ZOOM_CLIENT_SECRET')!
const ZOOM_REDIRECT_URI = Deno.env.get('ZOOM_REDIRECT_URI')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// SEGURIDAD: Restringir orígenes CORS
// Agrega tu dominio de producción u orígenes específicos de Tauri aquí
const ALLOWED_ORIGINS = [
    'http://localhost:1420',
    'tauri://localhost',
    'http://tauri.localhost',
]

function getCorsHeaders(req: Request) {
    const origin = req.headers.get('origin') || ''
    const isAllowed = ALLOWED_ORIGINS.includes(origin)
    return {
        'Access-Control-Allow-Origin': isAllowed ? origin : 'null',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-name, x-app-version',
    }
}

serve(async (req: Request) => {
    const url = new URL(req.url)
    const path = url.pathname.split('/').pop()
    const corsHeaders = getCorsHeaders(req)

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // 1. Path-based (Callbacks / Legacy)
        switch (path) {
            case 'init': return await handleInit(req, corsHeaders)
            case 'callback': return await handleCallback(url, corsHeaders)
            case 'status': return await handleStatus(req, corsHeaders)
            case 'disconnect': return await handleDisconnect(req, corsHeaders)
        }

        // 2. Action-based (Supabase Invoke POST)
        if (path === 'zoom-auth' && req.method === 'POST') {
            const body = await req.json().catch(() => ({}))
            const action = body.action

            switch (action) {
                case 'init': return await handleInit(req, corsHeaders)
                case 'status': return await handleStatus(req, corsHeaders)
                case 'disconnect': return await handleDisconnect(req, corsHeaders)
                default:
                    console.error('Invalid action received')
                    return new Response(JSON.stringify({ error: `Acción desconocida: ${action}` }), {
                        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    })
            }
        }

        // Default Error
        return new Response(JSON.stringify({ error: `Endpoint no encontrado para path: ${path}` }), {
            status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    } catch (error: unknown) {
        console.error('Auth error')
        const message = error instanceof Error ? error.message : 'Unknown error'
        return new Response(JSON.stringify({ error: message }), {
            status: message === 'Unauthorized' ? 401 : 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
})

// === INIT ===
async function handleInit(req: Request, corsHeaders: Record<string, string>): Promise<Response> {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // Verificación RBAC (Permiso: system.manage)
    const user = await verifyPermission(req, supabase, 'system.manage')

    // Crear estado
    const { data: state, error: stateError } = await supabase.rpc('create_oauth_state', {
        p_user_id: user.id
    })

    if (stateError || !state) {
        throw new Error('Error al crear estado OAuth')
    }

    const authUrl = new URL('https://zoom.us/oauth/authorize')
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('client_id', ZOOM_CLIENT_ID)
    authUrl.searchParams.set('redirect_uri', ZOOM_REDIRECT_URI)
    authUrl.searchParams.set('state', state)

    return new Response(JSON.stringify({ url: authUrl.toString() }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
}

// === CALLBACK ===
async function handleCallback(url: URL, corsHeaders: Record<string, string>): Promise<Response> {
    // El callback viene de Zoom, NO del cliente directamente (navegador).
    // Validamos STATE para vincularlo al usuario que lo inició.

    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    const error = url.searchParams.get('error')

    if (error) return new Response(`Error: ${error}`, { status: 400 })
    if (!code || !state) return new Response('Falta código o estado', { status: 400 })

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // Validar Estado
    const { data: userId, error: stateError } = await supabase.rpc('validate_oauth_state', {
        p_state: state
    })

    if (stateError || !userId) {
        return new Response('Estado inválido o expirado', { status: 400 })
    }

    // Intercambiar Token
    const tokenResponse = await fetch('https://zoom.us/oauth/token', {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${btoa(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`)}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: ZOOM_REDIRECT_URI
        })
    })

    if (!tokenResponse.ok) {
        const err = await tokenResponse.json()
        return new Response(`Zoom Error: ${JSON.stringify(err)}`, { status: 400 })
    }

    const tokens = await tokenResponse.json()

    // Obtener Info del Usuario
    const userResponse = await fetch('https://api.zoom.us/v2/users/me', {
        headers: { 'Authorization': `Bearer ${tokens.access_token}` }
    })

    if (!userResponse.ok) return new Response('Error al obtener info del usuario', { status: 400 })
    const zoomUser = await userResponse.json()

    // Guardar en Vault vía RPC (Atómico)
    const { error: rpcError } = await supabase.rpc('store_zoom_credentials', {
        p_user_id: userId, // Usar userId validado por state, no zoomUser.id
        p_email: zoomUser.email,
        p_name: `${zoomUser.first_name} ${zoomUser.last_name}`.trim(),
        p_access_token: tokens.access_token,
        p_refresh_token: tokens.refresh_token,
        p_scope: tokens.scope,
        p_expires_in: tokens.expires_in
    })

    if (rpcError) {
        console.error('Credential storage failed')
        return new Response(`Error de Base de Datos: ${rpcError.message}`, { status: 500 })
    }

    return new Response('Zoom conectado exitosamente!\nPuedes cerrar esta ventana.', {
        headers: { 'Content-Type': 'text/plain' }
    })
}

// === STATUS ===
async function handleStatus(req: Request, corsHeaders: Record<string, string>): Promise<Response> {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // Verificación RBAC (Permiso: system.manage)
    await verifyPermission(req, supabase, 'system.manage')

    // Seleccionamos campos no sensibles. NO seleccionamos IDs de secretos aquí.
    const { data: account, error } = await supabase
        .from('zoom_account')
        .select('zoom_email, zoom_name, expires_at, connected_at')
        .single()

    if (error || !account) {
        return new Response(JSON.stringify({ connected: false }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }

    return new Response(JSON.stringify({
        connected: true,
        account: {
            email: account.zoom_email,
            name: account.zoom_name,
            expires_at: account.expires_at,
            connected_at: account.connected_at
        }
    }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
}

// === DISCONNECT ===
async function handleDisconnect(req: Request, corsHeaders: Record<string, string>): Promise<Response> {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // Verificación RBAC (Permiso: system.manage)
    await verifyPermission(req, supabase, 'system.manage')

    try {
        // 1. Leer IDs de secretos del Vault antes de borrar la cuenta
        const { data: account, error: fetchError } = await supabase
            .from('zoom_account')
            .select('access_token_id, refresh_token_id')
            .single()

        if (fetchError) {
            console.warn('No Zoom account found to disconnect')
            return new Response(JSON.stringify({ success: true, message: 'No account to disconnect' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // 2. Eliminar secretos del Vault si existen
        if (account?.access_token_id && account?.refresh_token_id) {
            const secretIds = [account.access_token_id, account.refresh_token_id]
            const { error: deleteSecretsError } = await supabase.rpc('delete_zoom_secrets', {
                p_secret_ids: secretIds
            })

            if (deleteSecretsError) {
                console.error('Failed to delete Vault secrets:', deleteSecretsError)
                // Continue anyway — account deletion is more important
            }
        }

        // 3. Eliminar la cuenta Zoom
        const { error: deleteAccountError } = await supabase
            .from('zoom_account')
            .delete()
            .not('id', 'is', null)

        if (deleteAccountError) {
            throw new Error(`Failed to delete Zoom account: ${deleteAccountError.message}`)
        }

        return new Response(JSON.stringify({ success: true, message: 'Zoom account disconnected' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to disconnect Zoom'
        console.error('Disconnect error:', message)
        return new Response(JSON.stringify({ error: message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
}
