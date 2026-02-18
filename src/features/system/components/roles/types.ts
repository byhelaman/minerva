/**
 * Tipos, esquemas y constantes para el módulo de Roles.
 * Compartido entre todos los componentes relacionados con roles.
 */
import { z } from "zod";

/** Entidad Rol de la base de datos */
export interface Role {
    name: string;
    description: string;
    hierarchy_level: number;
}

/** Entidad Permiso con nivel mínimo requerido */
export interface Permission {
    name: string;
    description: string;
    min_role_level: number;
}

/** Esquema Zod para validación del formulario de creación de rol */
export const createRoleSchema = z.object({
    name: z.string().min(1, "Role name is required").max(50, "Name too long"),
    description: z.string().max(200, "Description too long").optional(),
    level: z.number().min(1, "Min level is 1").max(99, "Max level is 99"),
});

/** Esquema Zod para edición de rol (solo descripción) */
export const editRoleSchema = z.object({
    description: z.string().max(200, "Description too long").optional(),
});

// Tipos inferidos de los esquemas
export type CreateRoleFormData = z.infer<typeof createRoleSchema>;
export type EditRoleFormData = z.infer<typeof editRoleSchema>;

/** Roles de sistema protegidos que no pueden ser eliminados ni modificados sus permisos */
export const SYSTEM_ROLES = ['super_admin', 'admin', 'operator', 'viewer', 'guest'] as const;

// Helpers
export const isSystemRole = (roleName: string) => SYSTEM_ROLES.includes(roleName as any);
