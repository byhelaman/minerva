import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from "react";
import { readTextFile, writeTextFile, exists, BaseDirectory } from "@tauri-apps/plugin-fs";

import { STORAGE_FILES } from "@/lib/constants";

interface AppSettings {
    actionsRespectFilters: boolean;
    autoSave: boolean;
    autoSaveInterval: number; // in milliseconds
    theme: "light" | "dark" | "system";
    openAfterExport: boolean;
    clearScheduleOnLoad: boolean;
    realtimeNotifications: boolean;
    disablePagination: boolean;
}

interface SettingsContextType {
    settings: AppSettings;
    updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
    isLoading: boolean;
}

const defaultSettings: AppSettings = {
    actionsRespectFilters: false,
    autoSave: true,
    autoSaveInterval: 3000, // 3 seconds default
    theme: "system",
    openAfterExport: true,
    clearScheduleOnLoad: false,
    realtimeNotifications: true,
    disablePagination: false,
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
                const fileExists = await exists(STORAGE_FILES.APP_SETTINGS, { baseDir: BaseDirectory.AppLocalData });
                if (fileExists) {
                    const content = await readTextFile(STORAGE_FILES.APP_SETTINGS, { baseDir: BaseDirectory.AppLocalData });
                    const parsed = JSON.parse(content);
                    setSettings({ ...defaultSettings, ...parsed });
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
                await writeTextFile(STORAGE_FILES.APP_SETTINGS, JSON.stringify(settings, null, 2), {
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
