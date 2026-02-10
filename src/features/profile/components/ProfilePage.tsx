
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller } from "react-hook-form";
import { useTranslation } from "react-i18next";
import * as z from "zod";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Loader2 } from "lucide-react";

const accountFormSchema = z.object({
    displayName: z
        .string()
        .min(2, {
            message: "Display name must be at least 2 characters.",
        })
        .max(30, {
            message: "Display name must not be longer than 30 characters.",
        }),
    email: z.string().email(),
});

const passwordFormSchema = z.object({
    currentPassword: z.string().min(1, "Current password is required."),
    newPassword: z.string().min(8, "Password must be at least 8 characters."),
    confirmPassword: z.string().min(1, "Please confirm your password."),
}).refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
});

type AccountFormValues = z.infer<typeof accountFormSchema>;
type PasswordFormValues = z.infer<typeof passwordFormSchema>;

export function ProfilePage() {
    const { t } = useTranslation();
    const { profile, updateDisplayName, updatePassword, verifyCurrentPassword, signOut } = useAuth();
    const navigate = useNavigate();
    const [isAccountLoading, setIsAccountLoading] = useState(false);
    const [isPasswordLoading, setIsPasswordLoading] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState("");

    const accountForm = useForm<AccountFormValues>({
        resolver: zodResolver(accountFormSchema),
        defaultValues: {
            displayName: "",
            email: "",
        },
    });

    // Sincronizar con profile cuando cargue
    useEffect(() => {
        if (profile) {
            accountForm.reset({
                displayName: profile.display_name || "",
                email: profile.email || "",
            });
        }
    }, [profile, accountForm]);

    const passwordForm = useForm<PasswordFormValues>({
        resolver: zodResolver(passwordFormSchema),
        defaultValues: {
            currentPassword: "",
            newPassword: "",
            confirmPassword: "",
        },
    });

    async function onAccountSubmit(data: AccountFormValues) {
        setIsAccountLoading(true);
        try {
            const { error } = await updateDisplayName(data.displayName);
            if (error) {
                toast.error("Failed to update account", {
                    description: error.message,
                });
            } else {
                toast.success("Account updated", {
                    description: `Display name changed to ${data.displayName}`,
                });
            }
        } catch {
            toast.error("Failed to update account");
        } finally {
            setIsAccountLoading(false);
        }
    }

    async function onPasswordSubmit(data: PasswordFormValues) {
        setIsPasswordLoading(true);
        try {
            // Primero verificar la contraseña actual
            const { error: verifyError } = await verifyCurrentPassword(data.currentPassword);
            if (verifyError) {
                toast.error("Current password is incorrect");
                setIsPasswordLoading(false);
                return;
            }

            // Si la verificación pasa, actualizar contraseña
            const { error } = await updatePassword(data.newPassword);
            if (error) {
                toast.error("Failed to update password", {
                    description: error.message,
                });
            } else {
                toast.success("Password updated", {
                    description: "Your password has been changed successfully.",
                });
                passwordForm.reset();
            }
        } catch {
            toast.error("Failed to update password");
        } finally {
            setIsPasswordLoading(false);
        }
    }

    async function onDeleteAccount() {
        if (deleteConfirmText !== profile?.email) return;

        setIsDeleting(true);
        try {
            const { error } = await supabase.rpc('delete_own_account');
            if (error) {
                toast.error(t("profile.delete_failed"), { description: error.message });
                return;
            }

            toast.success(t("profile.delete_success"));
            await signOut();
            navigate("/login");
        } catch {
            toast.error(t("profile.delete_failed"));
        } finally {
            setIsDeleting(false);
        }
    }

    return (
        <div className="flex flex-col h-full min-h-0">
            <div className="flex flex-col py-8 my-4 gap-1">
                <h1 className="text-xl font-bold tracking-tight">{t("profile.title")}</h1>
                <p className="text-muted-foreground text-sm">{t("profile.subtitle")}</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2 flex-1 overflow-auto min-h-0 pb-6 pr-4">
                {/* Left Column */}
                <div className="space-y-6">
                    {/* Account Information */}
                    <Card className="shadow-none">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div className="flex flex-col gap-2">
                                    <CardTitle>{t("profile.account_info")}</CardTitle>
                                    <CardDescription>
                                        {t("profile.account_info_desc")}
                                    </CardDescription>
                                </div>
                                <Badge variant="secondary" className="capitalize">
                                    {(profile?.role || "Guest").replace(/_/g, " ")}
                                </Badge>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <form id="account-form" onSubmit={accountForm.handleSubmit(onAccountSubmit)}>
                                <FieldGroup>
                                    <Controller
                                        control={accountForm.control}
                                        name="displayName"
                                        render={({ field, fieldState }) => (
                                            <Field data-invalid={fieldState.invalid}>
                                                <FieldLabel>{t("profile.display_name")}</FieldLabel>
                                                <Input
                                                    {...field}
                                                    placeholder="Your Name"
                                                    aria-invalid={fieldState.invalid}
                                                />
                                                {fieldState.invalid && (
                                                    <FieldError errors={[fieldState.error]} />
                                                )}
                                                <FieldDescription>
                                                    {t("profile.display_name_desc")}
                                                </FieldDescription>
                                            </Field>
                                        )}
                                    />
                                    <Controller
                                        control={accountForm.control}
                                        name="email"
                                        render={({ field }) => (
                                            <Field>
                                                <FieldLabel>{t("profile.email")}</FieldLabel>
                                                <Input
                                                    {...field}
                                                    placeholder="user@example.com"
                                                    disabled
                                                    className="bg-muted"
                                                />
                                            </Field>
                                        )}
                                    />
                                </FieldGroup>
                            </form>
                        </CardContent>
                        <CardFooter>
                            <Button type="submit" form="account-form" disabled={isAccountLoading}>
                                {isAccountLoading && <Loader2 className="animate-spin" />}
                                {t("common.save")}
                            </Button>
                        </CardFooter>
                    </Card>
                </div>


                {/* Right Column */}
                <div className="space-y-6">

                    {/* Permissions - visible for all users */}
                    <Card className="shadow-none">
                        <CardHeader>
                            <CardTitle>{t("profile.permissions.title")}</CardTitle>
                            <CardDescription>
                                {t("profile.permissions.desc")}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-wrap gap-2">
                                {profile?.permissions?.map(perm => (
                                    <Badge key={perm} variant="outline" className="capitalize">
                                        {perm.replace('.', ' ')}
                                    </Badge>
                                )) || (
                                        <span className="text-sm text-muted-foreground">
                                            {t("profile.permissions.none")}
                                        </span>
                                    )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Security */}
                    <Card className="shadow-none">
                        <CardHeader>
                            <CardTitle>{t("profile.security")}</CardTitle>
                            <CardDescription>
                                {t("profile.security_desc")}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form id="password-form" onSubmit={passwordForm.handleSubmit(onPasswordSubmit)}>
                                <FieldGroup>
                                    <Controller
                                        control={passwordForm.control}
                                        name="currentPassword"
                                        render={({ field, fieldState }) => (
                                            <Field data-invalid={fieldState.invalid}>
                                                <FieldLabel>{t("profile.current_password")}</FieldLabel>
                                                <Input
                                                    {...field}
                                                    type="password"
                                                    aria-invalid={fieldState.invalid}
                                                    disabled={isPasswordLoading}
                                                />
                                                <FieldDescription>{t("profile.current_password_desc")}</FieldDescription>
                                                {fieldState.invalid && (
                                                    <FieldError errors={[fieldState.error]} />
                                                )}
                                            </Field>
                                        )}
                                    />
                                    <Controller
                                        control={passwordForm.control}
                                        name="newPassword"
                                        render={({ field, fieldState }) => (
                                            <Field data-invalid={fieldState.invalid}>
                                                <FieldLabel>{t("profile.new_password")}</FieldLabel>
                                                <Input
                                                    {...field}
                                                    type="password"
                                                    aria-invalid={fieldState.invalid}
                                                />
                                                <FieldDescription>
                                                    {t("profile.password_desc")}
                                                </FieldDescription>
                                                {fieldState.invalid && (
                                                    <FieldError errors={[fieldState.error]} />
                                                )}
                                            </Field>
                                        )}
                                    />
                                    <Controller
                                        control={passwordForm.control}
                                        name="confirmPassword"
                                        render={({ field, fieldState }) => (
                                            <Field data-invalid={fieldState.invalid}>
                                                <FieldLabel>{t("profile.confirm_password")}</FieldLabel>
                                                <Input
                                                    {...field}
                                                    type="password"
                                                    aria-invalid={fieldState.invalid}
                                                />
                                                <FieldDescription>{t("profile.confirm_password_desc")}</FieldDescription>
                                                {fieldState.invalid && (
                                                    <FieldError errors={[fieldState.error]} />
                                                )}
                                            </Field>
                                        )}
                                    />
                                </FieldGroup>
                            </form>
                        </CardContent>
                        <CardFooter>
                            <Button type="submit" form="password-form" disabled={isPasswordLoading}>
                                {isPasswordLoading && <Loader2 className="animate-spin" />}
                                {t("profile.update_password")}
                            </Button>
                        </CardFooter>
                    </Card>


                    {/* Danger Zone */}
                    <Card className="shadow-none border-destructive/50 bg-destructive/5">
                        <CardHeader>
                            <CardTitle className="text-destructive">{t("profile.danger_zone")}</CardTitle>
                            <CardDescription>
                                {t("profile.danger_zone_desc")}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">
                                {t("profile.delete_account_warning")}
                            </p>
                        </CardContent>
                        <CardFooter>
                            <AlertDialog open={deleteDialogOpen} onOpenChange={(open) => {
                                setDeleteDialogOpen(open);
                                if (!open) setDeleteConfirmText("");
                            }}>
                                <AlertDialogTrigger asChild>
                                    <Button variant="destructive" className="w-full sm:w-auto">
                                        {t("profile.delete_account")}
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>{t("profile.delete_confirm_title")}</AlertDialogTitle>
                                        <AlertDialogDescription asChild>
                                            <div className="space-y-4">
                                                <p>{t("profile.delete_confirm_desc")}</p>
                                                <ul className="list-disc list-inside text-sm space-y-1">
                                                    <li>{t("profile.delete_warning_1")}</li>
                                                    <li>{t("profile.delete_warning_3")}</li>
                                                </ul>
                                                <div className="space-y-2 pt-2">
                                                    <Label htmlFor="delete-confirm">
                                                        {t("profile.delete_confirm_label")}
                                                    </Label>
                                                    <Input
                                                        id="delete-confirm"
                                                        value={deleteConfirmText}
                                                        onChange={(e) => setDeleteConfirmText(e.target.value)}
                                                        placeholder={profile?.email || ""}
                                                        autoComplete="off"
                                                    />
                                                </div>
                                            </div>
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                                        <Button
                                            variant="destructive"
                                            onClick={onDeleteAccount}
                                            disabled={isDeleting || deleteConfirmText !== profile?.email}
                                        >
                                            {isDeleting && <Loader2 className="animate-spin" />}
                                            {isDeleting ? t("profile.deleting") : t("profile.delete_account")}
                                        </Button>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </CardFooter>
                    </Card>
                </div>
            </div>
        </div>
    );
}
