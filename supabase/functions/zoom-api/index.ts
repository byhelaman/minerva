// Supabase Edge Function: zoom-api
// Actualiza reuniones de Zoom (host, fecha, hora, recurrence)
//
// POST / - Actualizar reunión(es)
// Body: { meeting_id, schedule_for, start_time, duration, timezone, recurrence }
// Body (batch): { batch: true, requests: [...] }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getValidAccessToken } from '../_shared/zoom-token-utils.ts'
import { verifyUserRole, ROLES } from '../_shared/auth-utils.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ZOOM_API_BASE = 'https://api.zoom.us/v2'

// CORS: Orígenes permitidos (Tauri + desarrollo)
const ALLOWED_ORIGINS = [
    'http://localhost:1420',
    'tauri://localhost',
    'https://tauri.localhost'
]

function getCorsHeaders(req: Request) {
    const origin = req.headers.get('origin') || ''
    const isAllowed = ALLOWED_ORIGINS.includes(origin)
    return {
        'Access-Control-Allow-Origin': isAllowed ? origin : 'null',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-name, x-app-version',
    }
}


// Tipos
interface UpdateRequest {
    meeting_id: string
    schedule_for: string
    start_time?: string
    duration?: number
    timezone?: string
    recurrence?: {
        type: number
        repeat_interval?: number
        weekly_days?: string
        end_date_time?: string
    }
}

interface BatchRequest {
    batch: true
    requests: UpdateRequest[]
}

type RequestBody = UpdateRequest | BatchRequest

function isBatchRequest(body: RequestBody): body is BatchRequest {
    return 'batch' in body && body.batch === true && Array.isArray(body.requests)
}

// Construir body para PATCH a Zoom API
function buildZoomPatchBody(req: UpdateRequest): Record<string, unknown> {
    const body: Record<string, unknown> = {}

    if (req.schedule_for) {
        body.schedule_for = req.schedule_for
    }

    if (req.start_time) {
        body.start_time = req.start_time
    }

    if (req.duration) {
        body.duration = req.duration
    }

    if (req.timezone) {
        body.timezone = req.timezone
    }

    if (req.recurrence) {
        body.recurrence = req.recurrence
    }

    return body
}

serve(async (req: Request) => {
    const corsHeaders = getCorsHeaders(req)

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    try {
        // Verificar autenticación
        await verifyUserRole(req, supabase, ROLES.ADMIN_AND_ABOVE)

        // Obtener token de Zoom válido
        let accessToken: string
        try {
            accessToken = await getValidAccessToken(supabase)
        } catch (authError: unknown) {
            const message = authError instanceof Error ? authError.message : 'Auth error'
            return jsonResponse({ error: message }, 401, corsHeaders)
        }

        const body: RequestBody = await req.json()

        // ========== MODO BATCH ==========
        if (isBatchRequest(body)) {
            if (body.requests.length === 0) {
                return jsonResponse({ error: 'No requests in batch' }, 400, corsHeaders)
            }
            if (body.requests.length > 50) {
                return jsonResponse({ error: 'Batch size exceeds limit (max 50)' }, 400, corsHeaders)
            }

            // Procesar requests en paralelo
            const results = await Promise.allSettled(
                body.requests.map(async (request, index) => {
                    if (!request.meeting_id || !request.schedule_for) {
                        return {
                            meeting_id: request.meeting_id || 'unknown',
                            success: false,
                            error: 'meeting_id and schedule_for required'
                        }
                    }

                    try {
                        const patchBody = buildZoomPatchBody(request)

                        const zoomResponse = await fetch(
                            `${ZOOM_API_BASE}/meetings/${request.meeting_id}`,
                            {
                                method: 'PATCH',
                                headers: {
                                    'Authorization': `Bearer ${accessToken}`,
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify(patchBody)
                            }
                        )

                        // Zoom devuelve 204 No Content en éxito
                        if (zoomResponse.status === 204 || zoomResponse.ok) {
                            return { meeting_id: request.meeting_id, success: true }
                        }

                        // Error de Zoom
                        let errorMsg = `Zoom API error: ${zoomResponse.status}`
                        try {
                            const errorData = await zoomResponse.json()
                            errorMsg = errorData.message || errorMsg
                        } catch { /* ignore parse error */ }

                        return { meeting_id: request.meeting_id, success: false, error: errorMsg }
                    } catch (err) {
                        return {
                            meeting_id: request.meeting_id,
                            success: false,
                            error: err instanceof Error ? err.message : 'Unknown error'
                        }
                    }
                })
            )

            // Formatear resultados
            const batchResults = results.map((result, index) => {
                if (result.status === 'fulfilled') {
                    return result.value
                }
                return {
                    meeting_id: body.requests[index]?.meeting_id || 'unknown',
                    success: false,
                    error: result.reason?.message || 'Request failed'
                }
            })

            const successCount = batchResults.filter(r => r.success).length
            const errorCount = batchResults.length - successCount

            console.log(`Batch complete: ${successCount} succeeded, ${errorCount} failed`)

            return jsonResponse({
                batch: true,
                total: batchResults.length,
                succeeded: successCount,
                failed: errorCount,
                results: batchResults
            }, 200, corsHeaders)
        }

        // ========== MODO SINGLE ==========
        if (!body.meeting_id || !body.schedule_for) {
            return jsonResponse({ error: 'meeting_id and schedule_for required' }, 400, corsHeaders)
        }

        const patchBody = buildZoomPatchBody(body)

        const zoomResponse = await fetch(
            `${ZOOM_API_BASE}/meetings/${body.meeting_id}`,
            {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(patchBody)
            }
        )

        // Zoom devuelve 204 No Content en éxito
        if (zoomResponse.status === 204 || zoomResponse.ok) {
            console.log(`Meeting ${body.meeting_id} updated successfully`)
            return jsonResponse({ success: true }, 200, corsHeaders)
        }

        // Error de Zoom
        let errorMsg = `Zoom API error: ${zoomResponse.status}`
        try {
            const errorData = await zoomResponse.json()
            errorMsg = errorData.message || errorMsg
        } catch { /* ignore parse error */ }

        return jsonResponse({ success: false, error: errorMsg }, zoomResponse.status, corsHeaders)

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return jsonResponse({ error: message }, 500, corsHeaders)
    }
})

function jsonResponse(data: unknown, status = 200, corsHeaders: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
}
