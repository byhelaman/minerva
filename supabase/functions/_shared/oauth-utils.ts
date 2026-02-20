// =============================================
// Utilidad compartida para manejar el estado OAuth 
// =============================================

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Crea de forma segura un string de estado OAuth usando RPC y validando los errores.
 */
export async function createOAuthState(supabase: SupabaseClient, userId: string): Promise<string> {
    const { data: state, error: stateError } = await supabase.rpc('create_oauth_state', { p_user_id: userId })

    if (stateError || !state) {
        console.error('OAuth state creation failed:', stateError)
        throw new Error('OAuth state creation failed')
    }

    return state
}

/**
 * Valida un string de estado OAuth existente y retorna el ID de usuario si es correcto y aún válido.
 * Si es inválido, retorna null.
 */
export async function validateOAuthState(supabase: SupabaseClient, state: string): Promise<string | null> {
    const { data: userId, error: stateError } = await supabase.rpc('validate_oauth_state', { p_state: state })

    if (stateError || !userId) {
        return null
    }

    return userId
}
