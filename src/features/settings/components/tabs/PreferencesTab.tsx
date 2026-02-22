import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ArrowUpRight, Coffee, Github, Loader2, Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
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

const switchCn = "";

// const switchCn = "h-5 w-9 [&_span[data-slot=switch-thumb]]:size-4 [&_span[data-slot=switch-thumb]]:data-[state=checked]:translate-x-4";

function SettingRow({ children }: { children: React.ReactNode }) {
    return <div className="flex items-center justify-between gap-4 py-2">{children}</div>;
}

function SettingLabel({ label, desc, htmlFor }: { label: string; desc?: string; htmlFor?: string }) {
    return (
        <Label htmlFor={htmlFor} className="flex flex-col gap-0.5 cursor-pointer font-normal">
            <span className="text-sm font-medium">{label}</span>
            {desc && <span className="text-xs text-muted-foreground leading-snug">{desc}</span>}
        </Label>
    );
}

function SectionHeader({ label }: { label: string }) {
    return <p className="text-sm font-semibold pb-1">{label}</p>;
}

export function PreferencesTab() {
    const { t, i18n } = useTranslation();
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
        <div className="space-y-4">
            {/* Appearance */}
            <div>
                <SectionHeader label={t("settings.appearance.title")} />
                <SettingRow>
                    <SettingLabel
                        label={t("settings.appearance.theme")}
                        desc={t("settings.appearance.theme_desc")}
                    />
                    <Select
                        value={settings.theme}
                        onValueChange={(value: "light" | "dark" | "system") => {
                            updateSetting("theme", value);
                            setTheme(value);
                        }}
                    >
                        <SelectTrigger className="min-w-30 shrink-0" size="sm">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="light"><div className="flex items-center"><Sun className="mr-2 h-4 w-4" />{t("settings.appearance.theme_light")}</div></SelectItem>
                            <SelectItem value="dark"><div className="flex items-center"><Moon className="mr-2 h-4 w-4" />{t("settings.appearance.theme_dark")}</div></SelectItem>
                            <SelectItem value="system"><div className="flex items-center"><Monitor className="mr-2 h-4 w-4" />{t("settings.appearance.theme_system")}</div></SelectItem>
                        </SelectContent>
                    </Select>
                </SettingRow>
                <SettingRow>
                    <SettingLabel
                        htmlFor="actions-respect-filters"
                        label={t("settings.appearance.respect_filters")}
                        desc={t("settings.appearance.respect_filters_desc")}
                    />
                    <Switch
                        id="actions-respect-filters"
                        checked={settings.actionsRespectFilters}
                        onCheckedChange={(checked) => updateSetting("actionsRespectFilters", checked)}
                        className={switchCn}
                    />
                </SettingRow>
            </div>

            <Separator />

            {/* Language */}
            <div>
                <SectionHeader label={t("settings.preferences.language")} />
                <SettingRow>
                    <SettingLabel
                        label={t("settings.preferences.language")}
                        desc={t("settings.preferences.language_desc")}
                    />
                    <Select
                        value={i18n.language}
                        onValueChange={(value) => {
                            i18n.changeLanguage(value);
                            toast.info(t("settings.preferences.language_changed"), {
                                description: t("settings.preferences.language_wip"),
                            });
                        }}
                    >
                        <SelectTrigger className="min-w-30 shrink-0" size="sm">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="en">English</SelectItem>
                            <SelectItem value="es">Español</SelectItem>
                            <SelectItem value="fr">Français</SelectItem>
                        </SelectContent>
                    </Select>
                </SettingRow>
            </div>

            <Separator />

            {/* Notifications */}
            <div>
                <SectionHeader label={t("settings.notifications.title")} />
                <SettingRow>
                    <SettingLabel
                        htmlFor="realtime-notifications"
                        label={t("settings.notifications.schedule_updates")}
                        desc={t("settings.notifications.schedule_updates_desc")}
                    />
                    <Switch
                        id="realtime-notifications"
                        checked={settings.realtimeNotifications}
                        onCheckedChange={(checked) => updateSetting("realtimeNotifications", checked)}
                        className={switchCn}
                    />
                </SettingRow>
            </div>

            <Separator />

            {/* Automation */}
            <div>
                <SectionHeader label={t("settings.automation.title")} />
                <SettingRow>
                    <SettingLabel
                        htmlFor="auto-save"
                        label={t("settings.automation.auto_save")}
                        desc={t("settings.automation.auto_save_desc")}
                    />
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
                            className={switchCn}
                        />
                    </div>
                </SettingRow>
                <SettingRow>
                    <SettingLabel
                        htmlFor="clear-schedule-on-load"
                        label={t("settings.automation.clear_schedule_on_load")}
                        desc={t("settings.automation.clear_schedule_on_load_desc")}
                    />
                    <Switch
                        id="clear-schedule-on-load"
                        checked={settings.clearScheduleOnLoad}
                        onCheckedChange={(checked) => updateSetting("clearScheduleOnLoad", checked)}
                        className={switchCn}
                    />
                </SettingRow>
            </div>

            <Separator />

            {/* Storage */}
            <div>
                <SectionHeader label={t("settings.storage.title")} />
                <SettingRow>
                    <SettingLabel
                        htmlFor="open-after-export"
                        label={t("settings.storage.open_after_export")}
                        desc={t("settings.storage.open_after_export_desc")}
                    />
                    <Switch
                        id="open-after-export"
                        checked={settings.openAfterExport}
                        onCheckedChange={(checked) => updateSetting("openAfterExport", checked)}
                        className={switchCn}
                    />
                </SettingRow>
            </div>

            <Separator />

            {/* System */}
            <div>
                <SectionHeader label={t("settings.system.title")} />
                <SettingRow>
                    <SettingLabel
                        label={t("settings.system.local_storage")}
                        desc={t("settings.system.local_storage_desc")}
                    />
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="outline" size="sm" className="shrink-0">
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
                </SettingRow>
                <SettingRow>
                    <SettingLabel
                        label={t("settings.system.software_update")}
                        desc={t("settings.system.software_update_desc")}
                    />
                    <Button variant="outline" size="sm" onClick={handleCheckUpdates} disabled={isChecking} className="shrink-0">
                        {isChecking ? <><Loader2 className="animate-spin" />{t("settings.system.checking_updates")}</> : t("settings.system.check_updates_btn")}
                    </Button>
                </SettingRow>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-2 text-sm">
                    {[
                        { label: t("settings.system.version"), value: appVersion ? `v${appVersion}` : "—" },
                        { label: t("settings.system.environment"), value: import.meta.env.DEV ? t("settings.system.environment_dev") : t("settings.system.environment_prod") },
                        { label: t("settings.system.build"), value: __BUILD_DATE__ },
                        { label: t("settings.system.tauri"), value: tauriVersion ? `v${tauriVersion}` : "—" },
                    ].map(({ label, value }) => (
                        <div key={label} className="flex flex-col">
                            <span className="text-xs text-muted-foreground">{label}</span>
                            <span className="text-sm font-medium">{value}</span>
                        </div>
                    ))}
                </div>
            </div>

            <Separator />

            {/* About */}
            <div className="space-y-3 pb-2">
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center size-10 rounded-xl bg-primary/10 shrink-0">
                        <span className="text-xl font-bold text-primary">M</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                            <span className="font-semibold">Minerva</span>
                            {appVersion && (
                                <span className="text-[10px] font-medium bg-muted text-muted-foreground px-1.5 py-0.5 rounded-md">
                                    v{appVersion}
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground">Manage, view, and export your schedules with ease.</p>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
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
