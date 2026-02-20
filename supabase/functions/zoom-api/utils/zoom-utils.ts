

export const ZOOM_API_BASE = 'https://api.zoom.us/v2'

export interface UpdateRequest {
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

export interface RequestItem extends UpdateRequest {
    action?: 'create' | 'update' | 'delete'
    topic?: string // requerido para la creación
    type?: number
}

export interface BatchRequest {
    batch: true
    action?: 'create' | 'update' | 'delete' // Acción global para el lote, o por elemento
    requests: RequestItem[]
}

export type RequestBody = RequestItem | BatchRequest

export function isBatchRequest(body: RequestBody): body is BatchRequest {
    return 'batch' in body && body.batch === true && Array.isArray(body.requests)
}

// Construir body para PATCH a Zoom API
export function buildZoomPatchBody(req: UpdateRequest): Record<string, unknown> {
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
export function buildZoomCreateBody(req: RequestItem): Record<string, unknown> {
    const body: Record<string, unknown> = {
        topic: req.topic,
        type: req.type || 8, // Por defecto 8 (Recurrente hora fija)
        start_time: req.start_time,
        duration: req.duration || 60,
        timezone: req.timezone || 'America/Lima',
        recurrence: req.recurrence,
        settings: req.settings
    }

    if (req.schedule_for) {
        body.schedule_for = req.schedule_for
    }

    return body
}

