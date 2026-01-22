// Supabase Edge Function: zoom-sync
// Sincroniza usuarios y reuniones de Zoom a la base de datos (OPTIMIZADO - Peticiones Paralelas)
//
// POST / - Inicia sincronización completa
// Retorna: { users_synced, meetings_synced }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getValidAccessToken } from '../_shared/zoom-token-utils.ts'
import { verifyAccess } from '../_shared/auth-utils.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ZOOM_API_BASE = 'https://api.zoom.us/v2'

// SEGURIDAD: Restringir orígenes CORS
// Alineado con zoom-auth
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
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-key, x-app-name, x-app-version',
  }
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // Verificación de acceso: usuario con settings.manage O clave interna
  const isAuthorized = await verifyAccess(req, supabase, 'settings.manage')

  if (!isAuthorized) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: corsHeaders }
    )
  }

  try {
    // Obtener Token Válido (Auto-Refresh si es necesario)
    let accessToken: string
    try {
      accessToken = await getValidAccessToken(supabase)
    } catch (authError: any) {
      return jsonResponse({ error: authError.message }, 401, corsHeaders)
    }

    // 1. Sincronizar Usuarios
    console.log('Starting user sync')
    const usersResponse = await fetch(`${ZOOM_API_BASE}/users?page_size=300`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })

    if (!usersResponse.ok) {
      const error = await usersResponse.json()
      return jsonResponse({ error: 'Failed to fetch users', details: error }, 500, corsHeaders)
    }

    const usersData = await usersResponse.json()
    const allUsers = usersData.users || []

    // Filtro: Excluir roles admin/owner, pero siempre incluir emails en lista blanca
    // MEJORA: Usar Variable de Entorno para Lista Blanca
    const whitelistEnv = Deno.env.get('ZOOM_WHITELIST_EMAILS') || ''
    const WHITELIST_EMAILS = whitelistEnv.split(',').map(e => e.trim().toLowerCase()).filter(e => e.length > 0)

    // Zoom role_id: "0" = Owner, "1" = Admin, "2" = Member
    const EXCLUDED_ROLE_IDS = ['0', '1']  // Excluir Owner y Admin

    interface ZoomUser {
      id: string
      email: string
      role_id?: string
      first_name?: string
      last_name?: string
      display_name?: string
      created_at: string
    }

    const users = (allUsers as ZoomUser[]).filter((user) => {
      // Siempre incluir emails en lista blanca
      if (WHITELIST_EMAILS.includes(user.email?.toLowerCase())) {
        return true
      }

      if (!user.role_id) return false

      // Excluir por role_id
      return !EXCLUDED_ROLE_IDS.includes(user.role_id)
    })

    console.log('Users filtered')

    // Upsert (Insertar/Actualizar) usuarios en lote
    if (users.length > 0) {
      const userRecords = users.map((user) => ({
        id: user.id,
        email: user.email,
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        display_name: user.display_name || `${user.first_name} ${user.last_name}`.trim(),
        created_at: user.created_at,
        synced_at: new Date().toISOString()
      }))

      const { error: usersError } = await supabase
        .from('zoom_users')
        .upsert(userRecords, {
          onConflict: 'id',
          ignoreDuplicates: false
        })

      if (usersError) {
        console.error('User sync failed')
      }
    }

    console.log('Users synced')

    // 2. Sincronizar Reuniones - PARALELO para velocidad
    console.log('Starting meeting sync')

    // Obtener reuniones en paralelo (max 10 concurrentes por lote)
    const BATCH_SIZE = 10
    let totalMeetings = 0
    interface ZoomMeeting {
      meeting_id: string
      uuid: string
      host_id: string
      topic: string
      type: number
      start_time: string
      duration: number
      timezone: string
      join_url: string
      created_at: string
      synced_at: string
    }
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
              meeting_id: m.id,
              uuid: m.uuid,
              host_id: m.host_id || user.id, // USAR ID real del host reportado por Zoom (manejo de co-hosts)
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

    // Deduplicar reuniones por meeting_id (la misma reunión puede aparecer para múltiples usuarios anfitriones/alternativos)
    const uniqueMeetings = Array.from(
      new Map(allMeetings.map(m => [m.meeting_id, m])).values()
    )

    // Upsert de todas las reuniones en un solo lote
    if (uniqueMeetings.length > 0) {
      const { error: meetingsError } = await supabase
        .from('zoom_meetings')
        .upsert(uniqueMeetings, {
          onConflict: 'meeting_id',
          ignoreDuplicates: false
        })

      if (meetingsError) {
        console.error('Meeting sync failed')
      }
      totalMeetings = uniqueMeetings.length
    }

    console.log('Meetings synced')

    return jsonResponse({
      success: true,
      users_synced: users.length,
      meetings_synced: totalMeetings
    }, 200, corsHeaders)

  } catch (error: unknown) {
    console.error('Sync operation failed')
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
