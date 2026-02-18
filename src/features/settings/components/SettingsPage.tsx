import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ArrowUpRight, Coffee, Github, Loader2, Monitor, Moon, Sun } from "lucide-react";
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
import { openUrl } from "@tauri-apps/plugin-opener";
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
    const { checkForUpdates, isChecking, error: updateError } = useUpdater();

    const [appVersion, setAppVersion] = useState<string>("");
    const [tauriVersion, setTauriVersion] = useState<string>("");

    useEffect(() => {
        getVersion().then(setAppVersion);
        getTauriVersion().then(setTauriVersion);
    }, []);

    const handleCheckUpdates = async () => {
        try {
            const result = await checkForUpdates();
            if (!result) {
                toast.success(t("settings.system.up_to_date"), {
                    description: t("settings.system.up_to_date_desc", { version: appVersion }),
                });
            }
        } catch {
            // Error toast is handled by the updateError useEffect
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
            updateSetting("realtimeNotifications", true);
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
        <div className="flex flex-col h-full min-h-0">
            <div className="flex flex-col py-8 my-4 gap-1">
                <h1 className="text-xl font-bold tracking-tight">{t("settings.title")}</h1>
                <p className="text-muted-foreground text-sm">{t("settings.subtitle")}</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2 flex-1 overflow-auto min-h-0 pb-6 pr-4">
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
                                    <SelectTrigger className="min-w-30" size="sm">
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
                                    className="h-5 w-9 [&_span[data-slot=switch-thumb]]:size-4 [&_span[data-slot=switch-thumb]]:data-[state=checked]:translate-x-4"
                                />
                            </div>
                            <div className="flex items-center justify-between space-x-2">
                                <Label htmlFor="disable-pagination" className="flex flex-col items-start">
                                    <span>{t("settings.appearance.disable_pagination")}</span>
                                    <span className="font-normal text-xs text-muted-foreground">
                                        {t("settings.appearance.disable_pagination_desc")}
                                    </span>
                                </Label>
                                <Switch
                                    id="disable-pagination"
                                    checked={settings.disablePagination}
                                    onCheckedChange={(checked) => updateSetting("disablePagination", checked)}
                                    className="h-5 w-9 [&_span[data-slot=switch-thumb]]:size-4 [&_span[data-slot=switch-thumb]]:data-[state=checked]:translate-x-4"
                                />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Notifications */}
                    <Card className="shadow-none">
                        <CardHeader>
                            <CardTitle>{t("settings.notifications.title")}</CardTitle>
                            <CardDescription>
                                {t("settings.notifications.desc")}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between space-x-2">
                                <Label htmlFor="realtime-notifications" className="flex flex-col items-start">
                                    <span>{t("settings.notifications.schedule_updates")}</span>
                                    <span className="font-normal text-xs text-muted-foreground">
                                        {t("settings.notifications.schedule_updates_desc")}
                                    </span>
                                </Label>
                                <Switch
                                    id="realtime-notifications"
                                    checked={settings.realtimeNotifications}
                                    onCheckedChange={(checked) => updateSetting("realtimeNotifications", checked)}
                                    className="h-5 w-9 [&_span[data-slot=switch-thumb]]:size-4 [&_span[data-slot=switch-thumb]]:data-[state=checked]:translate-x-4"
                                />
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
                                <div className="flex gap-3 items-center">
                                    <Select
                                        value={String(settings.autoSaveInterval)}
                                        onValueChange={(value) => updateSetting("autoSaveInterval", Number(value))}
                                        disabled={!settings.autoSave}
                                    >
                                        <SelectTrigger className="min-w-30" size="sm">
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
                                    <Switch
                                        id="auto-save"
                                        checked={settings.autoSave}
                                        onCheckedChange={(checked) => updateSetting("autoSave", checked)}
                                        className="h-5 w-9 [&_span[data-slot=switch-thumb]]:size-4 [&_span[data-slot=switch-thumb]]:data-[state=checked]:translate-x-4"
                                    />
                                </div>
                            </div>
                            {/* <div className="flex items-center justify-between space-x-2">
                                <Label htmlFor="auto-save-interval" className="flex flex-col items-start">
                                    <span>{t("settings.automation.auto_save_interval")}</span>
                                    <span className="font-normal text-xs text-muted-foreground">
                                        {t("settings.automation.auto_save_interval_desc")}
                                    </span>
                                </Label>
                                
                            </div> */}
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
                                    className="h-5 w-9 [&_span[data-slot=switch-thumb]]:size-4 [&_span[data-slot=switch-thumb]]:data-[state=checked]:translate-x-4"
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
                                    className="h-5 w-9 [&_span[data-slot=switch-thumb]]:size-4 [&_span[data-slot=switch-thumb]]:data-[state=checked]:translate-x-4"
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
                                    <SelectTrigger className="min-w-30" size="sm">
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

                    {/* About */}
                    <Card className="shadow-none">
                        <CardHeader>
                            <CardTitle>About</CardTitle>
                            <CardDescription>
                                Information about Minerva.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center gap-4">
                                <div className="flex items-center justify-center size-12 rounded-xl bg-primary/10 shrink-0">
                                    <span className="text-2xl font-bold text-primary">M</span>
                                </div>
                                <div className="flex flex-col gap-0.5">
                                    <div className="flex items-center gap-2">
                                        <span className="font-semibold text-base">Minerva</span>
                                        {appVersion && (
                                            <span className="text-[10px] font-medium bg-muted text-muted-foreground px-1.5 py-0.5 rounded-md">
                                                v{appVersion}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        Manage, view, and export your schedules with ease.
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 pt-4 border-t text-sm">
                                <div className="flex flex-col">
                                    <span className="text-muted-foreground text-xs">Developer</span>
                                    <span className="font-medium">byhelaman</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-muted-foreground text-xs">License</span>
                                    <span className="font-medium">MIT</span>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2 pt-4 border-t">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openUrl("https://github.com/byhelaman/minerva")}
                                >
                                    <Github />
                                    GitHub
                                    <ArrowUpRight />
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openUrl("https://www.buymeacoffee.com/helaman")}
                                >
                                    <Coffee />
                                    Buy me a coffee
                                    <ArrowUpRight />
                                </Button>
                            </div>

                            <p className="text-xs text-muted-foreground pt-2">
                                © 2026 minerva.
                            </p>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
