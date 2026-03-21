import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from "react";
import { readTextFile, writeTextFile, exists, BaseDirectory } from "@tauri-apps/plugin-fs";

import { STORAGE_FILES } from "@/lib/constants";

interface AppSettings {
    actionsRespectFilters: boolean;
    autoSave: boolean;
    autoSaveInterval: number;
    theme: "light" | "dark" | "system";
    openAfterExport: boolean;
    clearScheduleOnLoad: boolean;
    realtimeNotifications: boolean;
    aiBaseUrl: string;
    aiApiKey: string;
    aiModel: string;
    aiTokenLimit: number; // tokens máximos por sesión (0 = sin límite)
    aiApiKeys: Record<string, string>; // API keys persistidas por nombre de preset
}

interface SettingsContextType {
    settings: AppSettings;
    updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
    isLoading: boolean;
}

const defaultSettings: AppSettings = {
    actionsRespectFilters: false,
    autoSave: true,
    autoSaveInterval: 3000,
    theme: "system",
    openAfterExport: true,
    clearScheduleOnLoad: false,
    realtimeNotifications: true,
    aiBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    aiApiKey: "",
    aiModel: "gemini-2.5-flash",
    aiTokenLimit: 0,
    aiApiKeys: {},
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
                    const parsed: unknown = JSON.parse(content);
                    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                        const p = parsed as Record<string, unknown>;
                        const validated = { ...defaultSettings };

                        for (const key of Object.keys(defaultSettings) as (keyof AppSettings)[]) {
                            if (!(key in p)) continue;
                            if (key === "aiApiKeys") {
                                if (p[key] && typeof p[key] === "object" && !Array.isArray(p[key])) {
                                    validated.aiApiKeys = p[key] as Record<string, string>;
                                }
                            } else if (typeof p[key] === typeof defaultSettings[key]) {
                                Object.assign(validated, { [key]: p[key] });
                            }
                        }

                        // Migrar desde formato aiProviders[] (versión anterior)
                        const legacyProviders = p["aiProviders"];
                        if (Array.isArray(legacyProviders) && legacyProviders.length > 0) {
                            const first = legacyProviders[0] as Record<string, unknown>;
                            if (typeof first.baseUrl === "string" && first.baseUrl) validated.aiBaseUrl = first.baseUrl;
                            if (typeof first.model === "string" && first.model) validated.aiModel = first.model;
                            if (typeof first.apiKey === "string") validated.aiApiKey = first.apiKey;
                        }

                        setSettings(validated);
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
        if (isLoading) return;

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
