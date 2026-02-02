import { useEffect, useRef } from "react";
import { useSettings } from "@/components/settings-provider";
import { useTheme } from "@/components/theme-provider";
import { useAuth } from "@/components/auth-provider";
import { useZoomStore } from "@/features/matching/stores/useZoomStore";

export function GlobalSyncManager() {
    const { settings, isLoading: isSettingsLoading } = useSettings();
    const { setTheme } = useTheme();
    const { profile, isLoading: isAuthLoading } = useAuth();
    const { fetchZoomData } = useZoomStore();

    const hasSynced = useRef(false);

    // Sincronizar tema al cargar configuración
    useEffect(() => {
        if (!isSettingsLoading && settings.theme) {
            setTheme(settings.theme);
        }
    }, [isSettingsLoading, settings.theme, setTheme]);

    useEffect(() => {
        if (isAuthLoading) return;

        if (!hasSynced.current) {
            const isAdmin = (profile?.hierarchy_level ?? 0) >= 80;

            if (isAdmin) {
                fetchZoomData(); // Load Zoom Data from DB
            }

            hasSynced.current = true;
        }
    }, [fetchZoomData, isAuthLoading, profile]);

    return null;
}
