import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ArrowUpRight, Coffee, Github, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
import { useUpdaterContext } from "@/components/updater-context";
import { getVersion, getTauriVersion } from "@tauri-apps/api/app";
import { useState, useEffect } from "react";

export function PreferencesTab() {
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
                toast.success("You're up to date!", {
                    description: `Minerva v${appVersion} is the latest version.`,
                });
            }
        } catch {
            // Error toast handled by updateError effect
        }
    };

    useEffect(() => {
        if (updateError) {
            toast.error("Could not check for updates", { description: updateError });
        }
    }, [updateError]);

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
        <div className="space-y-6 px-1">
            {/* Appearance */}
            <div className="space-y-4">
                <p className="text-sm font-semibold">Appearance</p>
                <div className="flex items-center justify-between gap-4">
                    <Label htmlFor="actions-respect-filters" className="flex flex-col gap-0.5 cursor-pointer font-normal items-start">
                        <span className="text-sm">Actions Respect Filters</span>
                        <span className="text-xs text-muted-foreground">Apply actions (Export, Copy) only to the currently filtered data.</span>
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
                <p className="text-sm font-semibold">Notifications</p>
                <div className="flex items-center justify-between gap-4">
                    <Label htmlFor="realtime-notifications" className="flex flex-col gap-0.5 cursor-pointer font-normal items-start">
                        <span className="text-sm">Schedule Updates</span>
                        <span className="text-xs text-muted-foreground">Show notifications when new schedules are published.</span>
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
                <p className="text-sm font-semibold">Automation</p>
                <div className="flex items-center justify-between gap-4">
                    <Label htmlFor="auto-save" className="flex flex-col gap-0.5 cursor-pointer font-normal items-start">
                        <span className="text-sm">Auto Save</span>
                        <span className="text-xs text-muted-foreground">Automatically save changes to local storage.</span>
                    </Label>
                    <Switch
                        id="auto-save"
                        checked={settings.autoSave}
                        onCheckedChange={(checked) => updateSetting("autoSave", checked)}
                    />
                </div>
                <div className="flex items-center justify-between gap-4">
                    <Label htmlFor="clear-schedule-on-load" className="flex flex-col gap-0.5 cursor-pointer font-normal items-start">
                        <span className="text-sm">Clear Schedule on Load</span>
                        <span className="text-xs text-muted-foreground">Replace existing schedules when loading a new file.</span>
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
                <p className="text-sm font-semibold">Storage & Export</p>
                <div className="flex items-center justify-between gap-4">
                    <Label htmlFor="open-after-export" className="flex flex-col gap-0.5 cursor-pointer font-normal items-start">
                        <span className="text-sm">Open After Export</span>
                        <span className="text-xs text-muted-foreground">Automatically open the file after exporting.</span>
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
                <p className="text-sm font-semibold">System</p>
                <div className="flex items-center justify-between gap-4">
                    <Label className="flex flex-col gap-0.5 font-normal items-start">
                        <span className="text-sm">Local Storage</span>
                        <span className="text-xs text-muted-foreground">Manage local data cache (schedules, settings).</span>
                    </Label>
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="outline" size="sm" className="shrink-0">
                                Clear Cache
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="sm:max-w-100!">
                            <AlertDialogHeader>
                                <AlertDialogTitle>Clear all local data?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This will delete all saved schedules and reset your settings to defaults. This action cannot be undone.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
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
                        <span className="text-sm">Software Update</span>
                        <span className="text-xs text-muted-foreground">Check for the latest version of Minerva.</span>
                    </Label>
                    <Button variant="outline" size="sm" onClick={handleCheckUpdates} disabled={isChecking} className="shrink-0">
                        {isChecking ? <><Loader2 className="animate-spin" />Checking...</> : "Check for Updates"}
                    </Button>
                </div>
                <div className="grid grid-cols-2 gap-4 pt-2 text-sm">
                    {[
                        { label: "Version", value: appVersion ? `v${appVersion}` : "—" },
                        { label: "Environment", value: import.meta.env.DEV ? "Development" : "Production" },
                        { label: "Build", value: __BUILD_DATE__ },
                        { label: "Tauri", value: tauriVersion ? `v${tauriVersion}` : "—" },
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
