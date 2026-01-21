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


// Tipos
interface UpdateRequest {
    meeting_id: string
    schedule_for: string
    topic?: string // Agregado para permitir renombrar reuniones
    start_time?: string
    duration?: number
    timezone?: string
    recurrence?: {
        type: number
        repeat_interval?: number
        weekly_days?: string
        end_date_time?: string
    }
    settings?: {
        join_before_host?: boolean
        waiting_room?: boolean
    }
}

interface RequestItem extends UpdateRequest {
    action?: 'create' | 'update'
    topic?: string // required for create
    type?: number
}

interface BatchRequest {
    batch: true
    action?: 'create' | 'update' // Global action for batch, or per-item
    requests: RequestItem[]
}

type RequestBody = RequestItem | BatchRequest

function isBatchRequest(body: RequestBody): body is BatchRequest {
    return 'batch' in body && body.batch === true && Array.isArray(body.requests)
}

// Construir body para PATCH a Zoom API
function buildZoomPatchBody(req: UpdateRequest): Record<string, unknown> {
    const body: Record<string, unknown> = {}

    if (req.schedule_for) {
        body.schedule_for = req.schedule_for
    }

    if (req.topic) {
        body.topic = req.topic
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

// Construir body para POST (Create) a Zoom API
function buildZoomCreateBody(req: RequestItem): Record<string, unknown> {
    return {
        topic: req.topic,
        type: req.type || 8, // Por defecto 8 (Recurrente hora fija)
        start_time: req.start_time,
        duration: req.duration || 60,
        timezone: req.timezone || 'America/Lima',
        recurrence: req.recurrence,
        settings: req.settings
    }
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

        // Helper para sincronizar inmediatamente con DB (Side-Effect Update)
        const syncToSupabase = async (meetingId: string): Promise<{ success: boolean; error?: string }> => {
            try {
                // 1. Obtener datos frescos de Zoom
                const getResp = await fetch(`${ZOOM_API_BASE}/meetings/${meetingId}`, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                })
                if (!getResp.ok) {
                    const msg = `[Zoom API] Fetch error: ${meetingId} (Status: ${getResp.status})`;
                    console.error(msg)
                    return { success: false, error: msg }
                }
                const zoomData = await getResp.json()

                // 2. Preparar payload DB
                const dbPayload = {
                    meeting_id: zoomData.id.toString(),
                    topic: zoomData.topic,
                    host_id: zoomData.host_id,
                    start_time: zoomData.start_time,
                    duration: zoomData.duration,
                    timezone: zoomData.timezone,
                    join_url: zoomData.join_url,
                    created_at: zoomData.created_at,
                    synced_at: new Date().toISOString()
                }

                // 3. Upsert a Supabase
                const { error } = await supabase.from('zoom_meetings').upsert(dbPayload, { onConflict: 'meeting_id' })

                if (error) {
                    console.error(`[Zoom API] Sync error for ${meetingId}:`, error)
                    return { success: false, error: `DB Sync Error: ${error.message}` }
                } else {
                    return { success: true }
                }
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Unknown sync error';
                console.error(`[Zoom API] Sync exception for ${meetingId}:`, err)
                return { success: false, error: msg }
            }
        }

        // ========== MODO BATCH ==========
        if (isBatchRequest(body)) {
            // ... (validaciones)
            // Procesar solicitudes en paralelo
            const results = await Promise.allSettled(
                body.requests.map(async (request, index) => {
                    // ... (lógica existente de action determination)
                    const action = request.action || (body as BatchRequest).action || 'update'

                    if (action === 'update' && (!request.meeting_id || !request.schedule_for)) {
                        return { meeting_id: request.meeting_id || 'unknown', success: false, error: 'meeting_id and schedule_for required for update' }
                    }
                    if (action === 'create' && !request.topic) {
                        return { meeting_id: 'new', success: false, error: 'topic required for create' }
                    }

                    try {
                        let url = ''
                        let method = ''
                        let apiBody = {}

                        if (action === 'create') {
                            url = `${ZOOM_API_BASE}/users/me/meetings`
                            method = 'POST'
                            apiBody = buildZoomCreateBody(request)
                        } else {
                            url = `${ZOOM_API_BASE}/meetings/${request.meeting_id}`
                            method = 'PATCH'
                            apiBody = buildZoomPatchBody(request)
                        }

                        const zoomResponse = await fetch(url, {
                            method,
                            headers: {
                                'Authorization': `Bearer ${accessToken}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(apiBody)
                        })

                        // 201 Creado para POST, 204 Sin Contenido para PATCH
                        if (zoomResponse.status === 201 || zoomResponse.status === 204 || zoomResponse.ok) {
                            let resultData: any = {}
                            let finalMeetingId = request.meeting_id

                            if (action === 'create') {
                                try {
                                    resultData = await zoomResponse.json()
                                    finalMeetingId = resultData.id.toString()
                                } catch { }
                            }

                            // SIDE-EFFECT: Sincronizar con DB inmediatamente
                            if (finalMeetingId && finalMeetingId !== 'unknown') {
                                const syncResult = await syncToSupabase(finalMeetingId)
                                if (!syncResult.success) {
                                    // Si falla el sync, considerarlo un error parcial o warning, pero para el frontend es crítico saberlo.
                                    // Vamos a marcarlo como fallo para que el usuario sepa que algo salió mal.
                                    return {
                                        meeting_id: finalMeetingId,
                                        success: false,
                                        error: `Zoom Created but DB Sync Failed: ${syncResult.error}`
                                    }
                                }
                            }

                            return {
                                meeting_id: finalMeetingId || 'unknown',
                                success: true,
                                data: resultData
                            }
                        }

                        // ... (Error handling)
                        let errorMsg = `Zoom API error: ${zoomResponse.status}`
                        try {
                            const errorData = await zoomResponse.json()
                            errorMsg = errorData.message || errorMsg
                        } catch { }
                        return { meeting_id: request.meeting_id || 'unknown', success: false, error: errorMsg }

                    } catch (err) {
                        return { meeting_id: request.meeting_id, success: false, error: err instanceof Error ? err.message : 'Unknown error' }
                    }
                })
            )
            // ... (resto de lógica batch)
            const batchResults = results.map((result, index) => {
                if (result.status === 'fulfilled') return result.value
                return { meeting_id: 'unknown', success: false, error: result.reason?.message || 'Request failed' }
            })
            // ...
            const successCount = batchResults.filter(r => r.success).length
            const errorCount = batchResults.length - successCount

            return jsonResponse({
                batch: true,
                total: batchResults.length,
                succeeded: successCount,
                failed: errorCount,
                results: batchResults
            }, 200, corsHeaders)
        }

        // ========== MODO INDIVIDUAL ==========
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
            // SIDE-EFFECT: Sync inmediata
            const syncResult = await syncToSupabase(body.meeting_id)
            if (!syncResult.success) {
                return jsonResponse({ success: false, error: `Zoom Updated but DB Sync Failed: ${syncResult.error}` }, 500, corsHeaders)
            }

            return jsonResponse({ success: true }, 200, corsHeaders)
        }

        // Error de Zoom
        let errorMsg = `Zoom API error: ${zoomResponse.status}`
        try {
            const errorData = await zoomResponse.json()
            errorMsg = errorData.message || errorMsg
        } catch { }

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
