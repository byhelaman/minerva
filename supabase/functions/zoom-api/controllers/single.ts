import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyPermission } from '../../_shared/auth-utils.ts'
import { jsonResponse } from '../../_shared/error-utils.ts'
import { buildZoomPatchBody, RequestItem, ZOOM_API_BASE } from '../utils/zoom-utils.ts'
import { syncMeetingToSupabase } from '../utils/db-sync.ts'


export async function handleSingleRequest(
    req: Request,
    body: RequestItem | (Record<string, unknown> & { action?: string, meeting_id?: string }),
    accessToken: string,
    supabaseService: SupabaseClient,
    supabaseUser: SupabaseClient,
    corsHeaders: Record<string, string>
): Promise<Response> {

    // ========== ELIMINAR REUNIÓN ==========
    if (body.action === 'delete-meeting') {
        try {
            await verifyPermission(req, supabaseService, 'meetings.delete')
        } catch (e) {
            return jsonResponse({ error: 'Unauthorized: Permission meetings.delete required' }, 403, corsHeaders)
        }

        const meetingId = body.meeting_id
        if (!meetingId) {
            return jsonResponse({ error: 'meeting_id required for delete' }, 400, corsHeaders)
        }

        const deleteResp = await fetch(`${ZOOM_API_BASE}/meetings/${meetingId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${accessToken}` }
        })

        if (deleteResp.status === 204 || deleteResp.ok || deleteResp.status === 404) {
            const { error: dbError } = await supabaseUser.from('zoom_meetings').delete().eq('meeting_id', meetingId)
            if (dbError) console.error(`[Zoom API] DB delete error for ${meetingId}:`, dbError)
            return jsonResponse({ success: true }, 200, corsHeaders)
        }

        let errorMsg = `Zoom API delete error: ${deleteResp.status}`
        try {
            const errorData = await deleteResp.json()
            errorMsg = errorData.message || errorMsg
        } catch { }

        return jsonResponse({ success: false, error: errorMsg }, deleteResp.status, corsHeaders)
    }

    // ========== ACTUALIZAR REUNIÓN ==========
    const updateReq = body as RequestItem
    if (!updateReq.meeting_id || !updateReq.schedule_for) {
        return jsonResponse({ error: 'meeting_id and schedule_for required' }, 400, corsHeaders)
    }

    const patchBody = buildZoomPatchBody(updateReq)

    const zoomResponse = await fetch(
        `${ZOOM_API_BASE}/meetings/${updateReq.meeting_id}`,
        {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(patchBody)
        }
    )

    if (zoomResponse.status === 204 || zoomResponse.ok) {
        const syncResult = await syncMeetingToSupabase(updateReq.meeting_id, accessToken, supabaseUser)
        if (!syncResult.success) {
            return jsonResponse({ success: false, error: `Zoom Updated but DB Sync Failed: ${syncResult.error}` }, 500, corsHeaders)
        }

        return jsonResponse({ success: true }, 200, corsHeaders)
    }

    let errorMsg = `Zoom API error: ${zoomResponse.status}`
    try {
        const errorData = await zoomResponse.json()
        errorMsg = errorData.message || errorMsg
    } catch { }

    return jsonResponse({ success: false, error: errorMsg }, zoomResponse.status, corsHeaders)
}
