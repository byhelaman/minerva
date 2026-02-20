import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyPermission } from '../../_shared/auth-utils.ts'
import { jsonResponse } from '../../_shared/error-utils.ts'
import { BatchRequest, buildZoomCreateBody, buildZoomPatchBody, ZOOM_API_BASE } from '../utils/zoom-utils.ts'
import { syncMeetingToSupabase } from '../utils/db-sync.ts'

const MAX_BATCH_SIZE = 50

export async function handleBatchRequest(
    req: Request,
    body: BatchRequest,
    accessToken: string,
    supabaseService: SupabaseClient,
    supabaseUser: SupabaseClient,
    corsHeaders: Record<string, string>
): Promise<Response> {

    if (body.requests.length > MAX_BATCH_SIZE) {
        return jsonResponse({ error: `Batch size exceeds limit of ${MAX_BATCH_SIZE}` }, 400, corsHeaders)
    }

    const globalAction = body.action
    const isDeleteBatch = globalAction === 'delete' || body.requests.every(r => r.action === 'delete')

    // ========== ELIMINACIÓN POR LOTES (BATCH DELETE) ==========
    if (isDeleteBatch) {
        try {
            await verifyPermission(req, supabaseService, 'meetings.delete')
        } catch (e) {
            return jsonResponse({ error: 'Unauthorized: Permission meetings.delete required' }, 403, corsHeaders)
        }

        const deleteResults = await Promise.allSettled(
            body.requests.map(async (request) => {
                const meetingId = request.meeting_id
                if (!meetingId) return { meeting_id: 'unknown', success: false, error: 'meeting_id required' }

                try {
                    const deleteResp = await fetch(`${ZOOM_API_BASE}/meetings/${meetingId}`, {
                        method: 'DELETE',
                        headers: { 'Authorization': `Bearer ${accessToken}` }
                    })

                    if (deleteResp.status === 204 || deleteResp.ok || deleteResp.status === 404) {
                        return { meeting_id: meetingId, success: true }
                    }

                    let errorMsg = `Zoom API delete error: ${deleteResp.status}`
                    try {
                        const errorData = await deleteResp.json()
                        errorMsg = errorData.message || errorMsg
                    } catch { }

                    return { meeting_id: meetingId, success: false, error: errorMsg }
                } catch (err) {
                    return { meeting_id: meetingId, success: false, error: err instanceof Error ? err.message : 'Unknown error' }
                }
            })
        )

        const batchResults = deleteResults.map((result) => {
            if (result.status === 'fulfilled') return result.value
            return { meeting_id: 'unknown', success: false, error: result.reason?.message || 'Request failed' }
        })

        // Borrado por lotes en la base de datos para reuniones exitosas (USER SCOPE - RLS)
        const succeededIds = batchResults.filter(r => r.success && r.meeting_id !== 'unknown').map(r => r.meeting_id)
        if (succeededIds.length > 0) {
            const { error: dbError } = await supabaseUser.from('zoom_meetings').delete().in('meeting_id', succeededIds)
            if (dbError) console.error('[Zoom API] DB batch delete error (RLS):', dbError)
        }

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

    // ========== CREACIÓN/ACTUALIZACIÓN POR LOTES (BATCH CREATE/UPDATE) ==========
    const results = await Promise.allSettled(
        body.requests.map(async (request, index) => {
            const action = request.action || body.action || 'update'

            if (action === 'delete') {
                return { meeting_id: request.meeting_id || 'unknown', success: false, error: 'Mixed delete in update batch not supported yet' }
            }

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

                if (zoomResponse.status === 201 || zoomResponse.status === 204 || zoomResponse.ok) {
                    let resultData: Record<string, unknown> = {}
                    let finalMeetingId = request.meeting_id

                    if (action === 'create') {
                        try {
                            resultData = await zoomResponse.json()
                            if (resultData.id) {
                                finalMeetingId = String(resultData.id)
                            }
                        } catch { }
                    }

                    // EFECTO SECUNDARIO: Sincronizar con base de datos inmediatamente
                    if (finalMeetingId && finalMeetingId !== 'unknown') {
                        const syncResult = await syncMeetingToSupabase(finalMeetingId, accessToken, supabaseUser)
                        if (!syncResult.success) {
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

    const batchResults = results.map((result) => {
        if (result.status === 'fulfilled') return result.value
        return { meeting_id: 'unknown', success: false, error: result.reason?.message || 'Request failed' }
    })

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
