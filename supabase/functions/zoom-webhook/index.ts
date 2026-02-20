// Supabase Edge Function: zoom-webhook
// Maneja los webhooks entrantes de Zoom
//
// POST / - Recibe y procesa eventos de webhook de Zoom
//
// FIX: Web Crypto para HMAC (reemplaza Node.js createHmac)
// FIX: Comparación timing-safe para firmas
// FIX: Tipos estrictos (unknown en lugar de any)


import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ZOOM_WEBHOOK_SECRET = Deno.env.get('ZOOM_WEBHOOK_SECRET') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Declaración para uso del objeto global EdgeRuntime disponible en Supabase
declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void } | undefined;

// Única instancia a nivel de módulo (reutilizada entre ejecuciones en el mismo contexto)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

import { getCorsHeaders } from '../_shared/cors-utils.ts'

// =============================================
// Web Crypto HMAC (reemplaza Node.js createHmac)
// =============================================
async function computeHmacHex(key: string, data: string): Promise<string> {
    const encoder = new TextEncoder()
    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        encoder.encode(key),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    )
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data))
    return Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
}

import { constantTimeEqual } from '../_shared/auth-utils.ts'

// =============================================
// Verificación de firma del webhook
// =============================================
// FIX: Usa Web Crypto + comparación timing-safe
async function verifySignature(body: string, signature: string | null, timestamp: string | null): Promise<boolean> {
    if (!signature || !timestamp || !ZOOM_WEBHOOK_SECRET) {
        return false
    }

    // Verificar frescura del timestamp (±5 minutos)
    const timestampMs = parseInt(timestamp) * 1000
    const now = Date.now()
    if (Math.abs(now - timestampMs) > 5 * 60 * 1000) {
        console.error('Webhook: timestamp expired')
        return false
    }

    const message = `v0:${timestamp}:${body}`
    const hash = await computeHmacHex(ZOOM_WEBHOOK_SECRET, message)
    const expectedSignature = `v0=${hash}`

    return constantTimeEqual(signature, expectedSignature)
}

// =============================================
// Main Handler
// =============================================
Deno.serve(async (req) => {
    const corsHeaders = getCorsHeaders(req)

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    // Validar si el secreto está configurado
    if (!ZOOM_WEBHOOK_SECRET) {
        console.error('Webhook: ZOOM_WEBHOOK_SECRET is not configured')
        return new Response('Server configuration error', { status: 500 })
    }

    try {
        const body = await req.text()
        const signature = req.headers.get('x-zm-signature')
        const timestamp = req.headers.get('x-zm-request-timestamp')

        // Validar firma del webhook (timing-safe)
        if (!(await verifySignature(body, signature, timestamp))) {
            console.error('Webhook: signature validation failed')
            return new Response('Unauthorized', { status: 401 })
        }

        const event = JSON.parse(body)

        // Manejar desafío de validación de URL de Zoom
        if (event.event === 'endpoint.url_validation') {
            const plainToken = event.payload.plainToken
            const hash = await computeHmacHex(ZOOM_WEBHOOK_SECRET, plainToken)

            return new Response(JSON.stringify({
                plainToken,
                encryptedToken: hash
            }), {
                headers: { 'Content-Type': 'application/json' }
            })
        }

        // =============================================
        // Desacoplar procesamiento asíncrono en Background
        // =============================================
        const backgroundTask = async () => {
            try {
                const { data: insertedEvent } = await supabase
                    .from('webhook_events')
                    .insert({
                        event_type: event.event,
                        payload: event.payload,
                        processed: false
                    })
                    .select('id')
                    .single()

                await processEvent(supabase, event, insertedEvent?.id)
            } catch (err) {
                console.error('[Background Task Error]', err)
            }
        };

        // Utilizar EdgeRuntime.waitUntil para que la Request Edge no muera 
        // cuando devolvamos el 'OK' 200 inmediatamente a Zoom.
        if (typeof EdgeRuntime !== 'undefined' && typeof EdgeRuntime.waitUntil === 'function') {
            EdgeRuntime.waitUntil(backgroundTask());
        } else {
            // Local dev fallback
            backgroundTask();
        }

        // Responder INMEDIATAMENTE a Zoom en < 3s para prevenir retries innecesarios
        return new Response('OK', { status: 200 })

    } catch (error: unknown) {
        console.error('Webhook: processing error')
        return new Response('Error', { status: 500 })
    }
})

// =============================================
// Procesamiento de Eventos
// =============================================
interface ZoomWebhookEvent {
    event: string
    payload: {
        object: Record<string, unknown>
    }
    time_stamp?: number
}

async function processEvent(supabase: SupabaseClient, event: ZoomWebhookEvent, eventId?: string): Promise<void> {
    const eventType = event.event
    const payload = event.payload

    console.log('Processing event:', eventType)

    try {
        switch (eventType) {
            case 'user.created':
            case 'user.updated':
                await upsertUser(supabase, payload.object as unknown as ZoomUserPayload)
                break

            case 'user.deleted':
            case 'user.deactivated':
                await deleteUser(supabase, String(payload.object.id))
                break

            case 'meeting.created':
            case 'meeting.updated':
                await upsertMeeting(supabase, payload.object as unknown as ZoomMeetingPayload, event.time_stamp)
                break

            case 'meeting.deleted':
                // FIX: Convertir meeting.id a string explícitamente (puede ser number)
                await deleteMeeting(supabase, String(payload.object.id))
                break

            case 'meeting.started':
            case 'meeting.ended':
                console.log(`Meeting ${eventType}`)
                break

            default:
                console.log('Event type not handled:', eventType)
        }

        // Marcar evento como procesado usando su ID específico
        if (eventId) {
            await supabase
                .from('webhook_events')
                .update({
                    processed: true,
                    processed_at: new Date().toISOString()
                })
                .eq('id', eventId)
        }

    } catch (error: unknown) {
        console.error('Event processing failed:', error instanceof Error ? error.message : 'Unknown error')
    }
}

// =============================================
// Controladores de Usuario
// =============================================
interface ZoomUserPayload {
    id: string
    email?: string
    first_name?: string
    last_name?: string
    display_name?: string
}

async function upsertUser(supabase: SupabaseClient, user: ZoomUserPayload): Promise<void> {
    const userRecord: Record<string, unknown> = {
        id: user.id,
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        display_name: user.display_name || `${user.first_name || ''} ${user.last_name || ''}`.trim(),
        synced_at: new Date().toISOString()
    }

    if (user.email) userRecord.email = user.email

    let error

    // email es NOT NULL — si falta, solo actualizar registro existente
    if (user.email) {
        const result = await supabase
            .from('zoom_users')
            .upsert(userRecord, { onConflict: 'id' })
        error = result.error
    } else {
        const { email: _email, ...updatePayload } = userRecord
        const result = await supabase
            .from('zoom_users')
            .update(updatePayload)
            .eq('id', user.id)
        error = result.error
    }

    if (error) {
        console.error('User operation failed:', error.message)
    }
}

async function deleteUser(supabase: SupabaseClient, userId: string): Promise<void> {
    const { error } = await supabase
        .from('zoom_users')
        .delete()
        .eq('id', userId)

    if (error) {
        console.error('User deletion failed:', error.message)
    }
}

// =============================================
// Controladores de Reunión
// =============================================
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

async function upsertMeeting(supabase: SupabaseClient, meeting: ZoomMeetingPayload, eventTimestamp?: number): Promise<void> {
    // FIX: Siempre convertir a string (meeting.id puede ser number en webhooks)
    const meetingId = String(meeting.id)

    // Validar si el evento es obsoleto (protección contra webhooks desordenados)
    if (eventTimestamp) {
        const { data: existing } = await supabase
            .from('zoom_meetings')
            .select('last_event_timestamp')
            .eq('meeting_id', meetingId)
            .single()

        if (existing?.last_event_timestamp) {
            if (eventTimestamp <= existing.last_event_timestamp) {
                console.log(`Webhook: Ignoring stale event for meeting ${meetingId}`)
                return
            }
        }
    }

    const meetingRecord: Record<string, unknown> = {
        meeting_id: meetingId,
        synced_at: new Date().toISOString()
    }

    if (eventTimestamp) meetingRecord.last_event_timestamp = eventTimestamp
    if (meeting.uuid) meetingRecord.uuid = meeting.uuid
    if (meeting.host_id) meetingRecord.host_id = meeting.host_id
    if (meeting.topic) meetingRecord.topic = meeting.topic
    if (meeting.type !== undefined) meetingRecord.type = meeting.type
    if (meeting.start_time) meetingRecord.start_time = meeting.start_time
    if (meeting.duration) meetingRecord.duration = meeting.duration
    if (meeting.timezone) meetingRecord.timezone = meeting.timezone
    if (meeting.join_url) meetingRecord.join_url = meeting.join_url

    let error

    if (meeting.host_id) {
        const result = await supabase
            .from('zoom_meetings')
            .upsert(meetingRecord, { onConflict: 'meeting_id' })
        error = result.error
    } else {
        const result = await supabase
            .from('zoom_meetings')
            .update(meetingRecord)
            .eq('meeting_id', meetingId)
        error = result.error
    }

    if (error) {
        console.error('Meeting operation failed:', error.message)
    }
}

async function deleteMeeting(supabase: SupabaseClient, meetingId: string): Promise<void> {
    const { error } = await supabase
        .from('zoom_meetings')
        .delete()
        .eq('meeting_id', meetingId)

    if (error) {
        console.error('Meeting deletion failed:', error.message)
    }
}
