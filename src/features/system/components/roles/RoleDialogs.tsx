/**
 * Componentes de diálogo para crear y editar roles.
 * Utiliza react-hook-form con validación zod.
 */
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
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
            <DialogContent className="sm:max-w-md gap-6" onCloseAutoFocus={(e) => e.preventDefault()}>
                <DialogHeader>
                    <DialogTitle>Create New Role</DialogTitle>
                    <DialogDescription>
                        Add a custom role with specific permissions.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
                    <FieldGroup>
                        <Controller
                            name="name"
                            control={form.control}
                            render={({ field, fieldState }) => (
                                <Field data-invalid={fieldState.invalid}>
                                    <FieldLabel htmlFor={field.name}>Role Name</FieldLabel>
                                    <Input
                                        {...field}
                                        id={field.name}
                                        placeholder="e.g. moderator"
                                        aria-invalid={fieldState.invalid}
                                        disabled={isCreating}
                                    />
                                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                </Field>
                            )}
                        />
                        <Controller
                            name="level"
                            control={form.control}
                            render={({ field, fieldState }) => (
                                <Field data-invalid={fieldState.invalid}>
                                    <FieldLabel htmlFor={field.name}>Hierarchy Level</FieldLabel>
                                    <Input
                                        {...field}
                                        id={field.name}
                                        type="number"
                                        min={1}
                                        max={99}
                                        onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
                                        aria-invalid={fieldState.invalid}
                                        disabled={isCreating}
                                    />
                                    <FieldDescription>Higher level = more permissions. Max: 99</FieldDescription>
                                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                </Field>
                            )}
                        />
                        <Controller
                            name="description"
                            control={form.control}
                            render={({ field, fieldState }) => (
                                <Field data-invalid={fieldState.invalid}>
                                    <FieldLabel htmlFor={field.name}>Description</FieldLabel>
                                    <Textarea
                                        {...field}
                                        id={field.name}
                                        placeholder="What can this role do?"
                                        rows={4}
                                        className="min-h-20 resize-none"
                                        aria-invalid={fieldState.invalid}
                                        disabled={isCreating}
                                    />
                                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                </Field>
                            )}
                        />
                    </FieldGroup>
                    <DialogFooter className="mt-6">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isCreating}>
                            {isCreating && <Loader2 className="animate-spin" />}
                            Continue
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
            <DialogContent className="sm:max-w-md gap-6" onCloseAutoFocus={(e) => e.preventDefault()}>
                <DialogHeader>
                    <DialogTitle>Edit Role <span className="font-mono">[{role?.name}]</span></DialogTitle>
                    <DialogDescription>
                        Update the role description.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
                    <FieldGroup>
                        <Controller
                            name="description"
                            control={form.control}
                            render={({ field, fieldState }) => (
                                <Field data-invalid={fieldState.invalid}>
                                    <FieldLabel htmlFor={field.name}>Description</FieldLabel>
                                    <Textarea
                                        {...field}
                                        id={field.name}
                                        placeholder="What can this role do?"
                                        rows={4}
                                        className="min-h-20 resize-none"
                                        aria-invalid={fieldState.invalid}
                                        disabled={isEditing}
                                    />
                                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                </Field>
                            )}
                        />
                    </FieldGroup>
                    <DialogFooter className="mt-6">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isEditing}>
                            {isEditing && <Loader2 className="animate-spin" />}
                            Save
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
