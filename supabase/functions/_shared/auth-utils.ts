// Supabase Edge Function: Shared Auth Utilities
// Funciones compartidas de autenticación y autorización para Edge Functions

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Roles permitidos por nivel de acceso
export const ROLES = {
    SUPER_ADMIN_ONLY: ['super_admin'],
    ADMIN_AND_ABOVE: ['super_admin', 'admin'],
} as const

type RoleSet = typeof ROLES[keyof typeof ROLES]

/**
 * Verifica que el usuario autenticado tiene uno de los roles permitidos.
 * 
 * @param req - Request con header Authorization
 * @param supabase - Cliente Supabase con service role
 * @param allowedRoles - Array de roles permitidos
 * @returns Usuario autenticado si tiene permisos
 * @throws Error si no está autorizado
 */
export async function verifyUserRole(
    req: Request,
    supabase: SupabaseClient,
    allowedRoles: RoleSet = ROLES.ADMIN_AND_ABOVE
) {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
        throw new Error('Unauthorized: Missing Authorization header')
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error } = await supabase.auth.getUser(token)

    if (error || !user) {
        throw new Error('Unauthorized: Invalid token')
    }

    // Verificar rol en profiles
    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (profileError || !profile) {
        throw new Error('Unauthorized: Profile not found')
    }

    if (!allowedRoles.includes(profile.role)) {
        throw new Error('Unauthorized: Insufficient permissions')
    }

    return user
}

/**
 * Verifica que el request tiene una clave interna válida.
 * Útil para cronjobs y llamadas server-to-server.
 * 
 * @param req - Request con header x-internal-key
 * @returns true si la clave es válida
 */
export function verifyInternalKey(req: Request): boolean {
    const INTERNAL_API_KEY = Deno.env.get('INTERNAL_API_KEY')
    if (!INTERNAL_API_KEY) return false

    const providedKey = req.headers.get('x-internal-key')
    return providedKey === INTERNAL_API_KEY
}

/**
 * Verifica autorización combinada: usuario admin O clave interna.
 * 
 * @param req - Request
 * @param supabase - Cliente Supabase
 * @param allowedRoles - Roles permitidos para autenticación de usuario
 * @returns true si autorizado por cualquier método
 */
export async function verifyAccess(
    req: Request,
    supabase: SupabaseClient,
    allowedRoles: RoleSet = ROLES.ADMIN_AND_ABOVE
): Promise<boolean> {
    // Primero intentar autenticación por usuario
    const authHeader = req.headers.get('authorization')
    if (authHeader) {
        try {
            await verifyUserRole(req, supabase, allowedRoles)
            return true
        } catch {
            // Continuar con verificación de clave interna
        }
    }

    // Fallback a clave interna
    return verifyInternalKey(req)
}
