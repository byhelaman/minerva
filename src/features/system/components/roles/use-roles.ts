/**
 * Hooks personalizados para la gestión de datos de roles.
 * Maneja la obtención, caché y alternancia (toogle) de permisos.
 */
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Role, Permission } from "./types";

interface UseRolesDataReturn {
    roles: Role[];
    permissions: Permission[];
    isLoading: boolean;
    error: string | null;
    refetch: (showLoading?: boolean) => Promise<void>;
}

/**
 * Hook para obtener y gestionar datos de roles y permisos.
 * Obtiene datos automáticamente cuando se abre el modal.
 */
export function useRolesData(open: boolean): UseRolesDataReturn {
    const [roles, setRoles] = useState<Role[]>([]);
    const [permissions, setPermissions] = useState<Permission[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchData = async (showLoading = true) => {
        if (showLoading) setIsLoading(true);
        setError(null);

        try {
            const { data: rolesData, error: rolesError } = await supabase.rpc('get_all_roles');
            if (rolesError) throw rolesError;

            const { data: permissionsData, error: permissionsError } = await supabase.rpc('get_all_permissions');
            if (permissionsError) {
                const { data: fallbackData, error: fallbackError } = await supabase
                    .from('permissions')
                    .select('*')
                    .order('min_role_level', { ascending: true });
                if (fallbackError) throw fallbackError;
                setPermissions(fallbackData || []);
            } else {
                setPermissions(permissionsData || []);
            }

            setRoles(rolesData || []);
        } catch (err: any) {
            console.error('Error fetching data:', err);
            setError(err.message || 'Failed to load roles');
        } finally {
            if (showLoading) setIsLoading(false);
        }
    };

    useEffect(() => {
        if (open) {
            fetchData();
        }
    }, [open]);

    return { roles, permissions, isLoading, error, refetch: fetchData };
}

interface UseRolePermissionsReturn {
    rolePermissions: string[];
    isLoadingPerms: boolean;
    isSavingPerm: string | null;
    togglePermission: (permName: string, hasPermission: boolean) => Promise<void>;
}

/**
 * Hook para gestionar permisos de un rol específico.
 * Maneja la carga y alternancia (agregar/quitar) de permisos.
 */
export function useRolePermissions(roleName: string | null, isSystemRole: boolean): UseRolePermissionsReturn {
    const [rolePermissions, setRolePermissions] = useState<string[]>([]);
    const [isLoadingPerms, setIsLoadingPerms] = useState(false);
    const [isSavingPerm, setIsSavingPerm] = useState<string | null>(null);

    useEffect(() => {
        const loadRolePermissions = async () => {
            if (!roleName) {
                setRolePermissions([]);
                return;
            }

            setIsLoadingPerms(true);
            try {
                const { data, error } = await supabase.rpc('get_role_permissions', {
                    target_role: roleName
                });

                if (error) throw error;
                setRolePermissions(data?.map((p: { permission: string }) => p.permission) || []);
            } catch (err) {
                console.error('Error loading role permissions:', err);
                setRolePermissions([]);
            } finally {
                setIsLoadingPerms(false);
            }
        };

        loadRolePermissions();
    }, [roleName]);

    const togglePermission = async (permName: string, hasPermission: boolean) => {
        if (!roleName || isSystemRole) return;

        setIsSavingPerm(permName);
        try {
            if (hasPermission) {
                const { error } = await supabase.rpc('remove_role_permission', {
                    target_role: roleName,
                    permission_name: permName
                });
                if (error) throw error;
                setRolePermissions(prev => prev.filter(p => p !== permName));
            } else {
                const { error } = await supabase.rpc('assign_role_permission', {
                    target_role: roleName,
                    permission_name: permName
                });
                if (error) throw error;
                setRolePermissions(prev => [...prev, permName]);
            }
        } catch (err: any) {
            console.error('Error toggling permission:', err);
            throw err;
        } finally {
            setIsSavingPerm(null);
        }
    };

    return { rolePermissions, isLoadingPerms, isSavingPerm, togglePermission };
}
