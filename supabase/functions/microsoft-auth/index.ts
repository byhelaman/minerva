// Supabase Edge Function: microsoft-auth
// Handles authentication flow (Server-to-Server OAuth) for Microsoft

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyPermission } from '../_shared/auth-utils.ts'

const MS_CLIENT_ID = Deno.env.get('MS_CLIENT_ID')!
const MS_CLIENT_SECRET = Deno.env.get('MS_CLIENT_SECRET')!
const MS_REDIRECT_URI = Deno.env.get('MS_REDIRECT_URI')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// SECURITY: Restrict CORS origins
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
        if (path === 'microsoft-auth' && req.method === 'POST') {
            const body = await req.json().catch(() => ({}))
            const action = body.action

            switch (action) {
                case 'init': return await handleInit(req, corsHeaders)
                case 'status': return await handleStatus(req, corsHeaders)
                case 'disconnect': return await handleDisconnect(req, corsHeaders)
                case 'update-config': return await handleUpdateConfig(req, body, corsHeaders)
                default:
                    console.error('Invalid action received')
                    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
                        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    })
            }
        }

        // Default Error
        return new Response(JSON.stringify({ error: `Endpoint not found for path: ${path}` }), {
            status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    } catch (error: any) {
        console.error('Auth error', error)
        const message = error instanceof Error ? error.message : 'Unknown error'
        return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
})

// === INIT, CALLBACK === (Unchanged, so we keep previous logic if we were editing partially, but here we replace all to be safe or use partials. 
// Since replace_file_content replaces a block, I will include INIT and CALLBACK as is to avoid breaking them if I replace the whole file.
// Or I can target specific functions. 
// The user asked to "Replace file content". I will provide the whole file structure but with the requested changes.

// ... (INIT and CALLBACK are same as before, I will copy them for completeness in the ReplacementContent)

async function handleInit(req: Request, corsHeaders: Record<string, string>): Promise<Response> {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const user = await verifyPermission(req, supabase, 'system.manage')
    const { data: state, error: stateError } = await supabase.rpc('create_oauth_state', { p_user_id: user.id })

    if (stateError || !state) throw new Error('Error creating OAuth state')

    const authUrl = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize')
    authUrl.searchParams.set('client_id', MS_CLIENT_ID)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('redirect_uri', MS_REDIRECT_URI)
    authUrl.searchParams.set('response_mode', 'query')
    authUrl.searchParams.set('scope', 'offline_access User.Read Files.Read.All Files.ReadWrite.All') // Added Write Scope
    authUrl.searchParams.set('state', state)

    return new Response(JSON.stringify({ url: authUrl.toString() }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
}

async function handleCallback(url: URL, corsHeaders: Record<string, string>): Promise<Response> {
    // ... (Same implementation as before)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    const error = url.searchParams.get('error')

    if (error) return new Response(`Error: ${error}`, { status: 400 })
    if (!code || !state) return new Response('Missing code or state', { status: 400 })

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const { data: userId, error: stateError } = await supabase.rpc('validate_oauth_state', { p_state: state })

    if (stateError || !userId) return new Response('Invalid or expired state', { status: 400 })

    const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: MS_CLIENT_ID,
            client_secret: MS_CLIENT_SECRET,
            code: code,
            redirect_uri: MS_REDIRECT_URI,
            grant_type: 'authorization_code'
        })
    })

    if (!tokenResponse.ok) {
        const err = await tokenResponse.json()
        return new Response(`Microsoft Error: ${JSON.stringify(err)}`, { status: 400 })
    }

    const tokens = await tokenResponse.json()
    const userResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: { 'Authorization': `Bearer ${tokens.access_token}` }
    })

    if (!userResponse.ok) return new Response('Error getting user info', { status: 400 })
    const msUser = await userResponse.json()

    const { error: rpcError } = await supabase.rpc('store_microsoft_credentials', {
        p_user_id: msUser.id,
        p_email: msUser.userPrincipalName || msUser.mail,
        p_name: msUser.displayName,
        p_access_token: tokens.access_token,
        p_refresh_token: tokens.refresh_token,
        p_scope: tokens.scope,
        p_expires_in: tokens.expires_in
    })

    if (rpcError) return new Response(`Database Error: ${rpcError.message}`, { status: 500 })

    return new Response('Microsoft connected successfully!\nYou can close this window.', {
        headers: { 'Content-Type': 'text/plain' }
    })
}

// === STATUS ===
async function handleStatus(req: Request, corsHeaders: Record<string, string>): Promise<Response> {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    await verifyPermission(req, supabase, ['reports.manage', 'system.manage'])

    const { data: account, error } = await supabase
        .from('microsoft_account')
        .select('microsoft_email, microsoft_name, expires_at, connected_at, schedules_folder_id, schedules_folder_name, incidences_file_id, incidences_file_name, incidences_worksheet_id, incidences_worksheet_name, incidences_table_id, incidences_table_name')
        .single()

    if (error || !account) {
        return new Response(JSON.stringify({ connected: false }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }

    return new Response(JSON.stringify({
        connected: true,
        account: {
            email: account.microsoft_email,
            name: account.microsoft_name,
            expires_at: account.expires_at,
            connected_at: account.connected_at,
            // New config fields
            schedules_folder: {
                id: account.schedules_folder_id,
                name: account.schedules_folder_name
            },
            incidences_file: {
                id: account.incidences_file_id,
                name: account.incidences_file_name
            },
            incidences_worksheet: {
                id: account.incidences_worksheet_id,
                name: account.incidences_worksheet_name
            },
            incidences_table: {
                id: account.incidences_table_id,
                name: account.incidences_table_name
            }
        }
    }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
}

// === UPDATE CONFIG ===
interface UpdateConfigBody {
    type: 'schedules_folder' | 'incidences_file';
    id: string;
    name: string;
    worksheet_id?: string;
    worksheet_name?: string;
    table_id?: string;
    table_name?: string;
}

async function handleUpdateConfig(req: Request, body: UpdateConfigBody, corsHeaders: Record<string, string>): Promise<Response> {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    await verifyPermission(req, supabase, 'system.manage')

    const { type, id, name, worksheet_id, worksheet_name, table_id, table_name } = body

    if (!type || !id || !name) {
        return new Response(JSON.stringify({ error: 'Missing type, id or name' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }

    const { error } = await supabase.rpc('update_microsoft_config', {
        p_type: type,
        p_id: id,
        p_name: name,
        p_worksheet_id: worksheet_id || null,
        p_worksheet_name: worksheet_name || null,
        p_table_id: table_id || null,
        p_table_name: table_name || null
    })

    if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }

    return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
}

// === DISCONNECT ===
async function handleDisconnect(req: Request, corsHeaders: Record<string, string>): Promise<Response> {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    await verifyPermission(req, supabase, 'system.manage')

    try {
        // 1. Leer IDs de secretos del Vault antes de borrar la cuenta
        const { data: account, error: fetchError } = await supabase
            .from('microsoft_account')
            .select('access_token_id, refresh_token_id')
            .single()

        if (fetchError) {
            console.warn('No Microsoft account found to disconnect')
            return new Response(JSON.stringify({ success: true, message: 'No account to disconnect' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // 2. Eliminar secretos del Vault si existen
        if (account?.access_token_id && account?.refresh_token_id) {
            const secretIds = [account.access_token_id, account.refresh_token_id]
            const { error: deleteSecretsError } = await supabase.rpc('delete_microsoft_secrets', {
                p_secret_ids: secretIds
            })

            if (deleteSecretsError) {
                console.error('Failed to delete Microsoft Vault secrets:', deleteSecretsError)
                // Continue anyway — account deletion is more important
            }
        }

        // 3. Eliminar la cuenta Microsoft (System Singleton)
        const { error: deleteAccountError } = await supabase
            .from('microsoft_account')
            .delete()
            .not('id', 'is', null)

        if (deleteAccountError) {
            throw new Error(`Failed to delete Microsoft account: ${deleteAccountError.message}`)
        }

        return new Response(JSON.stringify({ success: true, message: 'Microsoft account disconnected' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to disconnect Microsoft'
        console.error('Disconnect error:', message)
        return new Response(JSON.stringify({ error: message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
}
