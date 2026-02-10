import { useEffect, useRef } from "react";
import { useScheduleSyncStore } from "@/features/schedules/stores/useScheduleSyncStore";
import { PublishedSchedule } from "@/features/schedules/types";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { formatDateForDisplay } from "@/lib/date-utils";
import { useSettings } from "@/components/settings-provider";

export function ScheduleUpdateBanner() {
    const { latestPublished, checkForUpdates, loadPublishedSchedule, dismissUpdate } = useScheduleSyncStore();
    const { settings } = useSettings();
    const toastIdRef = useRef<string | number | null>(null);
    const lastSeenIdRef = useRef<string | null>(null);

    // Verificar actualizaciones al montar
    useEffect(() => {
        checkForUpdates();

        // Suscripción Realtime
        const channel = supabase
            .channel('published_schedules_changes')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'published_schedules' },
                () => {
                    // Don't trigger if we're the one publishing
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

    // Handle Toast
    useEffect(() => {
        // If notifications are disabled, dismiss any existing toast
        if (!settings.realtimeNotifications) {
            if (toastIdRef.current) {
                toast.dismiss(toastIdRef.current);
                toastIdRef.current = null;
            }
            return;
        }

        if (latestPublished) {
            // If already showing this exact schedule, don't re-toast
            if (lastSeenIdRef.current === latestPublished.id) {
                return;
            }

            // Dismiss previous if exists
            if (toastIdRef.current) {
                toast.dismiss(toastIdRef.current);
            }

            lastSeenIdRef.current = latestPublished.id;

            toastIdRef.current = toast("New Schedule Available", {
                description: `Schedule for ${formatDateForDisplay(latestPublished.schedule_date)} has been published.`,
                duration: Infinity, // No auto-dismiss
                action: {
                    label: "Download",
                    onClick: () => loadPublishedSchedule(latestPublished as PublishedSchedule),
                },
                cancel: {
                    label: "Dismiss",
                    onClick: () => dismissUpdate(latestPublished.id),
                },
            });
        } else {
            // If latestPublished is gone, remove toast
            if (toastIdRef.current) {
                toast.dismiss(toastIdRef.current);
                toastIdRef.current = null;
            }
            lastSeenIdRef.current = null;
        }
    }, [latestPublished, loadPublishedSchedule, dismissUpdate, settings.realtimeNotifications]);

    return null;
}
