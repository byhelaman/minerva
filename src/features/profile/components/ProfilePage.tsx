
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller } from "react-hook-form";
import { useTranslation } from "react-i18next";
import * as z from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";

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

const preferencesFormSchema = z.object({
    language: z.string(),
});

type AccountFormValues = z.infer<typeof accountFormSchema>;
type PasswordFormValues = z.infer<typeof passwordFormSchema>;
type PreferencesFormValues = z.infer<typeof preferencesFormSchema>;

export function ProfilePage() {
    const { t, i18n } = useTranslation();
    const accountForm = useForm<AccountFormValues>({
        resolver: zodResolver(accountFormSchema),
        defaultValues: {
            displayName: "Jhon Doe",
            email: "user@example.com",
        },
    });

    const passwordForm = useForm<PasswordFormValues>({
        resolver: zodResolver(passwordFormSchema),
        defaultValues: {
            currentPassword: "",
            newPassword: "",
            confirmPassword: "",
        },
    });

    const preferencesForm = useForm<PreferencesFormValues>({
        resolver: zodResolver(preferencesFormSchema),
        defaultValues: {
            language: i18n.language || "en",
        },
    });

    function onAccountSubmit(data: AccountFormValues) {
        toast.success("Account updated", {
            description: `Display name changed to ${data.displayName}`,
        });
    }

    function onPasswordSubmit(_data: PasswordFormValues) {
        toast.success("Password updated", {
            description: "Your password has been changed successfully.",
        });
        passwordForm.reset();
    }

    function onPreferencesSubmit(data: PreferencesFormValues) {
        i18n.changeLanguage(data.language);
        toast.success("Preferences updated", {
            description: `Language set to ${data.language === 'en' ? 'English' : data.language === 'es' ? 'Español' : 'Français'}`,
        });
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col py-8 my-4 gap-1">
                <h1 className="text-xl font-bold tracking-tight">{t("profile.title")}</h1>
                <p className="text-muted-foreground">{t("profile.subtitle")}</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
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
                                <Badge variant="secondary">User</Badge>
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
                            <Button type="submit" form="account-form">{t("common.save")}</Button>
                        </CardFooter>
                    </Card>

                    {/* Preferences */}
                    <Card className="shadow-none">
                        <CardHeader>
                            <CardTitle>{t("profile.preferences")}</CardTitle>
                            <CardDescription>
                                {t("profile.preferences_desc")}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form id="preferences-form" onSubmit={preferencesForm.handleSubmit(onPreferencesSubmit)}>
                                <FieldGroup>
                                    <Controller
                                        control={preferencesForm.control}
                                        name="language"
                                        render={({ field }) => (
                                            <Field>
                                                <FieldLabel>{t("profile.language")}</FieldLabel>
                                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select a language" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="en">English</SelectItem>
                                                        <SelectItem value="es">Español</SelectItem>
                                                        <SelectItem value="fr">Français</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <FieldDescription>
                                                    {t("profile.language_desc")}
                                                </FieldDescription>
                                            </Field>
                                        )}
                                    />
                                </FieldGroup>
                            </form>
                        </CardContent>
                        <CardFooter>
                            <Button type="submit" form="preferences-form">{t("common.save")}</Button>
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
                            <Button variant="destructive" className="w-full sm:w-auto">
                                {t("profile.delete_account")}
                            </Button>
                        </CardFooter>
                    </Card>
                </div>

                {/* Right Column */}
                <div className="space-y-6">
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
                                                />
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
                            <Button type="submit" variant="outline" form="password-form">
                                {t("profile.update_password")}
                            </Button>
                        </CardFooter>
                    </Card>
                </div>
            </div>
        </div>
    );
}
