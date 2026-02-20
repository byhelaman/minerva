// Supabase Edge Function: microsoft-auth
// Handles authentication flow (Server-to-Server OAuth) for Microsoft

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders } from '../_shared/cors-utils.ts'
import { handleEdgeError } from '../_shared/error-utils.ts'
import * as authControllers from './controllers/auth.ts'

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
            case 'init': return await authControllers.handleInit(req, corsHeaders)
            case 'callback': return await authControllers.handleCallback(url, corsHeaders)
            case 'status': return await authControllers.handleStatus(req, corsHeaders)
            case 'disconnect': return await authControllers.handleDisconnect(req, corsHeaders)
        }

        // 2. Action-based (Supabase Invoke POST)
        if (path === 'microsoft-auth' && req.method === 'POST') {
            const body = await req.json().catch(() => ({}))
            const action = body.action

            switch (action) {
                case 'init': return await authControllers.handleInit(req, corsHeaders)
                case 'status': return await authControllers.handleStatus(req, corsHeaders)
                case 'disconnect': return await authControllers.handleDisconnect(req, corsHeaders)
                case 'update-config': return await authControllers.handleUpdateConfig(req, body, corsHeaders)
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
    } catch (error: unknown) {
        return handleEdgeError(error, corsHeaders)
    }
})
