import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useTheme } from "@/components/theme-provider";
import { useSettings } from "@/components/settings-provider";
import { BaseDirectory, exists, remove } from "@tauri-apps/plugin-fs";
import { toast } from "sonner";
import { STORAGE_FILES } from "@/lib/constants";
import { useTranslation } from "react-i18next";
import { useUpdater } from "@/hooks/use-updater";
import { getVersion, getTauriVersion } from "@tauri-apps/api/app";
import { useState, useEffect } from "react";


export function SettingsPage() {
    const { t, i18n } = useTranslation();
    const { setTheme } = useTheme();
    const { settings, updateSetting } = useSettings();
    const { checkForUpdates, update, isChecking, error: updateError } = useUpdater();

    const [appVersion, setAppVersion] = useState<string>("");
    const [tauriVersion, setTauriVersion] = useState<string>("");

    useEffect(() => {
        getVersion().then(setAppVersion);
        getTauriVersion().then(setTauriVersion);
    }, []);

    const handleCheckUpdates = async () => {
        await checkForUpdates();

        // Si no hay error y no hay update, estamos al día
        if (!updateError && !update) {
            toast.success(t("settings.system.up_to_date"), {
                description: t("settings.system.up_to_date_desc", { version: appVersion }),
            });
        }
    };

    // Mostrar toast de error tras el check
    useEffect(() => {
        if (updateError) {
            toast.error(t("settings.system.update_error"), {
                description: updateError,
            });
        }
    }, [updateError, t]);

    const handleClearCache = async () => {
        try {
            let filesDeleted = 0;

            // Eliminar autoguardado de horarios
            const autosaveExists = await exists(STORAGE_FILES.SCHEDULES_DRAFT, { baseDir: BaseDirectory.AppLocalData });
            if (autosaveExists) {
                await remove(STORAGE_FILES.SCHEDULES_DRAFT, { baseDir: BaseDirectory.AppLocalData });
                filesDeleted++;
            }

            // Eliminar archivo de configuración
            const settingsExists = await exists(STORAGE_FILES.APP_SETTINGS, { baseDir: BaseDirectory.AppLocalData });
            if (settingsExists) {
                await remove(STORAGE_FILES.APP_SETTINGS, { baseDir: BaseDirectory.AppLocalData });
                filesDeleted++;
            }

            // Reiniciar configuración a valores por defecto en memoria
            updateSetting("actionsRespectFilters", false);
            updateSetting("autoSave", true);
            updateSetting("theme", "system");
            updateSetting("openAfterExport", true);
            updateSetting("clearScheduleOnLoad", false);
            setTheme("system"); // Aplicar reinicio de tema

            if (filesDeleted > 0) {
                toast.success("Cache cleared successfully", {
                    description: "Local data and settings have been reset.",
                });
            } else {
                toast.info("Cache is already empty");
            }
        } catch (error) {
            console.error("Failed to clear cache:", error);
            toast.error("Failed to clear cache");
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col py-8 my-4 gap-1">
                <h1 className="text-xl font-bold tracking-tight">{t("settings.title")}</h1>
                <p className="text-muted-foreground">{t("settings.subtitle")}</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* Left Column */}
                <div className="space-y-6">
                    {/* Appearance */}
                    <Card className="shadow-none">
                        <CardHeader>
                            <CardTitle>{t("settings.appearance.title")}</CardTitle>
                            <CardDescription>
                                {t("settings.appearance.desc")}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between space-x-2">
                                <div className="space-y-2">
                                    <Label>{t("settings.appearance.theme")}</Label>
                                    <p className="font-normal text-xs text-muted-foreground">
                                        {t("settings.appearance.theme_desc")}
                                    </p>
                                </div>

                                <Select
                                    value={settings.theme}
                                    onValueChange={(value: "light" | "dark" | "system") => {
                                        updateSetting("theme", value);
                                        setTheme(value); // Aplicar al DOM
                                    }}
                                >
                                    <SelectTrigger className="w-[160px]">
                                        <SelectValue placeholder="Select theme" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="light">
                                            <div className="flex items-center">
                                                <Sun className="mr-2 h-4 w-4" />
                                                <span>{t("settings.appearance.theme_light")}</span>
                                            </div>
                                        </SelectItem>
                                        <SelectItem value="dark">
                                            <div className="flex items-center">
                                                <Moon className="mr-2 h-4 w-4" />
                                                <span>{t("settings.appearance.theme_dark")}</span>
                                            </div>
                                        </SelectItem>
                                        <SelectItem value="system">
                                            <div className="flex items-center">
                                                <Monitor className="mr-2 h-4 w-4" />
                                                <span>{t("settings.appearance.theme_system")}</span>
                                            </div>
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex items-center justify-between space-x-2">
                                <Label htmlFor="actions-respect-filters" className="flex flex-col items-start">
                                    <span>{t("settings.appearance.respect_filters")}</span>
                                    <span className="font-normal text-xs text-muted-foreground">
                                        {t("settings.appearance.respect_filters_desc")}
                                    </span>
                                </Label>
                                <Switch
                                    id="actions-respect-filters"
                                    checked={settings.actionsRespectFilters}
                                    onCheckedChange={(checked) => updateSetting("actionsRespectFilters", checked)}
                                    className="h-[20px] w-[36px] [&_span[data-slot=switch-thumb]]:size-4 [&_span[data-slot=switch-thumb]]:data-[state=checked]:translate-x-4"
                                />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Notifications (New Block 1) */}
                    <Card className="shadow-none">
                        <CardHeader>
                            <CardTitle>{t("settings.notifications.title")}</CardTitle>
                            <CardDescription>
                                {t("settings.notifications.desc")}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between space-x-2">
                                <Label htmlFor="email-digest" className="flex flex-col items-start">
                                    <span>{t("settings.notifications.weekly_digest")}</span>
                                    <span className="font-normal text-xs text-muted-foreground">
                                        {t("settings.notifications.weekly_digest_desc")}
                                    </span>
                                </Label>
                                <Switch id="email-digest" className="h-[20px] w-[36px] [&_span[data-slot=switch-thumb]]:size-4 [&_span[data-slot=switch-thumb]]:data-[state=checked]:translate-x-4" />
                            </div>
                            <div className="flex items-center justify-between space-x-2">
                                <Label htmlFor="realtime-alerts" className="flex flex-col items-start">
                                    <span>{t("settings.notifications.realtime_alerts")}</span>
                                    <span className="font-normal text-xs text-muted-foreground">
                                        {t("settings.notifications.realtime_alerts_desc")}
                                    </span>
                                </Label>
                                <Switch id="realtime-alerts" defaultChecked className="h-[20px] w-[36px] [&_span[data-slot=switch-thumb]]:size-4 [&_span[data-slot=switch-thumb]]:data-[state=checked]:translate-x-4" />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Automation */}
                    <Card className="shadow-none">
                        <CardHeader>
                            <CardTitle>{t("settings.automation.title")}</CardTitle>
                            <CardDescription>
                                {t("settings.automation.desc")}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between space-x-2">
                                <Label htmlFor="auto-save" className="flex flex-col items-start">
                                    <span>{t("settings.automation.auto_save")}</span>
                                    <span className="font-normal text-xs text-muted-foreground">
                                        {t("settings.automation.auto_save_desc")}
                                    </span>
                                </Label>
                                <Switch
                                    id="auto-save"
                                    checked={settings.autoSave}
                                    onCheckedChange={(checked) => updateSetting("autoSave", checked)}
                                    className="h-[20px] w-[36px] [&_span[data-slot=switch-thumb]]:size-4 [&_span[data-slot=switch-thumb]]:data-[state=checked]:translate-x-4"
                                />
                            </div>
                            <div className="flex items-center justify-between space-x-2">
                                <Label htmlFor="auto-save-interval" className="flex flex-col items-start">
                                    <span>{t("settings.automation.auto_save_interval")}</span>
                                    <span className="font-normal text-xs text-muted-foreground">
                                        {t("settings.automation.auto_save_interval_desc")}
                                    </span>
                                </Label>
                                <Select
                                    value={String(settings.autoSaveInterval)}
                                    onValueChange={(value) => updateSetting("autoSaveInterval", Number(value))}
                                    disabled={!settings.autoSave}
                                >
                                    <SelectTrigger className="w-[120px]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="1000">{t("settings.automation.interval_1s")}</SelectItem>
                                        <SelectItem value="3000">{t("settings.automation.interval_3s")}</SelectItem>
                                        <SelectItem value="5000">{t("settings.automation.interval_5s")}</SelectItem>
                                        <SelectItem value="10000">{t("settings.automation.interval_10s")}</SelectItem>
                                        <SelectItem value="30000">{t("settings.automation.interval_30s")}</SelectItem>
                                        <SelectItem value="60000">{t("settings.automation.interval_1m")}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex items-center justify-between space-x-2">
                                <Label htmlFor="clear-schedule-on-load" className="flex flex-col items-start">
                                    <span>{t("settings.automation.clear_schedule_on_load")}</span>
                                    <span className="font-normal text-xs text-muted-foreground">
                                        {t("settings.automation.clear_schedule_on_load_desc")}
                                    </span>
                                </Label>
                                <Switch
                                    id="clear-schedule-on-load"
                                    checked={settings.clearScheduleOnLoad}
                                    onCheckedChange={(checked) => updateSetting("clearScheduleOnLoad", checked)}
                                    className="h-[20px] w-[36px] [&_span[data-slot=switch-thumb]]:size-4 [&_span[data-slot=switch-thumb]]:data-[state=checked]:translate-x-4"
                                />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Export Preferences */}
                    <Card className="shadow-none">
                        <CardHeader>
                            <CardTitle>{t("settings.storage.title")}</CardTitle>
                            <CardDescription>
                                {t("settings.storage.desc")}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between space-x-2">
                                <Label htmlFor="open-after-export" className="flex flex-col items-start">
                                    <span>{t("settings.storage.open_after_export")}</span>
                                    <span className="font-normal text-xs text-muted-foreground">
                                        {t("settings.storage.open_after_export_desc")}
                                    </span>
                                </Label>
                                <Switch
                                    id="open-after-export"
                                    checked={settings.openAfterExport}
                                    onCheckedChange={(checked) => updateSetting("openAfterExport", checked)}
                                    className="h-[20px] w-[36px] [&_span[data-slot=switch-thumb]]:size-4 [&_span[data-slot=switch-thumb]]:data-[state=checked]:translate-x-4"
                                />
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Right Column */}
                <div className="space-y-6">
                    {/* Preferences (Language) */}
                    <Card className="shadow-none">
                        <CardHeader>
                            <CardTitle>{t("settings.preferences.title")}</CardTitle>
                            <CardDescription>
                                {t("settings.preferences.desc")}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center justify-between space-x-2">
                                <div className="space-y-2">
                                    <Label>{t("settings.preferences.language")}</Label>
                                    <p className="font-normal text-xs text-muted-foreground">
                                        {t("settings.preferences.language_desc")}
                                    </p>
                                </div>
                                <Select
                                    value={i18n.language}
                                    onValueChange={(value) => {
                                        i18n.changeLanguage(value);
                                        toast.info(t("settings.preferences.language_changed"), {
                                            description: t("settings.preferences.language_wip"),
                                        });
                                    }}
                                >
                                    <SelectTrigger className="w-[160px]">
                                        <SelectValue placeholder="Select language" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="en">English</SelectItem>
                                        <SelectItem value="es">Español</SelectItem>
                                        <SelectItem value="fr">Français</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardContent>
                    </Card>


                    {/* System (New Block 2) */}
                    <Card className="shadow-none">
                        <CardHeader>
                            <CardTitle>{t("settings.system.title")}</CardTitle>
                            <CardDescription>
                                {t("settings.system.desc")}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* Cache / Data */}
                            <div className="flex items-center justify-between space-x-2">
                                <div className="space-y-2">
                                    <Label>{t("settings.system.local_storage")}</Label>
                                    <p className="text-xs text-muted-foreground">
                                        {t("settings.system.local_storage_desc")}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="outline" size="sm">
                                                {t("settings.system.clear_cache_btn")}
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>{t("settings.system.clear_cache_modal_title")}</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    {t("settings.system.clear_cache_modal_desc")}
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                                                <AlertDialogAction onClick={handleClearCache}>
                                                    {t("settings.system.clear_cache_btn")}
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </div>
                            </div>

                            {/* Updates */}
                            <div className="flex items-center justify-between space-x-2 pt-4 border-t">
                                <div className="space-y-2">
                                    <Label>{t("settings.system.software_update")}</Label>
                                    <p className="text-xs text-muted-foreground">
                                        {t("settings.system.software_update_desc")}
                                    </p>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleCheckUpdates}
                                    disabled={isChecking}
                                >
                                    {isChecking ? (
                                        <>
                                            <Loader2 className="animate-spin" />
                                            {t("settings.system.checking_updates")}
                                        </>
                                    ) : (
                                        t("settings.system.check_updates_btn")
                                    )}
                                </Button>
                            </div>

                            {/* Info */}
                            <div className="grid grid-cols-2 gap-4 pt-4 border-t text-sm">
                                <div className="flex flex-col">
                                    <span className="text-muted-foreground text-xs">{t("settings.system.version")}</span>
                                    <span className="font-medium">{appVersion ? `v${appVersion}` : "—"}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-muted-foreground text-xs">{t("settings.system.environment")}</span>
                                    <span className="font-medium">
                                        {import.meta.env.DEV
                                            ? t("settings.system.environment_dev")
                                            : t("settings.system.environment_prod")}
                                    </span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-muted-foreground text-xs">{t("settings.system.build")}</span>
                                    <span className="font-medium">{__BUILD_DATE__}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-muted-foreground text-xs">{t("settings.system.tauri")}</span>
                                    <span className="font-medium">{tauriVersion ? `v${tauriVersion}` : "—"}</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
