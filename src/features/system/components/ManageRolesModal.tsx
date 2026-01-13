import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, Loader2, CircleAlert, Plus, Pencil, Trash2, Shield, Lock } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/lib/supabase";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    Field,
    FieldDescription,
    FieldError,
    FieldGroup,
    FieldLabel,
} from "@/components/ui/field";

interface ManageRolesModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

interface Role {
    name: string;
    description: string;
    hierarchy_level: number;
}

interface Permission {
    name: string;
    description: string;
    min_role_level: number;
}

// Schemas
const createRoleSchema = z.object({
    name: z.string().min(1, "Role name is required").max(50, "Name too long"),
    description: z.string().max(200, "Description too long").optional(),
    level: z.number().min(1, "Min level is 1").max(99, "Max level is 99"),
});

const editRoleSchema = z.object({
    description: z.string().max(200, "Description too long").optional(),
});

// Roles del sistema que no se pueden eliminar
const SYSTEM_ROLES = ['super_admin', 'admin', 'operator', 'viewer'];

export function ManageRolesModal({ open, onOpenChange }: ManageRolesModalProps) {
    const { profile, isSuperAdmin } = useAuth();
    const [selectedRole, setSelectedRole] = useState<string | null>(null);
    const [roles, setRoles] = useState<Role[]>([]);
    const [permissions, setPermissions] = useState<Permission[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Dialog states
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [editRoleName, setEditRoleName] = useState("");
    const [deleteRoleName, setDeleteRoleName] = useState<string | null>(null);

    // Loading states
    const [isCreating, setIsCreating] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const myLevel = profile?.hierarchy_level ?? 0;

    // Create form
    const createForm = useForm<z.infer<typeof createRoleSchema>>({
        resolver: zodResolver(createRoleSchema),
        defaultValues: { name: '', description: '', level: 50 },
    });

    // Edit form
    const editForm = useForm<z.infer<typeof editRoleSchema>>({
        resolver: zodResolver(editRoleSchema),
        defaultValues: { description: '' },
    });

    // Fetch roles and permissions when modal opens
    useEffect(() => {
        if (open) {
            fetchData();
        }
    }, [open]);

    // Reset create form when dialog closes
    useEffect(() => {
        if (!isCreateOpen) {
            createForm.reset();
        }
    }, [isCreateOpen]);

    const fetchData = async () => {
        setIsLoading(true);
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

            if (rolesData && rolesData.length > 0 && !selectedRole) {
                setSelectedRole(rolesData[0].name);
            }
        } catch (err: any) {
            console.error('Error fetching data:', err);
            setError(err.message || 'Failed to load roles');
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateRole = async (data: z.infer<typeof createRoleSchema>) => {
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
            createForm.reset();
            fetchData();
        } catch (err: any) {
            console.error('Error creating role:', err);
            toast.error(err.message || 'Failed to create role');
        } finally {
            setIsCreating(false);
        }
    };

    const handleEditRole = async (data: z.infer<typeof editRoleSchema>) => {
        setIsEditing(true);
        try {
            const { error } = await supabase.rpc('update_role', {
                role_name: editRoleName,
                new_description: data.description || ''
            });

            if (error) throw error;

            toast.success('Role updated successfully');
            setIsEditOpen(false);
            fetchData();
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
            fetchData();
        } catch (err: any) {
            console.error('Error deleting role:', err);
            toast.error(err.message || 'Failed to delete role');
        } finally {
            setIsDeleting(false);
        }
    };

    const openEditDialog = (role: Role) => {
        setEditRoleName(role.name);
        editForm.reset({ description: role.description });
        setIsEditOpen(true);
    };

    const currentRole = roles.find(r => r.name === selectedRole);

    const rolePermissions = currentRole
        ? permissions.filter(p => p.min_role_level <= currentRole.hierarchy_level)
        : [];

    const canModifyRole = (roleLevel: number) => {
        return isSuperAdmin() && roleLevel < myLevel;
    };

    const isSystemRole = (roleName: string) => SYSTEM_ROLES.includes(roleName);

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="sm:max-w-[700px] gap-6">
                    <DialogHeader>
                        <DialogTitle>Roles & Permissions</DialogTitle>
                        <DialogDescription>
                            View role hierarchies and their permission assignments.
                        </DialogDescription>
                    </DialogHeader>

                    {error && (
                        <Alert variant="destructive">
                            <CircleAlert />
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    {isLoading && (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="size-6 animate-spin text-muted-foreground" />
                        </div>
                    )}

                    {!isLoading && !error && (
                        <div className="flex gap-4">
                            <div className="w-[200px] shrink-0">
                                <ScrollArea className="h-[380px] pr-3">
                                    <div className="space-y-1">
                                        {roles.map((role) => (
                                            <button
                                                key={role.name}
                                                onClick={() => setSelectedRole(role.name)}
                                                className={`w-full flex items-center justify-between p-2.5 px-3 rounded-md hover:bg-muted/50 text-left transition-colors ${selectedRole === role.name ? "bg-muted" : ""
                                                    }`}
                                            >
                                                <div className="flex items-center gap-2 min-w-0">
                                                    {isSystemRole(role.name) ? (
                                                        <Shield className="size-3.5 text-muted-foreground shrink-0" />
                                                    ) : (
                                                        <div className="size-3.5" />
                                                    )}
                                                    <div className="min-w-0">
                                                        <p className="font-medium text-sm truncate">{role.name}</p>
                                                        <p className="text-xs text-muted-foreground">Level {role.hierarchy_level}</p>
                                                    </div>
                                                </div>
                                                <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                                            </button>
                                        ))}
                                    </div>
                                </ScrollArea>
                            </div>

                            <Card className="shadow-none flex-1 bg-muted/30">
                                {currentRole ? (
                                    <>
                                        <CardHeader className="grid grid-rows-1">
                                            <div className="flex items-start justify-between gap-4">
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <CardTitle className="text-lg">{currentRole.name}</CardTitle>
                                                        {isSystemRole(currentRole.name) && (
                                                            <Lock className="size-3.5 text-muted-foreground" />
                                                        )}
                                                    </div>
                                                    <CardDescription>{currentRole.description}</CardDescription>
                                                </div>
                                                <Badge variant="secondary" className="shrink-0">
                                                    Level {currentRole.hierarchy_level}
                                                </Badge>
                                            </div>
                                        </CardHeader>
                                        <CardContent>
                                            <p className="text-xs font-medium text-muted-foreground mb-3">
                                                PERMISSIONS ({rolePermissions.length})
                                            </p>
                                            <div className="space-y-2">
                                                {rolePermissions.map((perm) => (
                                                    <div key={perm.name} className="flex items-start gap-2 text-sm">
                                                        <Badge variant="outline" className="text-xs shrink-0 font-mono">
                                                            {perm.name}
                                                        </Badge>
                                                        <span className="text-muted-foreground text-xs pt-0.5">
                                                            {perm.description}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </CardContent>
                                        {canModifyRole(currentRole.hierarchy_level) && (
                                            <CardFooter className="gap-2 pt-4 border-t">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => openEditDialog(currentRole)}
                                                >
                                                    <Pencil />
                                                    Edit
                                                </Button>
                                                {!isSystemRole(currentRole.name) && (
                                                    <Button
                                                        variant="secondary"
                                                        size="sm"
                                                        onClick={() => setDeleteRoleName(currentRole.name)}
                                                    >
                                                        <Trash2 className="size-3.5" />
                                                        Delete
                                                    </Button>
                                                )}
                                            </CardFooter>
                                        )}
                                    </>
                                ) : (
                                    <CardContent className="flex items-center justify-center min-h-[300px]">
                                        <p className="text-sm text-muted-foreground">
                                            Select a role to view details
                                        </p>
                                    </CardContent>
                                )}
                            </Card>
                        </div>
                    )}

                    <DialogFooter>
                        {isSuperAdmin() && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setIsCreateOpen(true)}
                            >
                                <Plus />
                                Create Role
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Create Role Dialog */}
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Create New Role</DialogTitle>
                        <DialogDescription>
                            Create a custom role with a specific hierarchy level.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={createForm.handleSubmit(handleCreateRole)}>
                        <FieldGroup>
                            <Field data-invalid={!!createForm.formState.errors.name}>
                                <FieldLabel htmlFor="role-name">Role Name</FieldLabel>
                                <Input
                                    id="role-name"
                                    placeholder="e.g., moderator"
                                    {...createForm.register("name")}
                                    aria-invalid={!!createForm.formState.errors.name}
                                    disabled={isCreating}
                                />
                                <FieldDescription>Will be converted to lowercase with underscores</FieldDescription>
                                <FieldError errors={[createForm.formState.errors.name]} />
                            </Field>
                            <Field data-invalid={!!createForm.formState.errors.description}>
                                <FieldLabel htmlFor="role-description">Description</FieldLabel>
                                <Textarea
                                    id="role-description"
                                    placeholder="What can this role do?"
                                    {...createForm.register("description")}
                                    rows={2}
                                    disabled={isCreating}
                                />
                                <FieldError errors={[createForm.formState.errors.description]} />
                            </Field>
                            <Field data-invalid={!!createForm.formState.errors.level}>
                                <FieldLabel htmlFor="role-level">Hierarchy Level (1-99)</FieldLabel>
                                <Input
                                    id="role-level"
                                    type="number"
                                    min={1}
                                    max={99}
                                    {...createForm.register("level", { valueAsNumber: true })}
                                    disabled={isCreating}
                                />
                                <FieldDescription>Higher level = more permissions. Max: 99</FieldDescription>
                                <FieldError errors={[createForm.formState.errors.level]} />
                            </Field>
                        </FieldGroup>
                        <DialogFooter className="mt-6">
                            <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={isCreating}>
                                {isCreating && <Loader2 className="size-4 animate-spin" />}
                                Create Role
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Edit Role Dialog */}
            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Edit Role: {editRoleName}</DialogTitle>
                        <DialogDescription>
                            Update the role description.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={editForm.handleSubmit(handleEditRole)}>
                        <FieldGroup>
                            <Field data-invalid={!!editForm.formState.errors.description}>
                                <FieldLabel htmlFor="edit-description">Description</FieldLabel>
                                <Textarea
                                    id="edit-description"
                                    {...editForm.register("description")}
                                    rows={3}
                                    disabled={isEditing}
                                />
                                <FieldError errors={[editForm.formState.errors.description]} />
                            </Field>
                        </FieldGroup>
                        <DialogFooter className="mt-6">
                            <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={isEditing}>
                                {isEditing && <Loader2 className="size-4 animate-spin" />}
                                Save Changes
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Delete Role Confirmation */}
            <AlertDialog open={!!deleteRoleName} onOpenChange={() => setDeleteRoleName(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Role</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete the role <strong>{deleteRoleName}</strong>?
                            This action cannot be undone. Users assigned to this role will need to be reassigned.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteRole}
                            disabled={isDeleting}
                        >
                            {isDeleting && <Loader2 className="size-4 animate-spin mr-2" />}
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
