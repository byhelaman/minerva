// Supabase Edge Function: zoom-api
// Actualiza reuniones de Zoom (host, fecha, hora, recurrence)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getValidAccessToken } from '../_shared/zoom-token-utils.ts'
import { verifyPermission } from '../_shared/auth-utils.ts'
import { getCorsHeaders } from '../_shared/cors-utils.ts'
import { handleEdgeError, jsonResponse } from '../_shared/error-utils.ts'

import { isBatchRequest, RequestBody } from './utils/zoom-utils.ts'
import { handleBatchRequest } from './controllers/batch.ts'
import { handleSingleRequest } from './controllers/single.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

Deno.serve(async (req: Request) => {
    const corsHeaders = getCorsHeaders(req)

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    const supabaseService = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: 'Missing Authorization header' }, 401, corsHeaders)

    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } }
    })

    try {
        // Permiso base requerido para entrar
        await verifyPermission(req, supabaseService, 'meetings.create')

        let accessToken: string
        try {
            accessToken = await getValidAccessToken(supabaseService)
        } catch (authError: unknown) {
            const message = authError instanceof Error ? authError.message : 'Auth error'
            return jsonResponse({ error: message }, 401, corsHeaders)
        }

        const body: RequestBody = await req.json()

        if (isBatchRequest(body)) {
            return await handleBatchRequest(req, body, accessToken, supabaseService, supabaseUser, corsHeaders)
        } else {
            return await handleSingleRequest(req, body, accessToken, supabaseService, supabaseUser, corsHeaders)
        }

    } catch (error: unknown) {
        return handleEdgeError(error, corsHeaders)
    }
})
