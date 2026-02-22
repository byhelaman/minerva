import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ArrowUpRight, Coffee, Github, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
import { useUpdaterContext } from "@/components/updater-context";
import { getVersion, getTauriVersion } from "@tauri-apps/api/app";
import { useState, useEffect } from "react";

export function PreferencesTab() {
    const { t } = useTranslation();
    const { setTheme } = useTheme();
    const { settings, updateSetting } = useSettings();
    const { checkForUpdates, isChecking, error: updateError } = useUpdaterContext();

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
            // Error toast handled by updateError effect
        }
    };

    useEffect(() => {
        if (updateError) {
            toast.error(t("settings.system.update_error"), { description: updateError });
        }
    }, [updateError, t]);

    const handleClearCache = async () => {
        try {
            let filesDeleted = 0;
            const autosaveExists = await exists(STORAGE_FILES.SCHEDULES_DRAFT, { baseDir: BaseDirectory.AppLocalData });
            if (autosaveExists) {
                await remove(STORAGE_FILES.SCHEDULES_DRAFT, { baseDir: BaseDirectory.AppLocalData });
                filesDeleted++;
            }
            const settingsExists = await exists(STORAGE_FILES.APP_SETTINGS, { baseDir: BaseDirectory.AppLocalData });
            if (settingsExists) {
                await remove(STORAGE_FILES.APP_SETTINGS, { baseDir: BaseDirectory.AppLocalData });
                filesDeleted++;
            }
            updateSetting("actionsRespectFilters", false);
            updateSetting("autoSave", true);
            updateSetting("theme", "system");
            updateSetting("openAfterExport", true);
            updateSetting("clearScheduleOnLoad", false);
            updateSetting("realtimeNotifications", true);
            updateSetting("autoSaveInterval", 3000);
            setTheme("system");
            if (filesDeleted > 0) {
                toast.success("Cache cleared successfully", { description: "Local data and settings have been reset." });
            } else {
                toast.info("Cache is already empty");
            }
        } catch (error) {
            console.error("Failed to clear cache:", error);
            toast.error("Failed to clear cache");
        }
    };

    return (
        <div className="space-y-6 pr-1">
            {/* Appearance */}
            <div className="space-y-4">
                <p className="text-sm font-semibold">{t("settings.appearance.title")}</p>
                <div className="flex items-center justify-between gap-4">
                    <Label htmlFor="actions-respect-filters" className="flex flex-col gap-0.5 cursor-pointer font-normal items-start">
                        <span className="text-sm">{t("settings.appearance.respect_filters")}</span>
                        <span className="text-xs text-muted-foreground">{t("settings.appearance.respect_filters_desc")}</span>
                    </Label>
                    <Switch
                        id="actions-respect-filters"
                        checked={settings.actionsRespectFilters}
                        onCheckedChange={(checked) => updateSetting("actionsRespectFilters", checked)}
                    />
                </div>
            </div>

            <Separator />

            {/* Notifications */}
            <div className="space-y-4">
                <p className="text-sm font-semibold">{t("settings.notifications.title")}</p>
                <div className="flex items-center justify-between gap-4">
                    <Label htmlFor="realtime-notifications" className="flex flex-col gap-0.5 cursor-pointer font-normal items-start">
                        <span className="text-sm">{t("settings.notifications.schedule_updates")}</span>
                        <span className="text-xs text-muted-foreground">{t("settings.notifications.schedule_updates_desc")}</span>
                    </Label>
                    <Switch
                        id="realtime-notifications"
                        checked={settings.realtimeNotifications}
                        onCheckedChange={(checked) => updateSetting("realtimeNotifications", checked)}
                    />
                </div>
            </div>

            <Separator />

            {/* Automation */}
            <div className="space-y-4">
                <p className="text-sm font-semibold">{t("settings.automation.title")}</p>
                <div className="flex items-center justify-between gap-4">
                    <Label htmlFor="auto-save" className="flex flex-col gap-0.5 cursor-pointer font-normal items-start">
                        <span className="text-sm">{t("settings.automation.auto_save")}</span>
                        <span className="text-xs text-muted-foreground">{t("settings.automation.auto_save_desc")}</span>
                    </Label>
                    <div className="flex items-center gap-2 shrink-0">
                        <Select
                            value={String(settings.autoSaveInterval)}
                            onValueChange={(value) => updateSetting("autoSaveInterval", Number(value))}
                            disabled={!settings.autoSave}
                        >
                            <SelectTrigger className="min-w-28" size="sm">
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
                        />
                    </div>
                </div>
                <div className="flex items-center justify-between gap-4">
                    <Label htmlFor="clear-schedule-on-load" className="flex flex-col gap-0.5 cursor-pointer font-normal items-start">
                        <span className="text-sm">{t("settings.automation.clear_schedule_on_load")}</span>
                        <span className="text-xs text-muted-foreground">{t("settings.automation.clear_schedule_on_load_desc")}</span>
                    </Label>
                    <Switch
                        id="clear-schedule-on-load"
                        checked={settings.clearScheduleOnLoad}
                        onCheckedChange={(checked) => updateSetting("clearScheduleOnLoad", checked)}
                    />
                </div>
            </div>

            <Separator />

            {/* Storage */}
            <div className="space-y-4">
                <p className="text-sm font-semibold">{t("settings.storage.title")}</p>
                <div className="flex items-center justify-between gap-4">
                    <Label htmlFor="open-after-export" className="flex flex-col gap-0.5 cursor-pointer font-normal items-start">
                        <span className="text-sm">{t("settings.storage.open_after_export")}</span>
                        <span className="text-xs text-muted-foreground">{t("settings.storage.open_after_export_desc")}</span>
                    </Label>
                    <Switch
                        id="open-after-export"
                        checked={settings.openAfterExport}
                        onCheckedChange={(checked) => updateSetting("openAfterExport", checked)}
                    />
                </div>
            </div>

            <Separator />

            {/* System */}
            <div className="space-y-4">
                <p className="text-sm font-semibold">{t("settings.system.title")}</p>
                <div className="flex items-center justify-between gap-4">
                    <Label className="flex flex-col gap-0.5 font-normal items-start">
                        <span className="text-sm">{t("settings.system.local_storage")}</span>
                        <span className="text-xs text-muted-foreground">{t("settings.system.local_storage_desc")}</span>
                    </Label>
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="outline" size="sm" className="shrink-0">
                                {t("settings.system.clear_cache_btn")}
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="sm:max-w-100!">
                            <AlertDialogHeader>
                                <AlertDialogTitle>{t("settings.system.clear_cache_modal_title")}</AlertDialogTitle>
                                <AlertDialogDescription>
                                    {t("settings.system.clear_cache_modal_desc")}
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                                <AlertDialogAction onClick={handleClearCache}>
                                    Continue
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            </div>

            <Separator />

            {/* About */}
            <div className="space-y-4 pb-2">
                <p className="text-sm font-semibold">About</p>
                <div className="flex items-center justify-between gap-4">
                    <Label className="flex flex-col gap-0.5 font-normal items-start">
                        <span className="text-sm">{t("settings.system.software_update")}</span>
                        <span className="text-xs text-muted-foreground">{t("settings.system.software_update_desc")}</span>
                    </Label>
                    <Button variant="outline" size="sm" onClick={handleCheckUpdates} disabled={isChecking} className="shrink-0">
                        {isChecking ? <><Loader2 className="animate-spin" />{t("settings.system.checking_updates")}</> : t("settings.system.check_updates_btn")}
                    </Button>
                </div>
                <div className="grid grid-cols-2 gap-4 pt-2 text-sm">
                    {[
                        { label: t("settings.system.version"), value: appVersion ? `v${appVersion}` : "—" },
                        { label: t("settings.system.environment"), value: import.meta.env.DEV ? t("settings.system.environment_dev") : t("settings.system.environment_prod") },
                        { label: t("settings.system.build"), value: __BUILD_DATE__ },
                        { label: t("settings.system.tauri"), value: tauriVersion ? `v${tauriVersion}` : "—" },
                    ].map(({ label, value }) => (
                        <div key={label} className="flex flex-col gap-0.5">
                            <span className="text-xs text-muted-foreground">{label}</span>
                            <span className="text-sm font-medium">{value}</span>
                        </div>
                    ))}
                </div>

                <Separator />

                <div className="flex flex-wrap gap-2 pl-1">
                    <Button variant="outline" size="sm" onClick={() => openUrl("https://github.com/byhelaman/minerva")}>
                        <Github />GitHub<ArrowUpRight />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openUrl("https://www.buymeacoffee.com/helaman")}>
                        <Coffee />Buy me a coffee<ArrowUpRight />
                    </Button>
                </div>
                <p className="text-xs text-muted-foreground">© 2026 minerva · byhelaman · MIT</p>
            </div>
        </div>
    );
}
