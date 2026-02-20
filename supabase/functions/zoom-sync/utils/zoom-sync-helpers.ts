
export interface ZoomUser {
    id: string
    email: string
    role_id?: string
    first_name?: string
    last_name?: string
    display_name?: string
    created_at: string
}

export interface ZoomMeeting {
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

/**
 * Filtra los usuarios de Zoom basándose en emails en lista blanca (whitelist) y IDs de roles excluidos.
 * (ej., Excluir propietarios "0" y administradores "1")
 */
export function filterZoomUsers(users: ZoomUser[], whitelistEmailsHex: string, excludedRoleIds: string[]): ZoomUser[] {
    const whitelist = whitelistEmailsHex.split(',').map(e => e.trim().toLowerCase()).filter(e => e.length > 0)

    return users.filter((user) => {
        if (whitelist.includes(user.email?.toLowerCase())) {
            return true
        }
        if (!user.role_id) return false
        return !excludedRoleIds.includes(user.role_id)
    })
}

/**
 * Formatea un ZoomUser al esquema de la tabla de base de datos zoom_users.
 */
export function formatUserForDb(user: ZoomUser) {
    return {
        id: user.id,
        email: user.email,
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        display_name: user.display_name || `${user.first_name || ''} ${user.last_name || ''}`.trim(),
        created_at: user.created_at,
        synced_at: new Date().toISOString()
    }
}

/**
 * Elimina duplicados de una lista de ZoomMeetings por meeting_id.
 */
export function deduplicateMeetings(meetings: ZoomMeeting[]): ZoomMeeting[] {
    return Array.from(
        new Map(meetings.map(m => [m.meeting_id, m])).values()
    )
}

