import { create } from 'zustand';

interface ScheduleUIState {
    activeDate: string | null;
    viewMode: 'daily' | 'weekly'; // Preparing for future features

    setActiveDate: (date: string | null) => void;
    setViewMode: (mode: 'daily' | 'weekly') => void;
}

export const useScheduleUIStore = create<ScheduleUIState>((set) => ({
    activeDate: null,
    viewMode: 'daily',

    setActiveDate: (date) => set({ activeDate: date }),
    setViewMode: (mode) => set({ viewMode: mode })
}));
