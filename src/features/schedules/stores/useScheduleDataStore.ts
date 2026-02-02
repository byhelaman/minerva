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

    isLoading: boolean;

    // Actions
    setBaseSchedules: (schedules: Schedule[]) => void;

    // DB Actions
    fetchSchedulesForDate: (date: string) => Promise<void>;
    updateIncidence: (incidence: DailyIncidence) => Promise<void>;

    // Computed (Keep for compatibility if needed, but logic changes)
    getComputedSchedules: () => (Schedule | DailyIncidence)[];
}

export const useScheduleDataStore = create<ScheduleDataState>((set, get) => ({
    baseSchedules: [],
    incidences: [],
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
            set({ baseSchedules: schedules, incidences });
        } catch (error) {
            console.error("Failed to fetch schedules", error);
            toast.error("Failed to load schedule data");
        } finally {
            set({ isLoading: false });
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
            return { incidences: [...filtered, newIncidence] };
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
                set({ incidences: previousIncidences });
                throw new Error('SCHEDULE_NOT_PUBLISHED');
            }
        } catch (error) {
            // Revert optimistic update on any error
            set({ incidences: previousIncidences });
            throw error;
        }
    },

    getComputedSchedules: () => {
        const { baseSchedules, incidences } = get();
        // Merge incidence status on top of base schedule
        return baseSchedules.map(sch => {
            const match = incidences.find(inc =>
                inc.date === sch.date &&
                inc.program === sch.program &&
                inc.start_time === sch.start_time &&
                inc.instructor === sch.instructor
            );
            // If match exists, it essentially IS the schedule with extra props.
            // We just return it as it satisfies Schedule + extra fields (DailyIncidence interface extends fields typically)
            if (match) {
                // Return merged object to ensure all base props + incidence props
                return { ...sch, ...match };
            }
            return sch;
        });
    }
}));
