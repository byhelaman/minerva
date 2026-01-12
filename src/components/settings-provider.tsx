import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from "react";
import { readTextFile, writeTextFile, exists, BaseDirectory } from "@tauri-apps/plugin-fs";
import { downloadDir } from "@tauri-apps/api/path";
import { SETTINGS_FILENAME } from "@/lib/constants";

interface AppSettings {
    actionsRespectFilters: boolean;
    autoSave: boolean;
    theme: "light" | "dark" | "system";
    defaultExportPath: string; // Empty string = use Downloads folder
    openAfterExport: boolean;
    exportWithoutConfirmation: boolean;
}

interface SettingsContextType {
    settings: AppSettings;
    updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
    isLoading: boolean;
}

const defaultSettings: AppSettings = {
    actionsRespectFilters: false,
    autoSave: true,
    theme: "system",
    defaultExportPath: "", // Will resolve to Downloads at runtime
    openAfterExport: true,
    exportWithoutConfirmation: false,
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
    const [settings, setSettings] = useState<AppSettings>(defaultSettings);
    const [isLoading, setIsLoading] = useState(true);
    const hasLoaded = useRef(false);

    // Load settings from file on mount
    useEffect(() => {
        if (hasLoaded.current) return;
        hasLoaded.current = true;

        const loadSettings = async () => {
            try {
                const fileExists = await exists(SETTINGS_FILENAME, { baseDir: BaseDirectory.AppLocalData });
                if (fileExists) {
                    const content = await readTextFile(SETTINGS_FILENAME, { baseDir: BaseDirectory.AppLocalData });
                    const parsed = JSON.parse(content);

                    // If defaultExportPath is missing or empty, resolve it
                    let finalSettings = { ...defaultSettings, ...parsed };
                    if (!finalSettings.defaultExportPath) {
                        try {
                            finalSettings.defaultExportPath = await downloadDir();
                        } catch (err) {
                            console.error("Failed to get download dir:", err);
                        }
                    }

                    setSettings(finalSettings);
                } else {
                    // First run: resolve download dir for default settings
                    try {
                        const dlDir = await downloadDir();
                        setSettings(prev => ({ ...prev, defaultExportPath: dlDir }));
                    } catch (err) {
                        console.error("Failed to get download dir:", err);
                    }
                }
            } catch (e) {
                console.error("Failed to load settings from file:", e);
            } finally {
                setIsLoading(false);
            }
        };

        loadSettings();
    }, []);

    // Save settings to file whenever they change (after initial load)
    useEffect(() => {
        if (isLoading) return; // Don't save while still loading

        const saveSettings = async () => {
            try {
                await writeTextFile(SETTINGS_FILENAME, JSON.stringify(settings, null, 2), {
                    baseDir: BaseDirectory.AppLocalData,
                });
            } catch (e) {
                console.error("Failed to save settings to file:", e);
            }
        };

        saveSettings();
    }, [settings, isLoading]);

    const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
        setSettings((prev) => ({ ...prev, [key]: value }));
    };

    return (
        <SettingsContext.Provider value={{ settings, updateSetting, isLoading }}>
            {children}
        </SettingsContext.Provider>
    );
}

export function useSettings() {
    const context = useContext(SettingsContext);
    if (context === undefined) {
        throw new Error("useSettings must be used within a SettingsProvider");
    }
    return context;
}
