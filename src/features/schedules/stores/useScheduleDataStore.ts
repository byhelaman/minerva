import { create } from 'zustand';
import { Schedule, DailyIncidence } from '../types';
import { scheduleEntriesService } from '../services/schedule-entries-service';
import { toast } from 'sonner';
import { getSchedulePrimaryKey } from '../utils/string-utils';

interface ScheduleDataState {
    baseSchedules: Schedule[];
    // Las incidencias son parte de los datos obtenidos de BD.
    // Se mantienen separadas en memoria para coincidir con la estructura previa.
    incidences: DailyIncidence[];
    incidencesVersion: number; // Se incrementa en cada mutación de incidencia

    isLoading: boolean;

    // Acciones
    setBaseSchedules: (schedules: Schedule[]) => void;
    setLoadedData: (schedules: Schedule[], incidences: DailyIncidence[]) => void;

    // Acciones de BD
    fetchSchedulesForDate: (date: string) => Promise<void>;
    fetchSchedulesForRange: (startDate: string, endDate: string) => Promise<void>;
    updateIncidence: (incidence: DailyIncidence) => Promise<void>;
    deleteIncidence: (incidence: DailyIncidence) => Promise<void>;
    fetchIncidencesForDate: (date: string) => Promise<void>;
    deleteSchedule: (schedule: Schedule) => Promise<void>;

    // Computed (mantener por compatibilidad)
    getComputedSchedules: () => (Schedule | DailyIncidence)[];
}

export const useScheduleDataStore = create<ScheduleDataState>((set, get) => ({
    baseSchedules: [],
    incidences: [],
    incidencesVersion: 0,
    isLoading: false,

    setBaseSchedules: (schedules) => set({ baseSchedules: schedules }),

    setLoadedData: (schedules, incidences) => set(state => ({
        baseSchedules: schedules,
        incidences,
        incidencesVersion: state.incidencesVersion + 1
    })),

    fetchSchedulesForDate: async (date: string) => {
        set({ isLoading: true });
        try {
            const { schedules, incidences } = await scheduleEntriesService.getSchedulesByDate(date);
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

    fetchSchedulesForRange: async (startDate: string, endDate: string) => {
        set({ isLoading: true });
        try {
            const { schedules, incidences } = await scheduleEntriesService.getSchedulesByDateRange(startDate, endDate);
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
        // Fetch no destructivo: solo actualiza incidencias, preserva base schedules (ej: drafts)
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
        const previousBaseSchedules = get().baseSchedules;

        const incidenceKey = getSchedulePrimaryKey(incidence);

        // Update optimista: remover de incidencias y limpiar status en baseSchedules
        set(state => ({
            incidences: state.incidences.filter(i => getSchedulePrimaryKey(i) !== incidenceKey),
            baseSchedules: state.baseSchedules.map(sch => {
                if (getSchedulePrimaryKey(sch) === incidenceKey) {
                    return { ...sch, status: null };
                }
                return sch;
            })
        }));

        const clearPayload: Partial<DailyIncidence> = {
            status: null,
            type: null,
            subtype: null,
            substitute: null,
            description: null,
            department: null,
            feedback: null
        };

        try {
            const success = await scheduleEntriesService.updateIncidence({
                date: incidence.date,
                program: incidence.program,
                start_time: incidence.start_time,
                instructor: incidence.instructor || 'none'
            }, clearPayload);
            
            if (!success) {
                throw new Error('SCHEDULE_NOT_PUBLISHED');
            }
            
            // Confirmar bump de versión si exitoso (para triggear refetch en ReportsPage)
            set(state => ({ incidencesVersion: state.incidencesVersion + 1 }));
            toast.success("Incidence removed");
        } catch (error) {
            console.error("Failed to delete incidence:", error);
            // Revertir
            set(state => ({
                incidences: previousIncidences,
                baseSchedules: previousBaseSchedules,
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

        const scheduleKey = getSchedulePrimaryKey(schedule);

        // Update optimista: remover de base schedules Y de incidencias
        set(state => ({
            baseSchedules: state.baseSchedules.filter(s => getSchedulePrimaryKey(s) !== scheduleKey),
            incidences: state.incidences.filter(i => getSchedulePrimaryKey(i) !== scheduleKey),
            incidencesVersion: state.incidencesVersion + 1
        }));

        try {
            await scheduleEntriesService.deleteScheduleEntry({
                date: schedule.date,
                program: schedule.program,
                start_time: schedule.start_time,
                instructor: schedule.instructor || 'none'
            });
            toast.success("Schedule removed");
        } catch (error) {
            console.error("Failed to delete schedule:", error);
            // Revertir
            set(state => ({
                baseSchedules: previousSchedules,
                incidences: previousIncidences,
                incidencesVersion: state.incidencesVersion + 1
            }));
            toast.error("Failed to delete schedule");
        }
    },

    updateIncidence: async (newIncidence: DailyIncidence) => {
        // Guardar estado previo para posible rollback
        const previousIncidences = get().incidences;
        const previousBaseSchedules = get().baseSchedules;

        const incidenceKey = getSchedulePrimaryKey(newIncidence);

        // Update optimista: actualizar incidencias y solo el status en baseSchedules
        // (no contaminar baseSchedules con campos de incidencia que se guardan en el draft)
        set(state => {
            const filtered = state.incidences.filter(i => getSchedulePrimaryKey(i) !== incidenceKey);

            const newBaseSchedules = state.baseSchedules.map(sch => {
                if (getSchedulePrimaryKey(sch) === incidenceKey) {
                    return { ...sch, status: newIncidence.status };
                }
                return sch;
            });

            return { 
                incidences: [...filtered, newIncidence],
                baseSchedules: newBaseSchedules
            };
        });

        const changes = {
            status: newIncidence.status,
            type: newIncidence.type,
            subtype: newIncidence.subtype,
            substitute: newIncidence.substitute,
            description: newIncidence.description,
            department: newIncidence.department,
            feedback: newIncidence.feedback
        };

        try {
            const success = await scheduleEntriesService.updateIncidence({
                date: newIncidence.date,
                program: newIncidence.program,
                start_time: newIncidence.start_time,
                instructor: newIncidence.instructor || 'none'
            }, changes);

            if (!success) {
                throw new Error("SCHEDULE_NOT_PUBLISHED"); // Manejado abajo
            }

            // Confirmar bump de versión si exitoso
            set(state => ({ incidencesVersion: state.incidencesVersion + 1 }));

        } catch (error) {
            console.error("Failed to update incidence via service", error);
            // Revertir update optimista
            set(() => ({
                incidences: previousIncidences,
                baseSchedules: previousBaseSchedules,
            }));

            if (error instanceof Error && error.message === 'SCHEDULE_NOT_PUBLISHED') {
                toast.error("Schedule not in database. Publish it first to track incidence data.");
            } else {
                toast.error("Failed to save incidence.");
            }
        }
    },

    getComputedSchedules: () => {
        const { baseSchedules, incidences } = get();

        // Optimización: construir mapa de lookup primero O(M)
        const incidenceMap = new Map<string, DailyIncidence>();
        for (const inc of incidences) {
            const key = getSchedulePrimaryKey(inc);
            incidenceMap.set(key, inc);
        }

        // Merge O(N)
        return baseSchedules.map(sch => {
            const key = getSchedulePrimaryKey(sch);
            const match = incidenceMap.get(key);

            // Limpiar propiedades de incidencia que podrían estar cacheadas incorrectamente en baseSchedules
            const cleanSch = {
                ...sch,
                status: undefined,
                type: undefined,
                subtype: undefined,
                substitute: undefined,
                description: undefined,
                department: undefined,
                feedback: undefined
            };

            // Si hay match, es el schedule con sus props extra de incidencia.
            if (match) {
                return { ...cleanSch, ...match };
            }
            return cleanSch;
        });
    }
}));
