import { create } from 'zustand';
import { Schedule, DailyIncidence } from '../types';

interface ScheduleDataState {
    baseSchedules: Schedule[];
    incidences: DailyIncidence[];

    setBaseSchedules: (schedules: Schedule[]) => void;
    setIncidences: (incidences: DailyIncidence[]) => void;

    // Local mutations for Incidences
    upsertIncidence: (incidence: DailyIncidence) => void;
    removeIncidence: (schedule: Schedule) => void;

    // Selector help
    getComputedSchedules: () => (Schedule | DailyIncidence)[];
}

export const useScheduleDataStore = create<ScheduleDataState>((set, get) => ({
    baseSchedules: [],
    incidences: [],

    setBaseSchedules: (schedules) => set({ baseSchedules: schedules }),
    setIncidences: (incidences) => set({ incidences }),

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
        // Optimization: Create map for O(1) lookup if list is large, 
        // but for <1000 items map loop is fine.
        return baseSchedules.map(sch => {
            const match = incidences.find(inc =>
                inc.date === sch.date &&
                inc.program === sch.program &&
                inc.start_time === sch.start_time &&
                inc.instructor === sch.instructor
            );
            return match || sch;
        });
    }
}));
