// Controladores para la autenticación de Microsoft
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyPermission } from '../../_shared/auth-utils.ts'

import { createOAuthState, validateOAuthState } from '../../_shared/oauth-utils.ts'

const MS_CLIENT_ID = Deno.env.get('MS_CLIENT_ID') ?? ''
const MS_CLIENT_SECRET = Deno.env.get('MS_CLIENT_SECRET') ?? ''
const MS_REDIRECT_URI = Deno.env.get('MS_REDIRECT_URI') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

// === INIT ===
export async function handleInit(req: Request, corsHeaders: Record<string, string>): Promise<Response> {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const user = await verifyPermission(req, supabase, 'system.manage')

    const state = await createOAuthState(supabase, user.id)

    const authUrl = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize')
    authUrl.searchParams.set('client_id', MS_CLIENT_ID)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('redirect_uri', MS_REDIRECT_URI)
    authUrl.searchParams.set('response_mode', 'query')
    authUrl.searchParams.set('scope', 'offline_access User.Read Files.Read.All Files.ReadWrite.All')
    authUrl.searchParams.set('state', state)

    return new Response(JSON.stringify({ url: authUrl.toString() }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
}

// === CALLBACK ===
export async function handleCallback(url: URL, corsHeaders: Record<string, string>): Promise<Response> {
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    const error = url.searchParams.get('error')

    if (error) return new Response(`Error: ${error}`, { status: 400 })
    if (!code || !state) return new Response('Missing code or state', { status: 400 })

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const userId = await validateOAuthState(supabase, state)

    if (!userId) return new Response('Invalid or expired state', { status: 400 })

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
        console.error('Microsoft token exchange failed')
        return new Response('Authentication failed', { status: 400 })
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

    if (rpcError) return new Response('Failed to save credentials', { status: 500 })

    return new Response('Microsoft connected successfully!\nYou can close this window.', {
        headers: { 'Content-Type': 'text/plain' }
    })
}

// === STATUS ===
export async function handleStatus(req: Request, corsHeaders: Record<string, string>): Promise<Response> {
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
            schedules_folder: { id: account.schedules_folder_id, name: account.schedules_folder_name },
            incidences_file: { id: account.incidences_file_id, name: account.incidences_file_name },
            incidences_worksheet: { id: account.incidences_worksheet_id, name: account.incidences_worksheet_name },
            incidences_table: { id: account.incidences_table_id, name: account.incidences_table_name }
        }
    }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
}

// === UPDATE CONFIG ===
export interface UpdateConfigBody {
    type: 'schedules_folder' | 'incidences_file';
    id: string;
    name: string;
    worksheet_id?: string;
    worksheet_name?: string;
    table_id?: string;
    table_name?: string;
}

export async function handleUpdateConfig(req: Request, body: UpdateConfigBody, corsHeaders: Record<string, string>): Promise<Response> {
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
export async function handleDisconnect(req: Request, corsHeaders: Record<string, string>): Promise<Response> {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    await verifyPermission(req, supabase, 'system.manage')

    try {
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

        if (account?.access_token_id && account?.refresh_token_id) {
            const secretIds = [account.access_token_id, account.refresh_token_id]
            const { error: deleteSecretsError } = await supabase.rpc('delete_microsoft_secrets', {
                p_secret_ids: secretIds
            })

            if (deleteSecretsError) console.error('Failed to delete Microsoft Vault secrets:', deleteSecretsError)
        }

        const { error: deleteAccountError } = await supabase
            .from('microsoft_account')
            .delete()
            .not('id', 'is', null)

        if (deleteAccountError) throw new Error(`Failed to delete Microsoft account: ${deleteAccountError.message}`)

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
