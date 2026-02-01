import { create } from 'zustand';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { formatDateForDisplay, parseISODate } from '@/lib/utils';
import { PublishedSchedule, SchedulesConfig } from '../types';
import { publishScheduleToExcel } from '../services/microsoft-publisher';
import { useScheduleDataStore } from './useScheduleDataStore';
import { useScheduleUIStore } from './useScheduleUIStore';

interface ScheduleSyncState {
    // MS Config State
    msConfig: SchedulesConfig;
    refreshMsConfig: () => Promise<void>;

    // Publish State
    isPublishing: boolean;
    publishCooldownUntil: number | null;
    setPublishCooldownUntil: (timestamp: number | null) => void;

    // Core Action: Orchestrates Data + UI + Service
    publishDailyChanges: () => Promise<void>;

    // Supabase Sync State
    latestPublished: PublishedSchedule | null;
    currentVersionId: string | null;
    currentVersionUpdatedAt: string | null;
    dismissedVersions: string[];

    checkForUpdates: () => Promise<void>;
    checkIfScheduleExists: (date: string) => Promise<boolean>;
    publishToSupabase: (overwrite?: boolean) => Promise<{ success: boolean; error?: string; exists?: boolean }>;
    downloadPublished: (schedule: PublishedSchedule) => void;
    dismissUpdate: (id: string) => void;
}

// Helper to get initial state
const getSavedVersion = () => {
    try {
        return JSON.parse(localStorage.getItem('current_schedule_version') || '{}');
    } catch {
        return {};
    }
};

export const useScheduleSyncStore = create<ScheduleSyncState>((set, get) => ({
    msConfig: {
        isConnected: false,
        schedulesFolderId: null,
        incidencesFileId: null,
        schedulesFolderName: null,
        incidencesFileName: null
    },
    isPublishing: false,
    publishCooldownUntil: null,

    latestPublished: null,
    currentVersionId: getSavedVersion().id || null,
    currentVersionUpdatedAt: getSavedVersion().updated_at || null,
    dismissedVersions: JSON.parse(localStorage.getItem('dismissed_schedule_versions') || '[]'),

    refreshMsConfig: async () => {
        const { data, error } = await supabase.functions.invoke('microsoft-auth', {
            body: { action: 'status' }
        });

        if (!error && data?.connected) {
            set({
                msConfig: {
                    isConnected: true,
                    schedulesFolderId: data.account.schedules_folder?.id,
                    incidencesFileId: data.account.incidences_file?.id,
                    schedulesFolderName: data.account.schedules_folder?.name,
                    incidencesFileName: data.account.incidences_file?.name
                }
            });
        }
    },

    setPublishCooldownUntil: (timestamp) => set({ publishCooldownUntil: timestamp }),

    publishDailyChanges: async () => {
        const { msConfig, setPublishCooldownUntil } = get();

        // Access other stores
        const { incidences, getComputedSchedules } = useScheduleDataStore.getState();
        const { activeDate } = useScheduleUIStore.getState();

        if (!msConfig.isConnected) {
            toast.error('Microsoft account not connected');
            return;
        }

        if (!activeDate) {
            toast.error('No active date selected');
            return;
        }

        set({ isPublishing: true });
        const toastId = toast.loading("Starting publish process...");

        try {
            await publishScheduleToExcel(
                msConfig,
                incidences,
                activeDate,
                getComputedSchedules(),
                (msg) => toast.loading(msg, { id: toastId })
            );

            toast.success(`Published schedule for ${formatDateForDisplay(activeDate)}`, { id: toastId });
            setPublishCooldownUntil(Date.now() + 60000);

        } catch (error: any) {
            console.error('Publish failed', error);
            toast.error(`Publish failed: ${error.message}`, { id: toastId });
        } finally {
            set({ isPublishing: false });
        }
    },

    checkForUpdates: async () => {
        const { dismissedVersions, currentVersionId, currentVersionUpdatedAt } = get();

        const { data, error } = await supabase
            .from('published_schedules')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (error || !data) return;
        if (dismissedVersions.includes(data.id)) return;

        const isNewId = currentVersionId !== data.id;
        const isNewVersion = !isNewId && (!currentVersionUpdatedAt || (data.updated_at && new Date(data.updated_at) > new Date(currentVersionUpdatedAt)));

        if (isNewId || isNewVersion) {
            set({ latestPublished: data as PublishedSchedule });
        }
    },

    checkIfScheduleExists: async (date: string) => {
        const { data } = await supabase
            .from('published_schedules')
            .select('id')
            .eq('schedule_date', date)
            .single();
        return !!data;
    },

    publishToSupabase: async (overwrite = false) => {
        const { activeDate } = useScheduleUIStore.getState();
        const { baseSchedules } = useScheduleDataStore.getState();

        if (!activeDate) return { success: false, error: 'No active date selected' };

        const scheduleDate = parseISODate(activeDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (scheduleDate < today) return { success: false, error: 'Only future schedules can be published' };
        if (baseSchedules.length === 0) return { success: false, error: 'No schedules to publish' };

        const { data: existing } = await supabase
            .from('published_schedules')
            .select('id')
            .eq('schedule_date', activeDate)
            .single();

        if (existing && !overwrite) return { success: false, error: 'A schedule is already published for this date', exists: true };

        const { data: published, error } = await supabase
            .from('published_schedules')
            .upsert({
                schedule_date: activeDate,
                schedule_data: baseSchedules,
                published_by: (await supabase.auth.getUser()).data.user?.id,
                updated_at: new Date().toISOString()
            }, { onConflict: 'schedule_date' })
            .select()
            .single();

        if (error) return { success: false, error: error.message };

        if (published) {
            const versionData = { id: published.id, updated_at: published.updated_at };
            localStorage.setItem('current_schedule_version', JSON.stringify(versionData));

            set({
                currentVersionId: published.id,
                currentVersionUpdatedAt: published.updated_at,
                latestPublished: null
            });
        }

        toast.success('Schedule published to Minerva');
        return { success: true };
    },

    downloadPublished: (schedule: PublishedSchedule) => {
        const versionData = { id: schedule.id, updated_at: schedule.updated_at };
        localStorage.setItem('current_schedule_version', JSON.stringify(versionData));

        // Sync across stores
        useScheduleDataStore.getState().setBaseSchedules(schedule.schedule_data);
        useScheduleUIStore.getState().setActiveDate(schedule.schedule_date);

        set({
            latestPublished: null,
            currentVersionId: schedule.id,
            currentVersionUpdatedAt: schedule.updated_at
        });
        toast.success(`Schedule for ${formatDateForDisplay(schedule.schedule_date)} downloaded`);
    },

    dismissUpdate: (id: string) => {
        const { dismissedVersions } = get();
        const updated = [...dismissedVersions, id];
        localStorage.setItem('dismissed_schedule_versions', JSON.stringify(updated));
        set({
            dismissedVersions: updated,
            latestPublished: null
        });
    }
}));
