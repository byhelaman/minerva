import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller } from "react-hook-form";
import * as z from "zod";
import { toast } from "sonner";
import { useState } from "react";
import { useAuth } from "@/components/auth-provider";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

const passwordFormSchema = z.object({
    currentPassword: z.string().min(1, "Current password is required."),
    newPassword: z.string().min(8, "Password must be at least 8 characters."),
    confirmPassword: z.string().min(1, "Please confirm your password."),
}).refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
});

type PasswordFormValues = z.infer<typeof passwordFormSchema>;

export function SecurityTab() {
    const { updatePassword, verifyCurrentPassword } = useAuth();
    const [isPasswordLoading, setIsPasswordLoading] = useState(false);
    const [changePasswordOpen, setChangePasswordOpen] = useState(false);

    const passwordForm = useForm<PasswordFormValues>({
        resolver: zodResolver(passwordFormSchema),
        defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
    });

    async function onPasswordSubmit(data: PasswordFormValues) {
        setIsPasswordLoading(true);
        try {
            const { error: verifyError } = await verifyCurrentPassword(data.currentPassword);
            if (verifyError) {
                toast.error("Current password is incorrect");
                setIsPasswordLoading(false);
                return;
            }
            const { error } = await updatePassword(data.newPassword);
            if (error) {
                toast.error("Failed to update password", { description: error.message });
            } else {
                toast.success("Password updated", {
                    description: "Your password has been changed successfully.",
                });
                passwordForm.reset();
                setChangePasswordOpen(false);
            }
        } catch {
            toast.error("Failed to update password");
        } finally {
            setIsPasswordLoading(false);
        }
    }

    return (
        <div className="space-y-4">
            <p className="text-sm font-semibold">Security</p>
            <div className="flex items-center justify-between">
                <div className="flex flex-col gap-0.5">
                    <span className="text-sm">Password</span>
                    <span className="text-xs text-muted-foreground">Change your account password.</span>
                </div>
                <Button variant="outline" size="sm" className="shrink-0" onClick={() => setChangePasswordOpen(true)}>
                    Update Password
                </Button>
            </div>

            <Dialog open={changePasswordOpen} onOpenChange={(open) => {
                setChangePasswordOpen(open);
                if (!open) passwordForm.reset();
            }}>
                <DialogContent className="sm:max-w-sm gap-6">
                    <DialogHeader>
                        <DialogTitle>Change Password</DialogTitle>
                    </DialogHeader>
                    <form id="password-form" onSubmit={passwordForm.handleSubmit(onPasswordSubmit)}>
                        <FieldGroup>
                            <Controller
                                control={passwordForm.control}
                                name="currentPassword"
                                render={({ field, fieldState }) => (
                                    <Field data-invalid={fieldState.invalid}>
                                        <FieldLabel>Current Password</FieldLabel>
                                        <Input {...field} type="password" aria-invalid={fieldState.invalid} disabled={isPasswordLoading} />
                                        <FieldDescription>Enter your current password to verify your identity.</FieldDescription>
                                        {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                    </Field>
                                )}
                            />
                            <Controller
                                control={passwordForm.control}
                                name="newPassword"
                                render={({ field, fieldState }) => (
                                    <Field data-invalid={fieldState.invalid}>
                                        <FieldLabel>New Password</FieldLabel>
                                        <Input {...field} type="password" aria-invalid={fieldState.invalid} />
                                        <FieldDescription>Password must be at least 8 characters.</FieldDescription>
                                        {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                    </Field>
                                )}
                            />
                            <Controller
                                control={passwordForm.control}
                                name="confirmPassword"
                                render={({ field, fieldState }) => (
                                    <Field data-invalid={fieldState.invalid}>
                                        <FieldLabel>Confirm Password</FieldLabel>
                                        <Input {...field} type="password" aria-invalid={fieldState.invalid} />
                                        <FieldDescription>Please confirm your new password.</FieldDescription>
                                        {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                    </Field>
                                )}
                            />
                        </FieldGroup>
                    </form>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setChangePasswordOpen(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" form="password-form" disabled={isPasswordLoading}>
                            {isPasswordLoading && <Loader2 className="animate-spin" />}
                            Continue
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
