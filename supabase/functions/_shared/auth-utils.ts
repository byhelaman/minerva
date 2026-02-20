// Supabase Edge Function: Shared Auth Utilities
// Funciones compartidas de autenticación y autorización para Edge Functions

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { timingSafeEqual } from 'https://deno.land/std@0.168.0/crypto/timing_safe_equal.ts'


// =============================================
// Comparación timing-safe para strings
// =============================================
export function constantTimeEqual(a: string, b: string): boolean {
    const encoder = new TextEncoder()
    const bufA = encoder.encode(a)
    const bufB = encoder.encode(b)

    if (bufA.byteLength !== bufB.byteLength) return false
    return timingSafeEqual(bufA, bufB)
}

// =============================================
// Verificación por clave interna (timing-safe)
// =============================================
// FIX: Usa comparación timing-safe en lugar de === directo
export function verifyInternalKey(req: Request): boolean {
    const INTERNAL_API_KEY = Deno.env.get('INTERNAL_API_KEY')
    if (!INTERNAL_API_KEY) return false

    const providedKey = req.headers.get('x-internal-key')
    if (!providedKey) return false

    return constantTimeEqual(providedKey, INTERNAL_API_KEY)
}

// =============================================
// Verificación combinada: usuario + clave interna
// =============================================
export async function verifyAccess(
    req: Request,
    supabase: SupabaseClient,
    requiredPermission: string
): Promise<boolean> {
    const authHeader = req.headers.get('authorization')
    if (authHeader) {
        try {
            await verifyPermission(req, supabase, requiredPermission)
            return true
        } catch {
            // Continuar con la verificación de clave interna
        }
    }

    return verifyInternalKey(req)
}

// =============================================
// Verificación por permiso granular (JWT-based)
// =============================================
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

    // Crear cliente con token del usuario para que auth.jwt() funcione en has_permission
    const userClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        {
            global: {
                headers: { Authorization: authHeader }
            }
        }
    )

    // Array de permisos: verificar AL MENOS UNO (OR logic)
    if (Array.isArray(requiredPermission)) {
        for (const perm of requiredPermission) {
            const { data: hasPerm, error: rpcError } = await userClient.rpc('has_permission', {
                required_permission: perm
            })

            if (!rpcError && hasPerm) {
                return user
            }
        }

        throw new Error('Unauthorized: Insufficient permissions')
    }

    // String: verificar permiso exacto
    const { data: hasPerm, error: rpcError } = await userClient.rpc('has_permission', {
        required_permission: requiredPermission
    })

    if (rpcError) {
        throw new Error('Unauthorized: Permission check failed')
    }

    if (!hasPerm) {
        throw new Error('Unauthorized: Insufficient permissions')
    }

    return user
}
