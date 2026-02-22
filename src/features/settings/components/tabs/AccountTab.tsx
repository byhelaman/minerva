import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller } from "react-hook-form";
import { useTranslation } from "react-i18next";
import * as z from "zod";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useTheme } from "@/components/theme-provider";
import { useSettings } from "@/components/settings-provider";
import { supabase } from "@/lib/supabase";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
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

const editNameSchema = z.object({
    displayName: z
        .string()
        .min(2, { message: "Display name must be at least 2 characters." })
        .max(30, { message: "Display name must not be longer than 30 characters." }),
});

type EditNameValues = z.infer<typeof editNameSchema>;

const LANGUAGE_LABELS: Record<string, string> = { en: "English", es: "Español", fr: "Français" };

interface AccountTabProps {
    onClose: () => void;
}

export function AccountTab({ onClose }: AccountTabProps) {
    const { t, i18n } = useTranslation();
    const { profile, updateDisplayName, signOut } = useAuth();
    const { setTheme } = useTheme();
    const { settings, updateSetting } = useSettings();
    const [isAccountLoading, setIsAccountLoading] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState("");
    const [editNameOpen, setEditNameOpen] = useState(false);
    const [editLanguageOpen, setEditLanguageOpen] = useState(false);

    const nameForm = useForm<EditNameValues>({
        resolver: zodResolver(editNameSchema),
        defaultValues: { displayName: "" },
    });

    useEffect(() => {
        if (profile) {
            nameForm.reset({ displayName: profile.display_name || "" });
        }
    }, [profile, nameForm]);

    async function onNameSubmit(data: EditNameValues) {
        setIsAccountLoading(true);
        try {
            const { error } = await updateDisplayName(data.displayName);
            if (error) {
                toast.error("Failed to update account", { description: error.message });
            } else {
                toast.success("Account updated", {
                    description: `Display name changed to ${data.displayName}`,
                });
                setEditNameOpen(false);
            }
        } catch {
            toast.error("Failed to update account");
        } finally {
            setIsAccountLoading(false);
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
            onClose();
            await signOut();
        } catch {
            toast.error(t("profile.delete_failed"));
        } finally {
            setIsDeleting(false);
        }
    }

    return (
        <div className="space-y-6">
            {/* Account info */}
            <div className="space-y-4">
                <p className="text-sm font-medium">Account info</p>
                <div className="grid gap-4">
                    <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Name</p>
                        <p className="text-sm font-medium">{profile?.display_name || "—"}</p>
                        <Button variant="ghost" size="sm" onClick={() => setEditNameOpen(true)} className="self-start">
                            Change name
                        </Button>
                    </div>
                    <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Email</p>
                        <p className="text-sm font-medium">{profile?.email || "—"}</p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Role</p>
                        <p className="text-sm font-medium capitalize">{(profile?.role || "—").replace(/_/g, " ")}</p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Permissions</p>
                        <div className="flex flex-wrap gap-1.5">
                            {profile?.permissions?.map(perm => (
                                <Badge key={perm} variant="outline" className="capitalize text-xs">
                                    {perm.replace('.', ' ')}
                                </Badge>
                            )) || (
                                    <span className="text-sm text-muted-foreground">
                                        {t("profile.permissions.none")}
                                    </span>
                                )}
                        </div>
                    </div>
                </div>
            </div>

            <Separator />

            {/* Preferences */}
            <div className="space-y-4">
                <div className="grid gap-4">
                    <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Language</p>
                        <p className="text-sm font-medium">{LANGUAGE_LABELS[i18n.language] ?? i18n.language}</p>
                        <Button variant="ghost" size="sm" onClick={() => setEditLanguageOpen(true)} className="self-start">
                            Change language
                        </Button>
                    </div>
                    <Field>
                        <FieldLabel>Theme</FieldLabel>
                        <Select
                            value={settings.theme}
                            onValueChange={(value: "light" | "dark" | "system") => {
                                updateSetting("theme", value);
                                setTheme(value);
                            }}
                        >
                            <SelectTrigger className="w-36" size="sm">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="light">Light</SelectItem>
                                <SelectItem value="dark">Dark</SelectItem>
                                <SelectItem value="system">System</SelectItem>
                            </SelectContent>
                        </Select>
                        <FieldDescription>Select your preferred theme.</FieldDescription>
                    </Field>
                </div>
            </div>

            <Separator />

            {/* Danger Zone */}
            <div className="space-y-4">
                <p className="text-sm font-medium">Danger Zone</p>
                <AlertDialog open={deleteDialogOpen} onOpenChange={(open) => {
                    setDeleteDialogOpen(open);
                    if (!open) setDeleteConfirmText("");
                }}>
                    <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-destructive">
                            Delete Account
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>{t("profile.delete_confirm_title")}</AlertDialogTitle>
                            <AlertDialogDescription>
                                For security purposes, please re-enter your email below.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <Field>
                            <FieldLabel htmlFor="delete-confirm">
                                {t("profile.delete_confirm_label")}
                            </FieldLabel>
                            <Input
                                id="delete-confirm"
                                value={deleteConfirmText}
                                onChange={(e) => setDeleteConfirmText(e.target.value)}
                                placeholder={profile?.email || ""}
                                autoComplete="off"
                            />
                        </Field>
                        <AlertDialogFooter>
                            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                            <Button
                                onClick={onDeleteAccount}
                                disabled={isDeleting || deleteConfirmText !== profile?.email}
                            >
                                {isDeleting && <Loader2 className="animate-spin" />}
                                Continue
                            </Button>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>

            {/* Edit Name Dialog */}
            <Dialog open={editNameOpen} onOpenChange={setEditNameOpen}>
                <DialogContent className="sm:max-w-sm gap-6">
                    <DialogHeader>
                        <DialogTitle>Change name</DialogTitle>
                    </DialogHeader>
                    <form id="edit-name-form" onSubmit={nameForm.handleSubmit(onNameSubmit)}>
                        <Controller
                            control={nameForm.control}
                            name="displayName"
                            render={({ field, fieldState }) => (
                                <Field data-invalid={fieldState.invalid}>
                                    <FieldLabel>New name</FieldLabel>
                                    <Input {...field} placeholder="Your Name" aria-invalid={fieldState.invalid} />
                                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                </Field>
                            )}
                        />
                    </form>
                    <DialogFooter>
                        <Button type="submit" form="edit-name-form" disabled={isAccountLoading}>
                            {isAccountLoading && <Loader2 className="animate-spin" />}
                            Save
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Change Language Dialog */}
            <Dialog open={editLanguageOpen} onOpenChange={setEditLanguageOpen}>
                <DialogContent className="sm:max-w-sm gap-6">
                    <DialogHeader>
                        <DialogTitle>Change language</DialogTitle>
                    </DialogHeader>
                    <Field>
                        <FieldLabel>Pick which language to use for Minerva</FieldLabel>
                        <Select
                            value={i18n.language}
                            onValueChange={(value) => {
                                i18n.changeLanguage(value);
                                toast.info(t("settings.preferences.language_changed"), {
                                    description: t("settings.preferences.language_wip"),
                                });
                                setEditLanguageOpen(false);
                            }}
                        >
                            <SelectTrigger size="sm" className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="en">English</SelectItem>
                                <SelectItem value="es">Español</SelectItem>
                                <SelectItem value="fr">Français</SelectItem>
                            </SelectContent>
                        </Select>
                    </Field>
                    <DialogFooter showCloseButton />
                </DialogContent>
            </Dialog>
        </div>
    );
}
