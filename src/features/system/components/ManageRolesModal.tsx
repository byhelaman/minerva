/**
 * Modal principal para gestionar roles y permisos.
 * Orquesta subcomponentes: RolesList, RoleDetails y diálogos.
 * 
 * @see ./roles/ - Subcomponentes y hooks
 */
import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, CircleAlert, Plus } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/components/auth-provider";
import { toast } from "sonner";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/lib/supabase";
import {
    Role,
    CreateRoleFormData,
    EditRoleFormData,
    useRolesData,
    useRolePermissions,
    RolesList,
    RoleDetails,
    RoleDetailsEmpty,
    CreateRoleDialog,
    EditRoleDialog,
} from "./roles";

interface ManageRolesModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function ManageRolesModal({ open, onOpenChange }: ManageRolesModalProps) {
    const { profile, isSuperAdmin } = useAuth();
    const [selectedRole, setSelectedRole] = useState<string | null>(null);

    // Dialog states
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [editingRole, setEditingRole] = useState<Role | null>(null);
    const [deleteRoleName, setDeleteRoleName] = useState<string | null>(null);

    // Loading states
    const [isCreating, setIsCreating] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const myLevel = profile?.hierarchy_level ?? 0;

    // Data hooks
    const { roles, permissions, isLoading, error, refetch } = useRolesData(open);

    const currentRole = roles.find(r => r.name === selectedRole);
    const isSuperAdminRole = currentRole?.name === 'super_admin';

    const { rolePermissions, isLoadingPerms, isSavingPerm, togglePermission } =
        useRolePermissions(selectedRole, isSuperAdminRole);

    // Auto-select first role when data loads
    if (roles.length > 0 && !selectedRole) {
        setSelectedRole(roles[0].name);
    }

    const canModifyRole = (roleLevel: number) => {
        return isSuperAdmin() && roleLevel < myLevel;
    };

    // Permitir edición de permisos para cualquier rol con nivel menor (excepto super_admin)
    const canEditPermissions = currentRole
        && currentRole.name !== 'super_admin'
        && canModifyRole(currentRole.hierarchy_level);

    const handleCreateRole = async (data: CreateRoleFormData) => {
        setIsCreating(true);
        try {
            const { error } = await supabase.rpc('create_role', {
                role_name: data.name.toLowerCase().replace(/\s+/g, '_'),
                role_description: data.description || '',
                role_level: data.level
            });

            if (error) throw error;

            toast.success('Role created successfully');
            setIsCreateOpen(false);
            refetch(false);
        } catch (err: any) {
            console.error('Error creating role:', err);
            toast.error(err.message || 'Failed to create role');
        } finally {
            setIsCreating(false);
        }
    };

    const handleEditRole = async (data: EditRoleFormData) => {
        if (!editingRole) return;

        setIsEditing(true);
        try {
            const { error } = await supabase.rpc('update_role', {
                role_name: editingRole.name,
                new_description: data.description || ''
            });

            if (error) throw error;

            toast.success('Role updated successfully');
            setIsEditOpen(false);
            refetch(false);
        } catch (err: any) {
            console.error('Error updating role:', err);
            toast.error(err.message || 'Failed to update role');
        } finally {
            setIsEditing(false);
        }
    };

    const handleDeleteRole = async () => {
        if (!deleteRoleName) return;

        setIsDeleting(true);
        try {
            const { error } = await supabase.rpc('delete_role', {
                role_name: deleteRoleName
            });

            if (error) throw error;

            toast.success('Role deleted successfully');
            setDeleteRoleName(null);
            if (selectedRole === deleteRoleName) {
                setSelectedRole(null);
            }
            refetch(false);
        } catch (err: any) {
            console.error('Error deleting role:', err);
            toast.error(err.message || 'Failed to delete role');
        } finally {
            setIsDeleting(false);
        }
    };

    const openEditDialog = (role: Role) => {
        setEditingRole(role);
        setIsEditOpen(true);
    };

    const handleTogglePermission = async (permName: string, hasPermission: boolean) => {
        try {
            await togglePermission(permName, hasPermission);
        } catch (err: any) {
            toast.error(err.message || 'Failed to update permission');
        }
    };

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="sm:max-w-[760px] gap-6">
                    <DialogHeader>
                        <DialogTitle>Roles & Permissions</DialogTitle>
                        <DialogDescription>
                            View role hierarchies and their permission assignments.
                        </DialogDescription>
                    </DialogHeader>

                    {isLoading && (
                        <div className="flex items-center justify-center py-8 h-[300px]">
                            <Loader2 className="size-6 animate-spin text-muted-foreground" />
                        </div>
                    )}

                    {error && (
                        <Alert variant="destructive">
                            <CircleAlert className="size-4" />
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    {!isLoading && !error && (
                        <div className="flex gap-3">
                            <RolesList
                                roles={roles}
                                selectedRole={selectedRole}
                                onSelectRole={setSelectedRole}
                            />

                            {currentRole ? (
                                <RoleDetails
                                    role={currentRole}
                                    permissions={permissions}
                                    rolePermissions={rolePermissions}
                                    isLoadingPerms={isLoadingPerms}
                                    isSavingPerm={isSavingPerm}
                                    canEditPermissions={canEditPermissions ?? false}
                                    canModify={canModifyRole(currentRole.hierarchy_level)}
                                    onTogglePermission={handleTogglePermission}
                                    onEdit={() => openEditDialog(currentRole)}
                                    onDelete={() => setDeleteRoleName(currentRole.name)}
                                />
                            ) : (
                                <RoleDetailsEmpty />
                            )}
                        </div>
                    )}

                    <DialogFooter>
                        {isSuperAdmin() && (
                            <Button
                                size="sm"
                                onClick={() => setIsCreateOpen(true)}
                            >
                                <Plus />
                                New Role
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Create Role Dialog */}
            <CreateRoleDialog
                open={isCreateOpen}
                onOpenChange={setIsCreateOpen}
                isCreating={isCreating}
                onSubmit={handleCreateRole}
            />

            {/* Edit Role Dialog */}
            <EditRoleDialog
                open={isEditOpen}
                onOpenChange={setIsEditOpen}
                role={editingRole}
                isEditing={isEditing}
                onSubmit={handleEditRole}
            />

            {/* Delete Confirmation */}
            <AlertDialog open={!!deleteRoleName} onOpenChange={(open) => !open && setDeleteRoleName(null)}>
                <AlertDialogContent onCloseAutoFocus={(e) => e.preventDefault()}>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Role</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete the role <span className="font-semibold">{deleteRoleName}</span>?
                            This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteRole}
                            disabled={isDeleting}
                        >
                            {isDeleting && <Loader2 className="animate-spin" />}
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
