import { create } from 'zustand';
import { Schedule } from '../utils/excel-parser';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

export interface DailyIncidence extends Schedule {
    status?: string;
    substitute?: string;
    type?: string;
    subtype?: string;
    description?: string;
    department?: string;
    feedback?: string;
}

export interface PublishedSchedule {
    id: string;
    published_by: string | null;
    schedule_date: string;
    schedule_data: Schedule[];
    created_at: string;
    updated_at: string;
}

interface ScheduleState {
    // Data
    baseSchedules: Schedule[]; // Loaded from Excel
    incidences: DailyIncidence[]; // Stored locally (eventually published)

    // Computed
    activeDate: string | null;

    // Actions
    setBaseSchedules: (schedules: Schedule[]) => void;
    setIncidences: (incidences: DailyIncidence[]) => void;
    setActiveDate: (date: string | null) => void;

    // Incidence Actions (Local Only)
    upsertIncidence: (incidence: DailyIncidence) => void;
    removeIncidence: (schedule: Schedule) => void; // Remove by matching schedule keys

    // Helpers
    // Returns base schedules with incidence overrides applied
    getComputedSchedules: () => (Schedule | DailyIncidence)[];

    // Microsoft Integration Status
    msConfig: {
        isConnected: boolean;
        schedulesFolderId: string | null;
        incidencesFileId: string | null;
        schedulesFolderName: string | null;
        incidencesFileName: string | null;
    };
    refreshMsConfig: () => Promise<void>;

    // Publish Action (Excel)
    isPublishing: boolean;
    publishCooldownUntil: number | null; // Timestamp when cooldown expires
    publishDailyChanges: () => Promise<void>;

    // Published Schedules (Supabase)
    latestPublished: PublishedSchedule | null;
    currentVersionId: string | null; // ID of the currently loaded/downloaded version
    currentVersionUpdatedAt: string | null; // Timestamp of the currently loaded version
    dismissedVersions: string[]; // IDs of dismissed schedules
    checkForUpdates: () => Promise<void>;
    checkIfScheduleExists: (date: string) => Promise<boolean>;
    publishToSupabase: (overwrite?: boolean) => Promise<{ success: boolean; error?: string; exists?: boolean }>;
    downloadPublished: (schedule: PublishedSchedule) => void;
    dismissUpdate: (id: string) => void;

    setPublishCooldownUntil: (timestamp: number | null) => void;
}

// Helper to get initial state
const getSavedVersion = () => {
    try {
        return JSON.parse(localStorage.getItem('current_schedule_version') || '{}');
    } catch {
        return {};
    }
};

export const useScheduleStore = create<ScheduleState>((set, get) => ({
    baseSchedules: [],
    incidences: [],
    activeDate: null,
    isPublishing: false,
    publishCooldownUntil: null,
    latestPublished: null,
    currentVersionId: getSavedVersion().id || null,
    currentVersionUpdatedAt: getSavedVersion().updated_at || null,
    dismissedVersions: JSON.parse(localStorage.getItem('dismissed_schedule_versions') || '[]'),

    msConfig: {
        isConnected: false,
        schedulesFolderId: null,
        incidencesFileId: null,
        schedulesFolderName: null,
        incidencesFileName: null
    },

    setBaseSchedules: (schedules) => set({ baseSchedules: schedules }),
    setIncidences: (incidences) => set({ incidences }),
    setActiveDate: (date) => set({ activeDate: date }),
    setPublishCooldownUntil: (timestamp) => set({ publishCooldownUntil: timestamp }),

    upsertIncidence: (newIncidence) => {
        set(state => {
            const filtered = state.incidences.filter(i =>
                !(i.date === newIncidence.date &&
                    i.program === newIncidence.program &&
                    i.start_time === newIncidence.start_time &&
                    i.instructor === newIncidence.instructor)
            );
            return { incidences: [...filtered, newIncidence] };
        });
    },

    removeIncidence: (target) => {
        set(state => ({
            incidences: state.incidences.filter(i =>
                !(i.date === target.date &&
                    i.program === target.program &&
                    i.start_time === target.start_time &&
                    i.instructor === target.instructor)
            )
        }));
    },

    getComputedSchedules: () => {
        const { baseSchedules, incidences } = get();
        return baseSchedules.map(sch => {
            const match = incidences.find(inc =>
                inc.date === sch.date &&
                inc.program === sch.program &&
                inc.start_time === sch.start_time &&
                inc.instructor === sch.instructor
            );
            return match || sch;
        });
    },

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

    publishDailyChanges: async () => {
        const state = get();
        const { msConfig, incidences, activeDate } = state;

        if (!msConfig.isConnected) {
            toast.error('Microsoft account not connected');
            return;
        }

        set({ isPublishing: true });
        // Use a persistent toast ID to update messages
        const toastId = toast.loading("Starting publish process...");

        try {
            if (msConfig.incidencesFileId && incidences.length > 0) {
                const { data: content, error: listError } = await supabase.functions.invoke('microsoft-graph', {
                    body: { action: 'list-content', fileId: msConfig.incidencesFileId }
                });

                if (listError) throw listError;

                const table = content.value.find((i: any) => i.type === 'table');
                if (!table) throw new Error('No table found in Incidences file.');

                const rows = incidences.map(inc => [
                    inc.date, inc.shift, inc.branch, inc.start_time, inc.end_time,
                    inc.code, inc.instructor, inc.program, inc.minutes, inc.units,
                    inc.status || '', inc.substitute || '', inc.type || '',
                    inc.subtype || '', inc.description || '', inc.department || '',
                    inc.feedback || ''
                ]);

                const { error: appendError } = await supabase.functions.invoke('microsoft-graph', {
                    body: { action: 'append-row', fileId: msConfig.incidencesFileId, tableId: table.id, values: rows }
                });

                if (appendError) throw appendError;
                toast.success(`Synced ${incidences.length} incidences to log`, { id: toastId });
            }

            if (msConfig.schedulesFolderId && activeDate) {
                const computed = state.getComputedSchedules();
                let year, month;
                if (activeDate.includes('/')) {
                    const parts = activeDate.split('/');
                    year = parts[2]; month = parts[1];
                } else {
                    const parts = activeDate.split('-');
                    year = parts[0]; month = parts[1];
                }

                const standardName = `${year}_${month.toString().padStart(2, '0')}_Schedules.xlsx`;

                toast.loading(`Checking for file: ${standardName}...`, { id: toastId });

                const { data: children, error: childrenError } = await supabase.functions.invoke('microsoft-graph', {
                    body: { action: 'list-children', folderId: msConfig.schedulesFolderId }
                });
                if (childrenError) throw childrenError;

                let fileId = children.value.find((f: any) => f.name === standardName)?.id;

                if (!fileId) {
                    toast.loading(`Creating new file: ${standardName}...`, { id: toastId });
                    try {
                        const XLSX = await import('xlsx');
                        const wb = XLSX.utils.book_new();
                        XLSX.utils.book_append_sheet(wb, [], "Sheet1");
                        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });

                        const { data: createdFile, error: uploadError } = await supabase.functions.invoke('microsoft-graph', {
                            body: {
                                action: 'upload-file',
                                folderId: msConfig.schedulesFolderId,
                                name: standardName,
                                values: wbout
                            }
                        });

                        if (uploadError) throw uploadError;
                        fileId = createdFile.id;

                        toast.loading(`File created. Waiting for propagation...`, { id: toastId });

                    } catch (createError: any) {
                        throw new Error(`Failed to create new schedule file: ${createError.message}`);
                    }
                }

                if (!fileId) throw new Error("Could not target schedule file");

                const sheetName = activeDate.replace(/\//g, '-');
                let worksheetId = null;

                toast.loading(`Preparing worksheet: ${sheetName}...`, { id: toastId });
                const { data: createData, error: createError } = await supabase.functions.invoke('microsoft-graph', {
                    body: { action: 'create-worksheet', fileId: fileId, name: sheetName }
                });

                if (createError) {
                    const { data: sheetsContent } = await supabase.functions.invoke('microsoft-graph', {
                        body: { action: 'list-worksheets', fileId: fileId }
                    });
                    const existingSheet = sheetsContent?.value?.find((s: any) => s.name === sheetName);
                    if (existingSheet) worksheetId = existingSheet.id;
                    else throw createError;
                } else {
                    worksheetId = createData.id;
                }

                if (!worksheetId) throw new Error("Could not target worksheet");

                const headers = [
                    "date", "shift", "branch", "start_time", "end_time",
                    "code", "instructor", "program", "minutes", "units",
                    "status", "substitute", "type", "subtype", "description",
                    "department", "feedback"
                ];

                const dataRows = computed.map(s => {
                    const inc = s as DailyIncidence;
                    return [
                        s.date, s.shift, s.branch, s.start_time, s.end_time,
                        s.code, s.instructor, s.program, s.minutes, s.units,
                        inc.status || '', inc.substitute || '', inc.type || '',
                        inc.subtype || '', inc.description || '', inc.department || '',
                        inc.feedback || ''
                    ];
                });

                const values = [headers, ...dataRows];

                // --- Smart Sync & Table Management ---
                try {
                    toast.loading(`Syncing data...`, { id: toastId });

                    const { data: tablesData } = await supabase.functions.invoke('microsoft-graph', {
                        body: { action: 'list-tables', fileId: fileId, sheetId: worksheetId }
                    });

                    const tables = tablesData?.value || [];
                    const table = tables[0];

                    if (!table) {
                        // 1. Create Table (New Day)
                        toast.loading(`Writing new table...`, { id: toastId });

                        const { data: updateData, error: writeError } = await supabase.functions.invoke('microsoft-graph', {
                            body: { action: 'update-range', fileId: fileId, sheetId: worksheetId, values: values, range: 'B2' }
                        });
                        if (writeError) throw writeError;

                        const fullAddress = updateData.address;
                        const rangeAddress = fullAddress.includes('!') ? fullAddress.split('!')[1] : fullAddress;

                        const { data: newTable } = await supabase.functions.invoke('microsoft-graph', {
                            body: { action: 'create-table', fileId: fileId, sheetId: worksheetId, range: rangeAddress }
                        });

                        // Apply Styling
                        toast.loading(`Applying styles...`, { id: toastId });
                        const { SCHEDULE_TABLE_CONFIG } = await import('../utils/excel-styles');

                        await supabase.functions.invoke('microsoft-graph', {
                            body: { action: 'update-table-style', fileId: fileId, tableId: newTable.id, style: SCHEDULE_TABLE_CONFIG.style }
                        });

                        await supabase.functions.invoke('microsoft-graph', {
                            body: { action: 'format-columns', fileId: fileId, sheetId: worksheetId, columns: SCHEDULE_TABLE_CONFIG.columns }
                        });

                    } else {
                        // 2. Upsert
                        toast.loading(`Smart Upserting rows...`, { id: toastId });
                        const { SCHEDULE_TABLE_CONFIG } = await import('../utils/excel-styles');

                        const { error: upsertError } = await supabase.functions.invoke('microsoft-graph', {
                            body: {
                                action: 'upsert-rows-by-key',
                                fileId: fileId,
                                tableId: table.id,
                                sheetId: worksheetId,
                                values: values,
                                keyColumns: ['date', 'program', 'start_time', 'instructor']
                            }
                        });
                        if (upsertError) throw upsertError;

                        await supabase.functions.invoke('microsoft-graph', {
                            body: { action: 'format-columns', fileId: fileId, sheetId: worksheetId, columns: SCHEDULE_TABLE_CONFIG.columns }
                        });
                    }

                } catch (tableError: any) {
                    console.error("Failed to manage Excel table/upsert", tableError);
                    toast.error(`Sync warning: ${tableError.message}`, { id: toastId });
                    return; // Stop success toast
                }

                toast.success(`Published schedule for ${activeDate}`, { id: toastId });
                // Start Cooldown (60 seconds)
                set({ publishCooldownUntil: Date.now() + 60000 });
            }
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

        // Si ya fue descartado, no mostrar
        if (dismissedVersions.includes(data.id)) return;

        const isNewId = currentVersionId !== data.id;
        // Si el ID es igual, verificar si la fecha de actualización es más reciente
        // Si currentVersionUpdatedAt es null (versión legacy), asumimos que hay update si hay fecha remota
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
        const { activeDate, baseSchedules } = get();

        if (!activeDate) return { success: false, error: 'No active date selected' };

        const [day, month, year] = activeDate.split('/').map(Number);
        const scheduleDate = new Date(year, month - 1, day);
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

        // Standard Upsert with updated_at timestamp
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

        // Auto-accept the version we just published to prevent self-notification
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

        set({
            baseSchedules: schedule.schedule_data,
            activeDate: schedule.schedule_date,
            latestPublished: null,
            currentVersionId: schedule.id,
            currentVersionUpdatedAt: schedule.updated_at
        });
        toast.success(`Schedule for ${schedule.schedule_date} downloaded`);
    },

    dismissUpdate: (id: string) => {
        const { dismissedVersions } = get();
        const updated = [...dismissedVersions, id];
        localStorage.setItem('dismissed_schedule_versions', JSON.stringify(updated));
        set({
            dismissedVersions: updated,
            latestPublished: null
        });
    },
}));
