import { create } from 'zustand';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { formatDateForDisplay } from '@/lib/date-utils';
import { jwtDecode } from "jwt-decode";
import { PublishedSchedule, SchedulesConfig } from '../types';
import { scheduleEntriesService } from '../services/schedule-entries-service';
import { useScheduleDataStore } from './useScheduleDataStore';
import { useScheduleUIStore } from './useScheduleUIStore';
import { registerSignOutCleanup } from '@/components/auth-provider';
// import { mergeSchedulesWithIncidences } from '../utils/merge-utils';

interface ScheduleSyncState {
    // MS Config State
    msConfig: SchedulesConfig;
    refreshMsConfig: () => Promise<void>;

    // Sync State
    isSyncing: boolean;
    isPublishing: boolean; // Renamed concept: Publishing = DB, Syncing = Excel? Or shared?
    // Let's keep isPublishing for DB, add isSyncing for Excel

    // Core Actions
    publishToSupabase: (overwrite?: boolean) => Promise<{ success: boolean; error?: string; exists?: boolean }>;
    syncToExcel: (date?: string, endDate?: string) => Promise<void>;

    // Supabase State (Published Schedules Table)
    latestPublished: PublishedSchedule | null;
    currentVersionId: string | null;
    currentVersionUpdatedAt: string | null;
    dismissedVersions: string[];

    checkForUpdates: () => Promise<void>;
    checkIfScheduleExists: (date: string) => Promise<boolean>;
    dismissUpdate: (id: string) => void;
    // Download legacy logic removed or adapted? Adapted to just load date
    loadPublishedSchedule: (schedule: PublishedSchedule) => Promise<void>;
    resetCurrentVersion: () => Promise<void>;
    resetSyncState: () => void;
    getLatestCloudVersion: (date?: string | null) => Promise<{ exists: boolean; data?: PublishedSchedule; error?: string }>;
    getCloudVersions: () => Promise<{ data: PublishedSchedule[]; error?: string }>;
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
        incidencesFileName: null,
        incidencesWorksheetId: null,
        incidencesWorksheetName: null,
        incidencesTableId: null,
        incidencesTableName: null
    },
    isPublishing: false,
    isSyncing: false,

    latestPublished: null,
    currentVersionId: getSavedVersion().id || null,
    currentVersionUpdatedAt: getSavedVersion().updated_at || null,
    dismissedVersions: JSON.parse(localStorage.getItem('dismissed_schedule_versions') || '[]'),

    refreshMsConfig: async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        try {
            const claims: any = jwtDecode(session.access_token);
            const permissions = claims.permissions || [];
            if (!permissions.includes('reports.manage')) return;
        } catch (e) {
            return;
        }

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
                    incidencesFileName: data.account.incidences_file?.name,
                    incidencesWorksheetId: data.account.incidences_worksheet?.id,
                    incidencesWorksheetName: data.account.incidences_worksheet?.name,
                    incidencesTableId: data.account.incidences_table?.id,
                    incidencesTableName: data.account.incidences_table?.name
                }
            });
        }
    },

    publishToSupabase: async (overwrite = false) => {
        const { activeDate } = useScheduleUIStore.getState();
        const { baseSchedules } = useScheduleDataStore.getState();

        if (!activeDate) return { success: false, error: 'No active date selected' };


        if (baseSchedules.length === 0) return { success: false, error: 'No schedules to publish' };

        set({ isPublishing: true });

        try {
            // 1. Check existence
            const { data: existing } = await supabase
                .from('published_schedules')
                .select('id')
                .eq('schedule_date', activeDate)
                .single();

            if (existing && !overwrite) return { success: false, error: 'A schedule is already published for this date', exists: true };

            // 2. Publish Entries (Upsert)
            await scheduleEntriesService.publishSchedules(baseSchedules, (await supabase.auth.getUser()).data.user?.id || '');

            // 3. Update 'published_schedules' header (without JSONB)
            const { data: published, error } = await supabase
                .from('published_schedules')
                .upsert({
                    schedule_date: activeDate,
                    entries_count: baseSchedules.length,
                    published_by: (await supabase.auth.getUser()).data.user?.id,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'schedule_date' })
                .select()
                .single();

            if (error) throw error;

            if (published) {
                const versionData = { id: published.id, updated_at: published.updated_at };
                localStorage.setItem('current_schedule_version', JSON.stringify(versionData));

                set({
                    currentVersionId: published.id,
                    currentVersionUpdatedAt: published.updated_at,
                    latestPublished: null
                });
            }

            toast.success('Schedule published to Database');
            return { success: true };

        } catch (e: any) {
            console.error("Publish to DB failed", e);
            return { success: false, error: e.message };
        } finally {
            set({ isPublishing: false });
        }
    },

    syncToExcel: async (date?: string, endDateArg?: string) => {
        const targetDate = date || useScheduleUIStore.getState().activeDate;
        const { msConfig } = get();

        if (!targetDate) {
            toast.error("No date selected");
            return;
        }
        if (!msConfig.isConnected || !msConfig.schedulesFolderId) {
            toast.error("Microsoft Excel not connected");
            return;
        }

        set({ isSyncing: true });
        const toastId = toast.loading("Syncing to Excel...");

        try {
            // 1. Fetch schedule entries for this date from Supabase
            // const { schedules, incidences } = await scheduleEntriesService.getSchedulesByDate(targetDate);

            // Merge incidences on top of base schedules
            // const computedSchedules = mergeSchedulesWithIncidences(schedules, incidences);

            // 2. Publish consolidated incidences file
            const { publishIncidencesToExcel } = await import('../services/microsoft-publisher');
            if (msConfig.incidencesFileId) {
                const startDate = targetDate;
                const endDate: string | undefined = endDateArg;

                await publishIncidencesToExcel(
                    msConfig,
                    startDate,
                    endDate,
                    (msg: string) => toast.loading(msg, { id: toastId })
                );
            }

            toast.success("Synced successfully", { id: toastId });

            // 4. Mark date as synced in DB
            await scheduleEntriesService.markDateAsSynced(targetDate);

        } catch (e: any) {
            toast.error(`Sync failed: ${e.message}`, { id: toastId });
        } finally {
            set({ isSyncing: false });
        }
    },

    loadPublishedSchedule: async (schedule: PublishedSchedule) => {
        const { setLoadedData } = useScheduleDataStore.getState();
        const { setActiveDate } = useScheduleUIStore.getState();

        const toastId = toast.loading("Verifying schedule content...");

        try {
            // 1. Verify that there are actual entries to load (and fetch data)
            const { schedules, incidences } = await scheduleEntriesService.getSchedulesByDate(schedule.schedule_date);

            if (schedules.length === 0) {
                toast.warning("The published schedule is empty.", {
                    description: "Aborting load to protect your current view.",
                    id: toastId
                });
                return;
            }

            // 2. Update version tracking
            const versionData = { id: schedule.id, updated_at: schedule.updated_at };
            localStorage.setItem('current_schedule_version', JSON.stringify(versionData));

            set({
                latestPublished: null,
                currentVersionId: schedule.id,
                currentVersionUpdatedAt: schedule.updated_at
            });

            // 3. Set date and inject pre-fetched data (Optimization: no double fetch)
            setActiveDate(schedule.schedule_date);
            setLoadedData(schedules, incidences);

            toast.success(`Loaded schedule for ${formatDateForDisplay(schedule.schedule_date)}`, { id: toastId });

        } catch (e: any) {
            console.error("Failed to load schedule", e);
            toast.error("Failed to load schedule", { id: toastId });
        }
    },

    checkForUpdates: async () => {
        // Guard: Don't check while publishing (prevents race condition with Realtime)
        if (get().isPublishing) return;

        const { dismissedVersions, currentVersionId, currentVersionUpdatedAt } = get();

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        try {
            const claims: any = jwtDecode(session.access_token);
            const permissions = claims.permissions || [];
            if (!permissions.includes('schedules.read')) return;
        } catch (e) {
            return;
        }

        const { data, error } = await supabase
            .from('published_schedules')
            .select('id, schedule_date, updated_at, entries_count') // No JSONB
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

    dismissUpdate: (id: string) => {
        const { dismissedVersions } = get();
        let updated = [...dismissedVersions, id];

        // Keep only the last 10 versions to prevent localStorage bloat
        if (updated.length > 10) {
            updated = updated.slice(-10);
        }

        localStorage.setItem('dismissed_schedule_versions', JSON.stringify(updated));
        set({
            dismissedVersions: updated,
            latestPublished: null
        });
    },

    resetCurrentVersion: async () => {
        localStorage.removeItem('current_schedule_version');
        set({
            currentVersionId: null,
            currentVersionUpdatedAt: null,
            latestPublished: null
        });

        // Check for updates to show the toast again if there is a version on server
        await get().checkForUpdates();
    },

    resetSyncState: () => {
        set({
            latestPublished: null, // Clear the "New Version" toast trigger
            // We might keep msConfig? Or clear it too?
            // For security, clearing sensitive operational state is good.
            isPublishing: false,
            isSyncing: false
        });
    },

    getCloudVersions: async () => {
        try {
            const { data, error } = await supabase
                .from('published_schedules')
                .select('id, schedule_date, updated_at, entries_count, published_by')
                .order('schedule_date', { ascending: false })
                .limit(50);

            if (error) throw error;
            return { data: (data ?? []) as PublishedSchedule[] };
        } catch (e: any) {
            console.error("Error fetching cloud versions:", e);
            return { data: [], error: e.message };
        }
    },

    getLatestCloudVersion: async (date?: string | null) => {
        try {
            let query = supabase
                .from('published_schedules')
                .select('id, schedule_date, updated_at, entries_count, published_by'); // Added published_by

            if (date) {
                query = query.eq('schedule_date', date);
            } else {
                // If no date, get the absolute latest uploaded
                query = query.order('updated_at', { ascending: false }).limit(1);
            }

            // Execute query
            const { data, error } = await query.maybeSingle(); // Use maybeSingle to handle 0 or 1 result gracefully

            if (error) {
                throw error;
            }

            if (!data) return { exists: false };

            return { exists: true, data: data as PublishedSchedule };
        } catch (e: any) {
            console.error("Error fetching cloud version:", e);
            return { exists: false, error: e.message };
        }
    }
}));

// Registrar limpieza automática al cerrar sesión
registerSignOutCleanup(() => useScheduleSyncStore.getState().resetSyncState());
