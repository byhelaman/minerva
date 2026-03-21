import { useEffect } from "react";
import { useScheduleSyncStore } from "@/features/schedules/stores/useScheduleSyncStore";
import { supabase } from "@/lib/supabase";

export function ScheduleUpdateBanner() {
    const { checkForUpdates, addNotification, latestPublished } = useScheduleSyncStore();

    // Check for updates on mount + subscribe to Realtime
    useEffect(() => {
        checkForUpdates();

        const channel = supabase
            .channel('published_schedules_changes')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'published_schedules' },
                () => {
                    if (!useScheduleSyncStore.getState().isPublishing) {
                        checkForUpdates();
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [checkForUpdates]);

    // When a new published schedule is detected, add to notification list
    useEffect(() => {
        if (latestPublished) {
            addNotification(latestPublished);
        }
    }, [latestPublished, addNotification]);

    return null;
}
