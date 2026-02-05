/**
 * Componentes de diálogo para crear y editar roles.
 * Utiliza react-hook-form con validación zod.
 */
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Field,
    FieldDescription,
    FieldError,
    FieldGroup,
    FieldLabel,
} from "@/components/ui/field";
import { createRoleSchema, editRoleSchema, CreateRoleFormData, EditRoleFormData, Role } from "./types";

interface CreateRoleDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    isCreating: boolean;
    onSubmit: (data: CreateRoleFormData) => Promise<void>;
}

/** Diálogo para crear un nuevo rol personalizado */
export function CreateRoleDialog({ open, onOpenChange, isCreating, onSubmit }: CreateRoleDialogProps) {
    const form = useForm<CreateRoleFormData>({
        resolver: zodResolver(createRoleSchema),
        defaultValues: { name: '', description: '', level: 50 },
    });

    useEffect(() => {
        if (!open) {
            form.reset();
        }
    }, [open]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md" onCloseAutoFocus={(e) => e.preventDefault()}>
                <DialogHeader>
                    <DialogTitle>Create New Role</DialogTitle>
                    <DialogDescription>
                        Add a custom role with specific permissions.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
                    <FieldGroup>
                        <Field data-invalid={!!form.formState.errors.name}>
                            <FieldLabel htmlFor="role-name">Role Name</FieldLabel>
                            <Input
                                id="role-name"
                                placeholder="e.g. moderator"
                                {...form.register("name")}
                                disabled={isCreating}
                            />
                            <FieldError errors={[form.formState.errors.name]} />
                        </Field>
                        <Field>
                            <FieldLabel htmlFor="role-level">Hierarchy Level</FieldLabel>
                            <Input
                                id="role-level"
                                type="number"
                                min={1}
                                max={99}
                                {...form.register("level", { valueAsNumber: true })}
                                disabled={isCreating}
                            />
                            <FieldDescription>Higher level = more permissions. Max: 99</FieldDescription>
                            <FieldError errors={[form.formState.errors.level]} />
                        </Field>
                        <Field>
                            <FieldLabel htmlFor="role-description">Description</FieldLabel>
                            <Textarea
                                id="role-description"
                                placeholder="What can this role do?"
                                {...form.register("description")}
                                rows={4}
                                className="min-h-20 resize-none"
                                disabled={isCreating}
                            />
                            <FieldError errors={[form.formState.errors.description]} />
                        </Field>
                    </FieldGroup>
                    <DialogFooter className="mt-6">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isCreating}>
                            {isCreating && <Loader2 className="animate-spin" />}
                            Create Role
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

interface EditRoleDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    role: Role | null;
    isEditing: boolean;
    onSubmit: (data: EditRoleFormData) => Promise<void>;
}

/** Diálogo para editar la descripción de un rol */
export function EditRoleDialog({ open, onOpenChange, role, isEditing, onSubmit }: EditRoleDialogProps) {
    const form = useForm<EditRoleFormData>({
        resolver: zodResolver(editRoleSchema),
        defaultValues: { description: '' },
    });

    useEffect(() => {
        if (role) {
            form.reset({ description: role.description });
        }
    }, [role]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md" onCloseAutoFocus={(e) => e.preventDefault()}>
                <DialogHeader>
                    <DialogTitle>Edit Role <span className="font-mono">[{role?.name}]</span></DialogTitle>
                    <DialogDescription>
                        Update the role description.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
                    <FieldGroup>
                        <Field>
                            <FieldLabel htmlFor="edit-description">Description</FieldLabel>
                            <Textarea
                                id="edit-description"
                                placeholder="What can this role do?"
                                {...form.register("description")}
                                rows={4}
                                className="min-h-20 resize-none"
                                disabled={isEditing}
                            />
                            <FieldError errors={[form.formState.errors.description]} />
                        </Field>
                    </FieldGroup>
                    <DialogFooter className="mt-6">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isEditing}>
                            {isEditing && <Loader2 className="animate-spin" />}
                            Save Changes
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
