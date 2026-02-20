// Servicio cliente para Microsoft Graph
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Las variables de entorno deben ser inyectadas por el runner / contexto de deploy de Deno
const MS_CLIENT_ID = Deno.env.get('MS_CLIENT_ID') ?? ''
const MS_CLIENT_SECRET = Deno.env.get('MS_CLIENT_SECRET') ?? ''

/**
 * Obtiene un Access Token válido de Microsoft Graph para el tenant/usuario único.
 * Administra la actualización del token (refresh) a través de Supabase Vault si expira en menos de 5 minutos.
 */
export async function getAccessToken(supabase: SupabaseClient): Promise<string> {
    const { data: creds, error } = await supabase
        .from('microsoft_credentials_decrypted')
        .select('*')
        .single()

    if (error || !creds) throw new Error('Not connected to Microsoft')

    const expiresAt = new Date(creds.expires_at).getTime()
    const now = Date.now()

    // Refrescar si está expirado o expira en < 5 minutos
    if (expiresAt < now + 5 * 60 * 1000) {
        console.log('Refreshing Microsoft Token...')
        const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: MS_CLIENT_ID,
                client_secret: MS_CLIENT_SECRET,
                refresh_token: creds.refresh_token,
                grant_type: 'refresh_token',
                scope: 'offline_access User.Read Files.Read.All Files.ReadWrite.All'
            })
        })

        if (!tokenResponse.ok) {
            throw new Error('Failed to refresh token. Please reconnect.')
        }

        const tokens = await tokenResponse.json()

        // Actualizar credenciales de forma segura vía RPC (proxy para Vault)
        const { error: updateError } = await supabase.rpc('store_microsoft_credentials', {
            p_user_id: creds.microsoft_user_id,
            p_email: creds.microsoft_email,
            p_name: creds.microsoft_name ?? creds.microsoft_email ?? '',
            p_access_token: tokens.access_token,
            p_refresh_token: tokens.refresh_token || creds.refresh_token,
            p_scope: tokens.scope,
            p_expires_in: tokens.expires_in
        });

        if (updateError) {
            console.error('Failed to persist refreshed token:', updateError);
        }

        return tokens.access_token
    }

    return creds.access_token
}

/**
 * Función interna para ejecutar peticiones a Graph con manejo de Rate-Limiting (HTTP 429).
 * Respeta el header Retry-After sugerido por Microsoft Graph o aplica un backoff simple.
 */
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
    let retries = 0;
    
    while (true) {
        const response = await fetch(url, options);

        if (response.status === 429 && retries < maxRetries) {
            retries++;
            // Graph suele sugerir el tiempo exacto en segundos
            const retryAfterStr = response.headers.get('Retry-After');
            const retryAfterSecs = retryAfterStr ? parseInt(retryAfterStr, 10) : null;
            
            // Usar el tiempo sugerido, o un backoff exponencial: 2s, 4s, 8s
            const delayMs = retryAfterSecs && !isNaN(retryAfterSecs) 
                ? retryAfterSecs * 1000 
                : Math.pow(2, retries) * 1000;

            console.warn(`[Graph API] Rate limited (429). Retrying ${retries}/${maxRetries} in ${delayMs}ms...`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
            continue;
        }

        return response;
    }
}

/**
 * Wrapper estándar GET para llamadas HTTP a Microsoft Graph.
 */
export async function graphGet(endpoint: string, token: string): Promise<unknown> {
    const response = await fetchWithRetry(`https://graph.microsoft.com/v1.0${endpoint}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || 'Graph API GET Error');
    }

    return response.json();
}

/**
 * Wrapper estándar POST para llamadas HTTP a Microsoft Graph.
 */
export async function graphPost(endpoint: string, token: string, body?: unknown): Promise<unknown> {
    const response = await fetchWithRetry(`https://graph.microsoft.com/v1.0${endpoint}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: body ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || 'Graph API POST Error');
    }

    // Las peticiones POST en Graph a veces retornan 201 con contenido, a veces 200/204
    if (response.status === 204) return null;
    return response.json().catch(() => null);
}

/**
 * Wrapper estándar PATCH para llamadas HTTP a Microsoft Graph.
 */
export async function graphPatch(endpoint: string, token: string, body: unknown): Promise<unknown> {
    const response = await fetchWithRetry(`https://graph.microsoft.com/v1.0${endpoint}`, {
        method: 'PATCH',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || 'Graph API PATCH Error');
    }

    if (response.status === 204) return null;
    return response.json().catch(() => null);
}
