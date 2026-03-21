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
import { Label } from "@/components/ui/label";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Loader2, Monitor, Moon, Sun } from "lucide-react";

const editNameSchema = z.object({
    displayName: z
        .string()
        .min(2, { message: "Display name must be at least 2 characters." })
        .max(30, { message: "Display name must not be longer than 30 characters." }),
});

type EditNameValues = z.infer<typeof editNameSchema>;

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
        <div className="space-y-6 px-1">
            {/* Account info */}
            <div className="space-y-4">
                <p className="text-sm font-semibold">Account info</p>
                <div className="grid gap-6">
                    <div className="flex items-center justify-between gap-4">
                        <div className="space-y-0.5">
                            <p className="text-sm text-muted-foreground">Name</p>
                            <p className="text-sm font-medium">{profile?.display_name || "—"}</p>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => setEditNameOpen(true)} className="shrink-0">
                            Change name
                        </Button>
                    </div>
                    <div className="space-y-0.5">
                        <p className="text-sm text-muted-foreground">Email</p>
                        <p className="text-sm font-medium">{profile?.email || "—"}</p>
                    </div>
                    <div className="space-y-0.5">
                        <p className="text-sm text-muted-foreground">Role</p>
                        <p className="text-sm font-medium capitalize">{(profile?.role || "—").replace(/_/g, " ")}</p>
                    </div>
                    <div className="space-y-0.5">
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

            {/* Language & Theme */}
            <div className="space-y-4">
                <p className="text-sm font-semibold">Preferences</p>
                <div className="grid gap-6">
                    <div className="flex items-center justify-between gap-4">
                        <div className="space-y-0.5">
                            <p className="text-sm text-muted-foreground">Language</p>
                            <p className="text-sm font-medium">{i18n.language === "en" ? "English" : i18n.language === "es" ? "Español" : i18n.language === "fr" ? "Français" : i18n.language}</p>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => setEditLanguageOpen(true)} className="shrink-0">
                            Change language
                        </Button>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                        <Label className="flex flex-col gap-0.5 cursor-pointer font-normal items-start">
                            <span className="text-sm text-muted-foreground">Theme</span>
                            <span className="text-xs text-muted-foreground">Select your preferred theme.</span>
                        </Label>
                        <Select
                            value={settings.theme}
                            onValueChange={(value: "light" | "dark" | "system") => {
                                updateSetting("theme", value);
                                setTheme(value);
                            }}
                        >
                            <SelectTrigger className="min-w-35 shrink-0" size="sm">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="light"><div className="flex items-center"><Sun className="mr-2 h-4 w-4" />Light</div></SelectItem>
                                <SelectItem value="dark"><div className="flex items-center"><Moon className="mr-2 h-4 w-4" />Dark</div></SelectItem>
                                <SelectItem value="system"><div className="flex items-center"><Monitor className="mr-2 h-4 w-4" />System</div></SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            <Separator />

            {/* Danger Zone */}
            <div className="space-y-4">
                <p className="text-sm font-semibold">Danger Zone</p>
                <div className="flex items-center justify-between gap-4">
                    <div className="flex flex-col gap-0.5">
                        <p className="text-sm">Delete Account</p>
                        <p className="text-xs text-muted-foreground">Permanently delete your account and all associated data.</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setDeleteDialogOpen(true)} className="shrink-0">
                        Delete Account
                    </Button>
                </div>
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
                        <FieldLabel>Language</FieldLabel>
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
                        <FieldDescription>
                            Pick which language to use for Minerva
                        </FieldDescription>
                    </Field>
                    <DialogFooter showCloseButton />
                </DialogContent>
            </Dialog>

            {/* Delete Account Dialog */}
            <Dialog open={deleteDialogOpen} onOpenChange={(open) => {
                setDeleteDialogOpen(open);
                if (!open) setDeleteConfirmText("");
            }}>
                <DialogContent className="sm:max-w-sm gap-6">
                    <DialogHeader>
                        <DialogTitle>{t("profile.delete_confirm_title")}</DialogTitle>
                        <DialogDescription>
                            For security purposes, please re-enter your email below.
                        </DialogDescription>
                    </DialogHeader>
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
                    <DialogFooter>
                        <Button
                            onClick={onDeleteAccount}
                            disabled={isDeleting || deleteConfirmText !== profile?.email}
                        >
                            {isDeleting && <Loader2 className="animate-spin" />}
                            Continue
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
