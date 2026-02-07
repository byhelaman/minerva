import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User, AuthChangeEvent } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { jwtDecode } from "jwt-decode";
import { logger } from "@/lib/logger";
import { toast } from "sonner";

// Tipos
export interface Profile {
    id: string;
    email: string;
    display_name: string | null;
    role: string;
    hierarchy_level: number;
    permissions: string[];
}

// Claims custom en el JWT
interface JWTClaims {
    user_role?: string;  // Renombrado de 'role' para evitar conflicto con rol de PostgreSQL
    hierarchy_level?: number;
    permissions?: string[];  // Permisos del rol desde role_permissions
    sub: string;
    email?: string;
}

interface AuthContextType {
    session: Session | null;
    user: User | null;
    profile: Profile | null;
    isLoading: boolean;
    signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
    signUp: (email: string, password: string, displayName?: string) => Promise<{ error: Error | null }>;
    signOut: () => Promise<void>;
    hasPermission: (permission: string) => boolean;
    isAdmin: () => boolean;
    isSuperAdmin: () => boolean;
    sendResetPasswordEmail: (email: string) => Promise<{ error: Error | null }>;
    verifyOtp: (email: string, token: string, type: "email" | "signup" | "recovery") => Promise<{ data: any; error: Error | null }>;
    updatePassword: (password: string) => Promise<{ error: Error | null }>;
    updateDisplayName: (displayName: string) => Promise<{ error: Error | null }>;
    refreshProfile: () => Promise<void>;
    verifyCurrentPassword: (password: string) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ── Registro de callbacks de limpieza al cerrar sesión ─────────────
// Permite que stores/features registren su cleanup sin acoplar el provider.
const signOutCleanupCallbacks: Array<() => void> = [];

/** Registra una función que se ejecutará al cerrar sesión */
export function registerSignOutCleanup(callback: () => void): () => void {
    signOutCleanupCallbacks.push(callback);
    // Retorna función para desregistrar
    return () => {
        const idx = signOutCleanupCallbacks.indexOf(callback);
        if (idx !== -1) signOutCleanupCallbacks.splice(idx, 1);
    };
}

// Extraer profile desde el JWT + user metadata (sin llamar RPC)
const extractProfileFromSession = (session: Session): Profile => {
    const user = session.user;

    // Decodificar JWT para obtener custom claims
    let claims: JWTClaims = { sub: user.id };
    try {
        claims = jwtDecode<JWTClaims>(session.access_token);
    } catch (err) {
        console.warn("[Auth] Error decoding JWT:", err);
    }

    // Construir profile desde JWT claims + user metadata
    const hierarchyLevel = claims.hierarchy_level ?? 0;
    const role = claims.user_role ?? "viewer";

    // Leer permisos directamente del JWT (vienen de role_permissions)
    const permissions = claims.permissions ?? ["schedules.read"];

    return {
        id: user.id,
        email: user.email || "",
        display_name: user.user_metadata?.display_name || null,
        role,
        hierarchy_level: hierarchyLevel,
        permissions,
    };
};

export function AuthProvider({ children }: { children: ReactNode }) {
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Handler centralizado para cambios de sesión
    const handleSessionChange = async (
        event: AuthChangeEvent,
        newSession: Session | null
    ) => {
        logger.debug(`[Auth] Event: ${event}`, newSession ? "with session" : "no session");

        // Helper para procesar sesión válida
        const processValidSession = (session: Session) => {
            setSession(session);
            setUser(session.user);
            const profileData = extractProfileFromSession(session);
            setProfile(profileData);
            setIsLoading(false);
        };

        switch (event) {
            case "INITIAL_SESSION":
                // Health check: Verificar que el usuario aún existe en la DB
                if (newSession) {
                    const exists = await verifyUserExists(newSession.user.id);
                    if (!exists) {
                        logger.debug('[Auth] User no longer exists, forcing sign out');
                        await supabase.auth.signOut();
                        setIsLoading(false);
                        return;
                    }
                    processValidSession(newSession);
                } else {
                    setProfile(null);
                    setIsLoading(false);
                }
                break;

            case "SIGNED_IN":
            case "TOKEN_REFRESHED":
            case "PASSWORD_RECOVERY":
            case "USER_UPDATED":
                if (newSession) {
                    processValidSession(newSession);
                } else {
                    setSession(null);
                    setUser(null);
                    setProfile(null);
                    setIsLoading(false);
                }
                break;

            case "SIGNED_OUT":
                setSession(null);
                setUser(null);
                setProfile(null);
                setIsLoading(false);
                break;

            default:
                logger.debug(`[Auth] Unhandled event: ${event}`);
                if (newSession) {
                    setSession(newSession);
                    setUser(newSession.user);
                }
        }
    };

    // Inicializar estado de autenticación
    useEffect(() => {
        let mounted = true;

        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                if (!mounted) return;
                await handleSessionChange(event, session);
            }
        );

        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    }, []);

    // Realtime: Escuchar cambios en el perfil del usuario actual
    // Si el admin cambia el rol o elimina al usuario, reaccionar inmediatamente
    useEffect(() => {
        if (!user?.id) return;

        const channel = supabase
            .channel(`profile-changes-${user.id}`)
            .on(
                'postgres_changes',
                {
                    event: '*', // INSERT, UPDATE, DELETE
                    schema: 'public',
                    table: 'profiles',
                    filter: `id=eq.${user.id}`,
                },
                async (payload) => {
                    logger.debug('[Auth] Realtime profile change:', payload.eventType);

                    if (payload.eventType === 'DELETE') {
                        // Usuario eliminado → logout inmediato
                        logger.debug('[Auth] User deleted, forcing sign out');
                        await supabase.auth.signOut();
                        return;
                    }

                    if (payload.eventType === 'UPDATE') {
                        // Rol o permisos cambiaron → refrescar sesión para nuevo JWT
                        const oldRole = profile?.role;
                        const newRole = (payload.new as any)?.role;

                        if (oldRole !== newRole) {
                            logger.debug('[Auth] Role changed, refreshing session');
                            await supabase.auth.refreshSession();
                        }
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user?.id, profile?.role]);

    // Health check: Verificar que el usuario existe al restaurar sesión
    const verifyUserExists = async (userId: string): Promise<boolean> => {
        const { data, error } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', userId)
            .single();

        return !error && !!data;
    };

    // Iniciar sesión
    const signIn = async (email: string, password: string) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error: error as Error | null };
    };

    // Registrar usuario
    const signUp = async (email: string, password: string, displayName?: string) => {
        const { error } = await supabase.auth.signUp({
            email,
            password,
            options: { data: { display_name: displayName || null } },
        });
        return { error: error as Error | null };
    };

    // Cerrar sesión
    const signOut = async () => {
        // Limpiar configuración de versiones descartadas y estado de sesión
        const keysToRemove = [
            'dismissed_schedule_versions',
            'minerva_connection_config',
            'minerva_rate_limit',
            'current_schedule_version'
        ];

        keysToRemove.forEach(k => localStorage.removeItem(k));

        // Limpiar caché de UI con prefijos dinámicos
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('minerva_ui_')) {
                localStorage.removeItem(key);
            }
        });

        // Limpiar estado registrado (stores, etc.)
        signOutCleanupCallbacks.forEach(cb => cb());

        toast.dismiss();
        await supabase.auth.signOut();
    };

    // Enviar email de reset
    const sendResetPasswordEmail = async (email: string) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email);
        return { error: error as Error | null };
    };

    // Verificar OTP
    const verifyOtp = async (email: string, token: string, type: "email" | "signup" | "recovery") => {
        const { data, error } = await supabase.auth.verifyOtp({ email, token, type });
        return { data, error: error as Error | null };
    };

    // Actualizar contraseña
    const updatePassword = async (password: string) => {
        const { error } = await supabase.auth.updateUser({ password });
        return { error: error as Error | null };
    };

    // Verificar permiso
    const hasPermission = (permission: string): boolean => {
        if (!profile) return false;
        return profile.permissions?.includes(permission) ?? false;
    };

    // Verificar si es admin
    const isAdmin = (): boolean => {
        return (profile?.hierarchy_level ?? 0) >= 80;
    };

    // Verificar si es super_admin
    const isSuperAdmin = (): boolean => {
        return (profile?.hierarchy_level ?? 0) >= 100;
    };

    // Actualizar display name
    const updateDisplayName = async (displayName: string) => {
        // 1. Primero actualizar en profiles via RPC (mientras la sesión es estable)
        const { error: profileError } = await supabase.rpc("update_my_display_name", {
            new_display_name: displayName,
        });
        if (profileError) return { error: profileError as Error };

        // 2. Luego actualizar en auth.users (esto dispara USER_UPDATED)
        const { error: authError } = await supabase.auth.updateUser({
            data: { display_name: displayName },
        });
        if (authError) return { error: authError as Error };

        // 3. Refrescar sesión para obtener nuevo JWT con metadata actualizado
        const { data, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError) return { error: refreshError as Error };

        if (data.session) {
            const newProfile = extractProfileFromSession(data.session);
            setProfile(newProfile);
        }

        return { error: null };
    };

    // Refrescar perfil (refresca la sesión para obtener claims actualizados)
    const refreshProfile = async () => {
        const { data } = await supabase.auth.refreshSession();
        if (data.session) {
            const newProfile = extractProfileFromSession(data.session);
            setProfile(newProfile);
        }
    };

    // Verificar contraseña actual
    const verifyCurrentPassword = async (password: string) => {
        if (!profile?.email) {
            return { error: new Error("No email found") };
        }
        const { error } = await supabase.auth.signInWithPassword({
            email: profile.email,
            password,
        });
        return { error: error as Error | null };
    };

    return (
        <AuthContext.Provider
            value={{
                session,
                user,
                profile,
                isLoading,
                signIn,
                signUp,
                signOut,
                hasPermission,
                isAdmin,
                isSuperAdmin,
                sendResetPasswordEmail,
                verifyOtp,
                updatePassword,
                updateDisplayName,
                refreshProfile,
                verifyCurrentPassword,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
}
