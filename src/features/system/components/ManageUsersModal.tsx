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
import { Input } from "@/components/ui/input";
import { Search, Loader2, Trash2, CircleAlert, Plus } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth-provider";
import {
    Field,
    FieldError,
    FieldGroup,
    FieldLabel,
} from "@/components/ui/field";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
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
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ManageUsersModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

interface User {
    id: string;
    email: string;
    display_name: string | null;
    role: string;
    hierarchy_level: number;
    created_at: string;
}

interface Role {
    name: string;
    description: string;
    hierarchy_level: number;
}

// Esquema de validación para crear usuario
const createUserSchema = z.object({
    email: z.string().email("Invalid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    displayName: z.string().optional(),
    role: z.string().min(1, "Role is required"),
});

type CreateUserFormData = z.infer<typeof createUserSchema>;

export function ManageUsersModal({ open, onOpenChange }: ManageUsersModalProps) {
    const { profile, hasPermission } = useAuth();
    const [searchQuery, setSearchQuery] = useState("");
    const [users, setUsers] = useState<User[]>([]);
    const [roles, setRoles] = useState<Role[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Delete confirmation state
    const [deleteConfirmUser, setDeleteConfirmUser] = useState<User | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Create user state
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isCreating, setIsCreating] = useState(false);

    const myLevel = profile?.hierarchy_level ?? 0;

    // Create user form
    const createForm = useForm<CreateUserFormData>({
        resolver: zodResolver(createUserSchema),
        defaultValues: { email: '', password: '', displayName: '', role: 'viewer' },
    });

    // Reset form when dialog closes
    useEffect(() => {
        if (!isCreateOpen) {
            createForm.reset();
        }
    }, [isCreateOpen]);

    // Fetch users and roles when modal opens
    useEffect(() => {
        if (open) {
            fetchData();
        }
    }, [open]);

    const fetchData = async () => {
        setIsLoading(true);
        setError(null);

        try {
            // Fetch users
            const { data: usersData, error: usersError } = await supabase.rpc('get_all_users');
            if (usersError) throw usersError;

            // Fetch roles
            const { data: rolesData, error: rolesError } = await supabase.rpc('get_all_roles');
            if (rolesError) throw rolesError;

            setUsers(usersData || []);
            setRoles(rolesData || []);
        } catch (err: any) {
            console.error('Error fetching data:', err);
            setError(err.message || 'Failed to load users');
        } finally {
            setIsLoading(false);
        }
    };

    const handleRoleChange = async (userId: string, newRole: string) => {
        try {
            const { error } = await supabase.rpc('update_user_role', {
                target_user_id: userId,
                new_role: newRole
            });

            if (error) throw error;

            // Update local state
            setUsers(prev => prev.map(u =>
                u.id === userId
                    ? { ...u, role: newRole, hierarchy_level: roles.find(r => r.name === newRole)?.hierarchy_level ?? u.hierarchy_level }
                    : u
            ));

            toast.success('Role updated successfully');
        } catch (err: any) {
            console.error('Error updating role:', err);
            toast.error(err.message || 'Failed to update role');
        }
    };

    const handleDeleteUser = async () => {
        if (!deleteConfirmUser) return;

        setIsDeleting(true);
        try {
            const { error } = await supabase.rpc('delete_user', {
                target_user_id: deleteConfirmUser.id
            });

            if (error) throw error;

            // Remove from local state
            setUsers(prev => prev.filter(u => u.id !== deleteConfirmUser.id));
            toast.success('User deleted successfully');
        } catch (err: any) {
            console.error('Error deleting user:', err);
            toast.error(err.message || 'Failed to delete user');
        } finally {
            setIsDeleting(false);
            setDeleteConfirmUser(null);
        }
    };

    // Crear nuevo usuario
    const handleCreateUser = async (data: CreateUserFormData) => {
        setIsCreating(true);
        try {
            // 1. Crear usuario con signUp
            const { data: authData, error: signUpError } = await supabase.auth.signUp({
                email: data.email,
                password: data.password,
                options: {
                    data: { display_name: data.displayName || null }
                }
            });

            if (signUpError) throw signUpError;
            if (!authData.user) throw new Error('Failed to create user');

            // 2. Asignar rol usando RPC (si no es viewer, que es el default)
            if (data.role !== 'viewer') {
                const { error: roleError } = await supabase.rpc('set_new_user_role', {
                    target_user_id: authData.user.id,
                    target_role: data.role
                });
                if (roleError) throw roleError;
            }

            toast.success('User created successfully');
            setIsCreateOpen(false);
            fetchData(); // Refrescar lista
        } catch (err: any) {
            console.error('Error creating user:', err);
            toast.error(err.message || 'Failed to create user');
        } finally {
            setIsCreating(false);
        }
    };

    const filteredUsers = users.filter(user =>
        user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (user.display_name?.toLowerCase() || '').includes(searchQuery.toLowerCase())
    );

    const getRoleBadgeVariant = (role: string) => {
        switch (role) {
            case "super_admin": return "default";
            case "admin": return "secondary";
            case "operator": return "outline";
            default: return "outline";
        }
    };

    // Check if current user can modify a target user (Permission + Hierarchy)
    const canModifyUser = (targetLevel: number) => {
        return hasPermission('users.manage') && (myLevel > targetLevel);
    };

    // Check if current user can delete users (Permission + Hierarchy)
    // Must have permission AND target must be lower rank
    const canDeleteUsers = (targetLevel: number) => {
        return hasPermission('users.manage') && (myLevel > targetLevel);
    };

    // Get assignable roles (only roles with level < my level)
    const getAssignableRoles = () => {
        return roles.filter(r => r.hierarchy_level < myLevel);
    };

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="sm:max-w-[600px]">
                    <DialogHeader>
                        <DialogTitle>Manage Users</DialogTitle>
                        <DialogDescription>
                            View and manage user accounts and their role assignments.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        {/* Search */}
                        <InputGroup>
                            <InputGroupAddon>
                                <Search className="size-4 text-muted-foreground" />
                            </InputGroupAddon>
                            <InputGroupInput
                                placeholder="Search users..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </InputGroup>

                        {/* Error State */}
                        {error && (
                            <Alert variant="destructive">
                                <CircleAlert />
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}

                        {/* Loading State */}
                        {isLoading && (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="size-6 animate-spin text-muted-foreground" />
                            </div>
                        )}

                        {/* Users List */}
                        {!isLoading && !error && (
                            <div className="border rounded-lg divide-y max-h-[400px] overflow-y-auto">
                                {filteredUsers.map((user) => (
                                    <div key={user.id} className="flex items-center justify-between p-3 px-4 hover:bg-muted/50">
                                        <div className="space-y-0.5 min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <p className="font-medium text-sm truncate">
                                                    {user.display_name || user.email.split('@')[0]}
                                                </p>
                                                {user.id === profile?.id && (
                                                    <Badge variant="secondary" className="text-xs">You</Badge>
                                                )}
                                            </div>
                                            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            {/* Role Select */}
                                            {canModifyUser(user.hierarchy_level) && user.id !== profile?.id ? (
                                                <Select
                                                    value={user.role}
                                                    onValueChange={(value) => handleRoleChange(user.id, value)}
                                                >
                                                    <SelectTrigger className="w-[120px] h-8" size="sm">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent align="end">
                                                        {getAssignableRoles().map((role) => (
                                                            <SelectItem key={role.name} value={role.name}>
                                                                {role.name}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            ) : (
                                                <Badge variant={getRoleBadgeVariant(user.role)}>
                                                    {user.role}
                                                </Badge>
                                            )}

                                            {/* Delete Button (users.manage permission + lower rank) */}
                                            {canDeleteUsers(user.hierarchy_level) && user.id !== profile?.id && (
                                                <Button
                                                    variant="secondary"
                                                    size="icon-sm"
                                                    onClick={() => setDeleteConfirmUser(user)}
                                                    className="border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive hover:border-destructive/50 focus-visible:ring-destructive/20 focus-visible:border-destructive dark:border-destructive/50 dark:bg-destructive/10 dark:text-destructive dark:hover:bg-destructive/20 dark:hover:text-destructive dark:hover:border-destructive/50 dark:focus-visible:ring-destructive/20 dark:focus-visible:border-destructive"
                                                >
                                                    <Trash2 />
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                {filteredUsers.length === 0 && (
                                    <div className="p-8 text-center text-muted-foreground text-sm">
                                        No users found
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Footer */}
                        <div className="flex justify-between items-center pt-2">
                            <p className="text-sm text-muted-foreground">
                                {filteredUsers.length} user(s)
                            </p>
                            {hasPermission('users.manage') && (
                                <Button
                                    size="sm"
                                    onClick={() => setIsCreateOpen(true)}
                                >
                                    <Plus />
                                    Create User
                                </Button>
                            )}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Create User Dialog */}
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Create User</DialogTitle>
                        <DialogDescription>
                            Create a new user account and assign a role.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={createForm.handleSubmit(handleCreateUser)} noValidate>
                        <FieldGroup>
                            <Field data-invalid={!!createForm.formState.errors.email}>
                                <FieldLabel htmlFor="user-email">Email</FieldLabel>
                                <Input
                                    id="user-email"
                                    type="email"
                                    placeholder="user@example.com"
                                    {...createForm.register("email")}
                                    aria-invalid={!!createForm.formState.errors.email}
                                    disabled={isCreating}
                                />
                                <FieldError errors={[createForm.formState.errors.email]} />
                            </Field>
                            <Field data-invalid={!!createForm.formState.errors.password}>
                                <FieldLabel htmlFor="user-password">Password</FieldLabel>
                                <Input
                                    id="user-password"
                                    type="password"
                                    {...createForm.register("password")}
                                    aria-invalid={!!createForm.formState.errors.password}
                                    disabled={isCreating}
                                />
                                <FieldError errors={[createForm.formState.errors.password]} />
                            </Field>
                            <Field>
                                <FieldLabel htmlFor="user-displayname">Display Name (optional)</FieldLabel>
                                <Input
                                    id="user-displayname"
                                    placeholder="John Doe"
                                    {...createForm.register("displayName")}
                                    disabled={isCreating}
                                />
                            </Field>
                            <Field data-invalid={!!createForm.formState.errors.role}>
                                <FieldLabel htmlFor="user-role">Role</FieldLabel>
                                <Select
                                    value={createForm.watch("role")}
                                    onValueChange={(value) => createForm.setValue("role", value)}
                                    disabled={isCreating}
                                >
                                    <SelectTrigger id="user-role">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {getAssignableRoles().map((role) => (
                                            <SelectItem key={role.name} value={role.name}>
                                                {role.name} (Level {role.hierarchy_level})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FieldError errors={[createForm.formState.errors.role]} />
                            </Field>
                        </FieldGroup>
                        <DialogFooter className="mt-6">
                            <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={isCreating}>
                                {isCreating && <Loader2 className="animate-spin" />}
                                Create User
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={!!deleteConfirmUser} onOpenChange={() => setDeleteConfirmUser(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete User</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete <strong>{deleteConfirmUser?.display_name || deleteConfirmUser?.email}</strong>?
                            This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteUser}
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
