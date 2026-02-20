import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { ZOOM_API_BASE } from './zoom-utils.ts'
export async function syncMeetingToSupabase(meetingId: string, accessToken: string, supabaseUser: SupabaseClient): Promise<{ success: boolean; error?: string }> {
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
            synced_at: new Date().toISOString(),
            last_event_timestamp: Date.now() // Actualizar timestamp para invalidar webhooks anteriores
        }

        // 3. Upsert a Supabase (USER SCOPE - RLS)
        const { error } = await supabaseUser.from('zoom_meetings').upsert(dbPayload, { onConflict: 'meeting_id' })

        if (error) {
            console.error(`[Zoom API] Sync error for ${meetingId} (via RLS):`, error)
            return { success: false, error: `DB Sync Error (RLS): ${error.message}` }
        } else {
            return { success: true }
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown sync error';
        console.error(`[Zoom API] Sync exception for ${meetingId}:`, err)
        return { success: false, error: msg }
    }
}
