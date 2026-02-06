// Supabase Edge Function: Shared Auth Utilities
// Funciones compartidas de autenticación y autorización para Edge Functions

import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2.94.1'

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
 * Verifica autorización combinada: usuario con permiso O clave interna.
 * 
 * @param req - Request
 * @param supabase - Cliente Supabase
 * @param requiredPermission - Permiso requerido para autenticación de usuario
 * @returns true si autorizado por cualquier método
 */
export async function verifyAccess(
    req: Request,
    supabase: SupabaseClient,
    requiredPermission: string
): Promise<boolean> {
    // Primero intentar autenticación por usuario con permiso granular
    const authHeader = req.headers.get('authorization')
    if (authHeader) {
        try {
            await verifyPermission(req, supabase, requiredPermission)
            return true
        } catch {
            // Continuar con verificación de clave interna
        }
    }

    // Fallback a clave interna
    return verifyInternalKey(req)
}

/**
 * Verifica que el usuario tiene un permiso específico (Granular Permission).
 * Acepta un string para verificar un permiso exacto, o un array para verificar AL MENOS UNO de ellos.
 * 
 * @param req - Request con header Authorization
 * @param supabase - Cliente Supabase
 * @param requiredPermission - String del permiso requerido (ej: 'meetings.create') o array de permisos
 * @returns Usuario autenticado
 */
export async function verifyPermission(
    req: Request,
    supabase: SupabaseClient,
    requiredPermission: string | string[]
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

    // ESTRATEGIA OPTIMIZADA: Leer de base de datos usando RPC has_permission
    // IMPORTANTE: Debemos usar un cliente con el token del usuario para que auth.jwt() sea correcto
    const userClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        {
            global: {
                headers: { Authorization: authHeader }
            }
        }
    )

    // Si es un array, verificar AL MENOS UNO (OR logic)
    if (Array.isArray(requiredPermission)) {
        for (const perm of requiredPermission) {
            const { data: hasPerm, error: rpcError } = await userClient.rpc('has_permission', {
                required_permission: perm
            })

            if (!rpcError && hasPerm) {
                return user // Found at least one matching permission
            }
        }

        throw new Error(`Unauthorized: Missing at least one of these permissions: ${requiredPermission.join(', ')}`)
    }

    // Si es un string, verificar exacto (AND logic - solo ese permiso)
    const { data: hasPerm, error: rpcError } = await userClient.rpc('has_permission', {
        required_permission: requiredPermission
    })

    if (rpcError) {
        console.error('Permission check failed:', rpcError)
        throw new Error('Unauthorized: Permission check failed')
    }

    if (!hasPerm) {
        throw new Error(`Unauthorized: Missing permission ${requiredPermission}`)
    }

    return user
}