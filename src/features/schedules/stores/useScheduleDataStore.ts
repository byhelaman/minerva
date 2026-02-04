import { create } from 'zustand';
import { Schedule, DailyIncidence } from '../types';
import { scheduleEntriesService } from '../services/schedule-entries-service';
import { toast } from 'sonner';

interface ScheduleDataState {
    baseSchedules: Schedule[];
    // Incidences are now part of the fetched data, but we might want to keep them separated in memory if useful,
    // or just merge them? The UI usually expects a merged view or separation.
    // The new service returns { schedules, incidences }.
    // Let's keep them separated here to match previous structure, but source them from DB.
    incidences: DailyIncidence[];
    incidencesVersion: number; // Incremented on every incidence mutation

    isLoading: boolean;

    // Actions
    setBaseSchedules: (schedules: Schedule[]) => void;

    // DB Actions
    fetchSchedulesForDate: (date: string) => Promise<void>;
    updateIncidence: (incidence: DailyIncidence) => Promise<void>;
    deleteIncidence: (incidence: DailyIncidence) => Promise<void>;
    fetchIncidencesForDate: (date: string) => Promise<void>;
    deleteSchedule: (schedule: Schedule) => Promise<void>;

    // Computed (Keep for compatibility if needed, but logic changes)
    getComputedSchedules: () => (Schedule | DailyIncidence)[];
}

export const useScheduleDataStore = create<ScheduleDataState>((set, get) => ({
    baseSchedules: [],
    incidences: [],
    incidencesVersion: 0,
    isLoading: false,

    setBaseSchedules: (schedules) => set({ baseSchedules: schedules }),

    fetchSchedulesForDate: async (date: string) => {
        set({ isLoading: true });
        try {
            const { schedules, incidences } = await scheduleEntriesService.getSchedulesByDate(date);
            // If we are in "Published View", we overwrite baseSchedules.
            // But wait! The user might have local drafts.
            // Clarification: The prompt says "Lee de Supabase por fecha".
            // Implementation: When we select a date, if we want to see the PUBLISHED version, we load from DB.
            // If we are editing a DRAFT, we use local state.
            // "ScheduleDashboard (Cargar desde Supabase por fecha)".

            // Let's assume for now valid schedules from DB replace local state when explicitly fetching.
            set(state => ({
                baseSchedules: schedules,
                incidences,
                incidencesVersion: state.incidencesVersion + 1
            }));
        } catch (error) {
            console.error("Failed to fetch schedules", error);
            toast.error("Failed to load schedule data");
        } finally {
            set({ isLoading: false });
        }
    },

    fetchIncidencesForDate: async (date: string) => {
        // Non-destructive fetch: only updates incidences, keeps base schedules (e.g. drafts)
        set({ isLoading: true });
        try {
            const { incidences } = await scheduleEntriesService.getSchedulesByDate(date);
            set(state => ({
                incidences,
                incidencesVersion: state.incidencesVersion + 1
            }));
        } catch (error) {
            console.error("Failed to fetch incidences", error);
        } finally {
            set({ isLoading: false });
        }
    },

    deleteIncidence: async (incidence: DailyIncidence) => {
        const previousIncidences = get().incidences;

        // Optimistic update: Remove from local state
        set(state => ({
            incidences: state.incidences.filter(i =>
                !(i.date === incidence.date &&
                    i.program === incidence.program &&
                    i.start_time === incidence.start_time &&
                    i.instructor === incidence.instructor)
            ),
            incidencesVersion: state.incidencesVersion + 1
        }));

        try {
            // DB Update: Set fields to null
            const wasUpdated = await scheduleEntriesService.updateIncidence({
                date: incidence.date,
                program: incidence.program,
                start_time: incidence.start_time,
                instructor: incidence.instructor
            }, {
                status: null,
                type: null,
                subtype: null,
                substitute: null,
                description: null,
                department: null,
                feedback: null
            } as any);

            if (!wasUpdated) {
                // If row didn't exist in DB, it might be a local-only incidence?
                // But generally incidences must be attached to a schedule.
                // If it fails, maybe it wasn't published.
                throw new Error('SCHEDULE_NOT_PUBLISHED');
            }
            toast.success("Incidence removed");
        } catch (error) {
            console.error("Failed to delete incidence:", error);
            // Revert
            set(state => ({
                incidences: previousIncidences,
                incidencesVersion: state.incidencesVersion + 1
            }));

            if (error instanceof Error && error.message === 'SCHEDULE_NOT_PUBLISHED') {
                toast.error("Cannot remove incidence: Base schedule not published.");
            } else {
                toast.error("Failed to remove incidence");
            }
        }
    },



    deleteSchedule: async (schedule: Schedule) => {
        const previousSchedules = get().baseSchedules;
        const previousIncidences = get().incidences;

        // Optimistic Update: Remove from base schedules AND incidences
        set(state => ({
            baseSchedules: state.baseSchedules.filter(s =>
                !(s.date === schedule.date &&
                    s.program === schedule.program &&
                    s.start_time === schedule.start_time &&
                    s.instructor === schedule.instructor)
            ),
            incidences: state.incidences.filter(i =>
                !(i.date === schedule.date &&
                    i.program === schedule.program &&
                    i.start_time === schedule.start_time &&
                    i.instructor === schedule.instructor)
            ),
            incidencesVersion: state.incidencesVersion + 1
        }));

        try {
            await scheduleEntriesService.deleteScheduleEntry({
                date: schedule.date,
                program: schedule.program,
                start_time: schedule.start_time,
                instructor: schedule.instructor
            });
            toast.success("Schedule removed");
        } catch (error) {
            console.error("Failed to delete schedule:", error);
            // Revert
            set(state => ({
                baseSchedules: previousSchedules,
                incidences: previousIncidences,
                incidencesVersion: state.incidencesVersion + 1
            }));
            toast.error("Failed to delete schedule");
        }
    },

    updateIncidence: async (newIncidence: DailyIncidence) => {
        // Store previous state for potential rollback
        const previousIncidences = get().incidences;

        // Optimistic update
        set(state => {
            const filtered = state.incidences.filter(i =>
                !(i.date === newIncidence.date &&
                    i.program === newIncidence.program &&
                    i.start_time === newIncidence.start_time &&
                    i.instructor === newIncidence.instructor)
            );
            return {
                incidences: [...filtered, newIncidence],
                incidencesVersion: state.incidencesVersion + 1
            };
        });

        // DB Update
        try {
            const wasUpdated = await scheduleEntriesService.updateIncidence({
                date: newIncidence.date,
                program: newIncidence.program,
                start_time: newIncidence.start_time,
                instructor: newIncidence.instructor
            }, newIncidence);

            if (!wasUpdated) {
                // Revert optimistic update - schedule doesn't exist in DB
                set(state => ({
                    incidences: previousIncidences,
                    incidencesVersion: state.incidencesVersion + 1
                }));
                throw new Error('SCHEDULE_NOT_PUBLISHED');
            }
        } catch (error) {
            // Revert optimistic update on any error
            set(state => ({
                incidences: previousIncidences,
                incidencesVersion: state.incidencesVersion + 1
            }));
            throw error;
        }
    },

    getComputedSchedules: () => {
        const { baseSchedules, incidences } = get();

        // Optimization: Build lookup map first O(M)
        const incidenceMap = new Map<string, DailyIncidence>();
        for (const inc of incidences) {
            const key = `${inc.date}|${inc.program}|${inc.start_time}|${inc.instructor}`;
            incidenceMap.set(key, inc);
        }

        // Merge incidence status on top of base schedule O(N)
        return baseSchedules.map(sch => {
            const key = `${sch.date}|${sch.program}|${sch.start_time}|${sch.instructor}`;
            const match = incidenceMap.get(key);

            // If match exists, it essentially IS the schedule with extra props.
            if (match) {
                return { ...sch, ...match };
            }
            return sch;
        });
    }
}));
