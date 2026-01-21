import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Monitor, Moon, Sun } from "lucide-react";
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
import { AUTOSAVE_FILENAME, SETTINGS_FILENAME } from "@/lib/constants";
import { useTranslation } from "react-i18next";
import { RequirePermission } from "@/components/RequirePermission";
import { useAuth } from "@/components/auth-provider";

export function SettingsPage() {
    const { t, i18n } = useTranslation();
    const { setTheme } = useTheme();
    const { settings, updateSetting } = useSettings();
    const { hasPermission } = useAuth();
    const canEdit = hasPermission("settings.edit");
    const handleClearCache = async () => {
        try {
            let filesDeleted = 0;

            // Delete schedule autosave
            const autosaveExists = await exists(AUTOSAVE_FILENAME, { baseDir: BaseDirectory.AppLocalData });
            if (autosaveExists) {
                await remove(AUTOSAVE_FILENAME, { baseDir: BaseDirectory.AppLocalData });
                filesDeleted++;
            }

            // Delete settings file
            const settingsExists = await exists(SETTINGS_FILENAME, { baseDir: BaseDirectory.AppLocalData });
            if (settingsExists) {
                await remove(SETTINGS_FILENAME, { baseDir: BaseDirectory.AppLocalData });
                filesDeleted++;
            }

            // Reset settings to defaults in memory
            updateSetting("actionsRespectFilters", false);
            updateSetting("autoSave", true);
            updateSetting("theme", "system");
            updateSetting("openAfterExport", true);
            updateSetting("clearScheduleOnLoad", false);
            setTheme("system"); // Apply theme reset

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
        <RequirePermission permission="settings.view">
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
                                        disabled={!canEdit}
                                        value={settings.theme}
                                        onValueChange={(value: "light" | "dark" | "system") => {
                                            updateSetting("theme", value);
                                            setTheme(value); // Apply to DOM
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
                                        disabled={!canEdit}
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
                                    <Switch disabled={!canEdit} id="email-digest" className="h-[20px] w-[36px] [&_span[data-slot=switch-thumb]]:size-4 [&_span[data-slot=switch-thumb]]:data-[state=checked]:translate-x-4" />
                                </div>
                                <div className="flex items-center justify-between space-x-2">
                                    <Label htmlFor="realtime-alerts" className="flex flex-col items-start">
                                        <span>{t("settings.notifications.realtime_alerts")}</span>
                                        <span className="font-normal text-xs text-muted-foreground">
                                            {t("settings.notifications.realtime_alerts_desc")}
                                        </span>
                                    </Label>
                                    <Switch disabled={!canEdit} id="realtime-alerts" defaultChecked className="h-[20px] w-[36px] [&_span[data-slot=switch-thumb]]:size-4 [&_span[data-slot=switch-thumb]]:data-[state=checked]:translate-x-4" />
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
                                        disabled={!canEdit}
                                        id="auto-save"
                                        checked={settings.autoSave}
                                        onCheckedChange={(checked) => updateSetting("autoSave", checked)}
                                        className="h-[20px] w-[36px] [&_span[data-slot=switch-thumb]]:size-4 [&_span[data-slot=switch-thumb]]:data-[state=checked]:translate-x-4"
                                    />
                                </div>
                                <div className="flex items-center justify-between space-x-2">
                                    <Label htmlFor="clear-schedule-on-load" className="flex flex-col items-start">
                                        <span>{t("settings.automation.clear_schedule_on_load")}</span>
                                        <span className="font-normal text-xs text-muted-foreground">
                                            {t("settings.automation.clear_schedule_on_load_desc")}
                                        </span>
                                    </Label>
                                    <Switch
                                        disabled={!canEdit}
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
                                        disabled={!canEdit}
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
                                        disabled={!canEdit}
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
                                                <Button variant="outline" size="sm" disabled={!canEdit}>
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
                                    <Button variant="outline" size="sm" disabled={!canEdit}>
                                        {t("settings.system.check_updates_btn")}
                                    </Button>
                                </div>

                                {/* Info */}
                                <div className="grid grid-cols-2 gap-4 pt-4 border-t text-sm">
                                    <div className="flex flex-col">
                                        <span className="text-muted-foreground text-xs">{t("settings.system.version")}</span>
                                        <span className="font-medium">v2.0.1</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-muted-foreground text-xs">{t("settings.system.environment")}</span>
                                        <span className="font-medium">Production (Windows)</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-muted-foreground text-xs">{t("settings.system.build")}</span>
                                        <span className="font-medium">2026.01.11</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-muted-foreground text-xs">{t("settings.system.tauri")}</span>
                                        <span className="font-medium">v2.0.0</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </RequirePermission>
    );
}
