// Supabase Edge Function: zoom-webhook
// Maneja los webhooks entrantes de Zoom
//
// POST / - Recibe y procesa eventos de webhook de Zoom

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createHmac } from "https://deno.land/std@0.168.0/node/crypto.ts"

const ZOOM_WEBHOOK_SECRET = Deno.env.get('ZOOM_WEBHOOK_SECRET')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// SEGURIDAD: Restringir CORS - los webhooks vienen de servidores de Zoom, no de navegadores
// Las solicitudes servidor-a-servidor (sin header Origin) siempre están permitidas
// Las solicitudes de navegadores están restringidas a orígenes conocidos
const ALLOWED_ORIGINS = [
    'http://localhost:1420',
    'tauri://localhost',
    'https://tauri.localhost',
]

function getCorsHeaders(req: Request) {
    const origin = req.headers.get('origin') || ''
    const isAllowed = ALLOWED_ORIGINS.includes(origin)
    return {
        'Access-Control-Allow-Origin': isAllowed ? origin : 'null',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-zm-signature, x-zm-request-timestamp',
    }
}

serve(async (req) => {
    const corsHeaders = getCorsHeaders(req)

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const body = await req.text()
        const signature = req.headers.get('x-zm-signature')
        const timestamp = req.headers.get('x-zm-request-timestamp')

        // Validar firma del webhook
        if (!verifySignature(body, signature, timestamp)) {
            console.error('Webhook: signature validation failed')
            return new Response('Unauthorized', { status: 401 })
        }

        const event = JSON.parse(body)

        // Manejar desafío de validación de URL de Zoom
        if (event.event === 'endpoint.url_validation') {
            const plainToken = event.payload.plainToken
            const hash = createHmac('sha256', ZOOM_WEBHOOK_SECRET)
                .update(plainToken)
                .digest('hex')

            return new Response(JSON.stringify({
                plainToken,
                encryptedToken: hash
            }), {
                headers: { 'Content-Type': 'application/json' }
            })
        }

        // Almacenar evento en base de datos
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

        await supabase
            .from('webhook_events')
            .insert({
                event_type: event.event,
                payload: event.payload,
                processed: false
            })

        // Procesar evento según tipo
        await processEvent(supabase, event)

        return new Response('OK', { status: 200 })

    } catch (error) {
        console.error('Webhook: processing error')
        return new Response('Error', { status: 500 })
    }
})

function verifySignature(body: string, signature: string | null, timestamp: string | null): boolean {
    if (!signature || !timestamp || !ZOOM_WEBHOOK_SECRET) {
        return false
    }

    const timestampMs = parseInt(timestamp) * 1000
    const now = Date.now()
    if (Math.abs(now - timestampMs) > 5 * 60 * 1000) {
        console.error('Webhook: timestamp expired')
        return false
    }

    const message = `v0:${timestamp}:${body}`
    const hash = createHmac('sha256', ZOOM_WEBHOOK_SECRET)
        .update(message)
        .digest('hex')
    const expectedSignature = `v0=${hash}`

    return signature === expectedSignature
}


interface ZoomWebhookEvent {
    event: string
    payload: {
        object: any
    }
}

async function processEvent(supabase: SupabaseClient, event: ZoomWebhookEvent): Promise<void> {
    const eventType = event.event
    const payload = event.payload

    console.log('Processing event')

    try {
        switch (eventType) {
            // ========== EVENTOS DE USUARIO ==========
            case 'user.created':
            case 'user.updated':
                await upsertUser(supabase, payload.object)
                break

            case 'user.deleted':
            case 'user.deactivated':
                await deleteUser(supabase, payload.object.id)
                break

            // ========== EVENTOS DE REUNIÓN ==========
            case 'meeting.created':
            case 'meeting.updated':
                await upsertMeeting(supabase, payload.object)
                break

            case 'meeting.deleted':
                await deleteMeeting(supabase, payload.object.id)
                break

            case 'meeting.started':
                console.log('Meeting started')
                break

            case 'meeting.ended':
                console.log('Meeting ended')
                break

            default:
                console.log('Event type not handled')
        }

        // Marcar evento como procesado
        await supabase
            .from('webhook_events')
            .update({
                processed: true,
                processed_at: new Date().toISOString()
            })
            .eq('event_type', eventType)
            .order('created_at', { ascending: false })
            .limit(1)

    } catch (error) {
        console.error('Event processing failed')
    }
}

// ========== MANEJADORES DE USUARIO ==========
interface ZoomUserData {
    id: string
    email?: string
    first_name: string
    last_name: string
    display_name: string
    synced_at: string
}

interface ZoomUserPayload {
    id: string
    email?: string
    first_name?: string
    last_name?: string
    display_name?: string
}

async function upsertUser(supabase: SupabaseClient, user: ZoomUserPayload): Promise<void> {
    const userRecord: ZoomUserData = {
        id: user.id,
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        display_name: user.display_name || `${user.first_name || ''} ${user.last_name || ''}`.trim(),
        synced_at: new Date().toISOString()
    }

    if (user.email) userRecord.email = user.email

    let error;

    // Misma lógica de seguridad que reuniones:
    // 'email' es NOT NULL. Si falta, solo podemos actualizar registros existentes.
    if (user.email) {
        const result = await supabase
            .from('zoom_users')
            .upsert(userRecord, { onConflict: 'id' })
        error = result.error
    } else {
        console.log('User update: partial data')
        // Omitir 'email' del payload de actualización
        const { email, ...updatePayload } = userRecord
        const result = await supabase
            .from('zoom_users')
            .update(updatePayload)
            .eq('id', user.id)
        error = result.error
    }

    if (error) {
        console.error('User operation failed')
    } else {
        console.log('User processed')
    }
}

async function deleteUser(supabase: SupabaseClient, userId: string): Promise<void> {
    const { error } = await supabase
        .from('zoom_users')
        .delete()
        .eq('id', userId)

    if (error) {
        console.error('User deletion failed')
    } else {
        console.log('User deleted')
    }
}

// ========== MANEJADORES DE REUNIÓN ==========
interface ZoomMeetingData {
    meeting_id: string
    uuid?: string
    host_id?: string
    topic?: string
    type?: number
    start_time?: string
    duration?: number
    timezone?: string
    join_url?: string
    synced_at: string
}

interface ZoomMeetingPayload {
    id: number | string
    uuid?: string
    host_id?: string
    topic?: string
    type?: number
    start_time?: string
    duration?: number
    timezone?: string
    join_url?: string
}

async function upsertMeeting(supabase: SupabaseClient, meeting: ZoomMeetingPayload): Promise<void> {
    const meetingRecord: ZoomMeetingData = {
        meeting_id: String(meeting.id),
        synced_at: new Date().toISOString()
    }

    // Solo agregar campos si tienen valores (evitar sobreescribir con null)
    if (meeting.uuid) meetingRecord.uuid = meeting.uuid
    if (meeting.host_id) meetingRecord.host_id = meeting.host_id
    if (meeting.topic) meetingRecord.topic = meeting.topic
    if (meeting.type !== undefined) meetingRecord.type = meeting.type
    if (meeting.start_time) meetingRecord.start_time = meeting.start_time
    if (meeting.duration) meetingRecord.duration = meeting.duration
    if (meeting.timezone) meetingRecord.timezone = meeting.timezone
    if (meeting.join_url) meetingRecord.join_url = meeting.join_url

    console.log('Processing meeting')

    let error;

    if (meeting.host_id) {
        const result = await supabase
            .from('zoom_meetings')
            .upsert(meetingRecord, { onConflict: 'meeting_id' })
        error = result.error
    } else {
        console.log('Meeting update: partial data')
        // Omit 'host_id' from update payload to be safe, though it's likely undefined anyway
        const { host_id, ...updatePayload } = meetingRecord
        const result = await supabase
            .from('zoom_meetings')
            .update(updatePayload)
            .eq('meeting_id', meeting.id)
        error = result.error
    }

    if (error) {
        console.error('Meeting operation failed')
    } else {
        console.log('Meeting processed')
    }
}

async function deleteMeeting(supabase: SupabaseClient, meetingId: number | string): Promise<void> {
    const { error } = await supabase
        .from('zoom_meetings')
        .delete()
        .eq('meeting_id', meetingId)

    if (error) {
        console.error('Meeting deletion failed')
    } else {
        console.log('Meeting deleted')
    }
}
