// Supabase Edge Function: zoom-sync
// Sincroniza usuarios y reuniones de Zoom a la base de datos (OPTIMIZADO - Peticiones Paralelas)
//
// POST / - Inicia sincronización completa
// Retorna: { users_synced, meetings_synced }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getValidAccessToken } from '../_shared/zoom-token-utils.ts'
import { verifyAccess } from '../_shared/auth-utils.ts'
import { getCorsHeaders } from '../_shared/cors-utils.ts'
import { handleEdgeError } from '../_shared/error-utils.ts'
import { deduplicateMeetings, filterZoomUsers, formatUserForDb, jsonResponse, ZoomUser, ZoomMeeting } from './utils/zoom-sync-helpers.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ZOOM_API_BASE = 'https://api.zoom.us/v2'

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const isAuthorized = await verifyAccess(req, supabase, 'system.manage')

  if (!isAuthorized) return jsonResponse({ error: 'Unauthorized' }, 401, corsHeaders)

  try {
    let accessToken: string
    try {
      accessToken = await getValidAccessToken(supabase)
    } catch (authError: unknown) {
      return jsonResponse({ error: authError instanceof Error ? authError.message : 'Auth error' }, 401, corsHeaders)
    }

    // 1. Obtener Usuarios
    console.log('Starting user sync')
    const allUsers: ZoomUser[] = []
    let nextPageToken = ''

    do {
      const pageUrl = `${ZOOM_API_BASE}/users?page_size=300${nextPageToken ? `&next_page_token=${nextPageToken}` : ''}`
      const usersResponse = await fetch(pageUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } })

      if (!usersResponse.ok) {
        const error = await usersResponse.json()
        return jsonResponse({ error: 'Failed to fetch users', details: error }, 500, corsHeaders)
      }

      const usersData = await usersResponse.json()
      allUsers.push(...(usersData.users || []))
      nextPageToken = usersData.next_page_token || ''
    } while (nextPageToken)

    const whitelistEnv = Deno.env.get('ZOOM_WHITELIST_EMAILS') || ''
    const EXCLUDED_ROLE_IDS = ['0', '1']
    const users = filterZoomUsers(allUsers, whitelistEnv, EXCLUDED_ROLE_IDS)

    if (users.length > 0) {
      const userRecords = users.map(formatUserForDb)
      const { error: usersError } = await supabase.from('zoom_users').upsert(userRecords, { onConflict: 'id' })
      if (usersError) console.error('User sync failed:', usersError.message)
    }

    // 2. Obtener Reuniones
    console.log('Starting meeting sync')
    const BATCH_SIZE = 10
    const allMeetings: ZoomMeeting[] = []

    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE)

      const batchResults = await Promise.all(
        batch.map(async (user) => {
          try {
            const response = await fetch(
              `${ZOOM_API_BASE}/users/${user.id}/meetings?page_size=300&type=scheduled`,
              { headers: { 'Authorization': `Bearer ${accessToken}` } }
            )

            if (!response.ok) return []

            const data = await response.json()
            return (data.meetings || []).map((m: any) => ({
              meeting_id: m.id.toString(),
              uuid: m.uuid,
              host_id: m.host_id || user.id,
              topic: m.topic,
              type: m.type,
              start_time: m.start_time,
              duration: m.duration,
              timezone: m.timezone,
              join_url: m.join_url,
              created_at: m.created_at,
              synced_at: new Date().toISOString()
            }))
          } catch {
            return []
          }
        })
      )

      batchResults.forEach(meetings => allMeetings.push(...meetings))
    }

    const uniqueMeetings = deduplicateMeetings(allMeetings)

    if (uniqueMeetings.length > 0) {
      const { error: meetingsError } = await supabase.from('zoom_meetings').upsert(uniqueMeetings, { onConflict: 'meeting_id' })
      if (meetingsError) console.error('Meeting sync failed:', meetingsError.message)
    }

    return jsonResponse({
      success: true,
      users_synced: users.length,
      meetings_synced: uniqueMeetings.length
    }, 200, corsHeaders)

  } catch (error: unknown) {
    return handleEdgeError(error, corsHeaders)
  }
})
