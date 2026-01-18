import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { ZoomMeetingCandidate, MatchResult } from '../services/matcher';
import { Schedule } from '@/features/schedules/utils/excel-parser';

interface ZoomUser {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    display_name: string;
}

interface ZoomState {
    // Datos
    meetings: ZoomMeetingCandidate[];
    users: ZoomUser[];
    matchResults: MatchResult[];

    // Estado UI
    isSyncing: boolean;
    syncProgress: number; // 0-100
    syncError: string | null;
    lastSyncedAt: string | null;

    // Estado de Carga de Datos
    isLoadingData: boolean;

    // Worker Instance
    worker: Worker | null,

    // Acciones
    fetchZoomData: () => Promise<void>;
    triggerSync: () => Promise<void>;
    runMatching: (schedules: Schedule[]) => Promise<void>;
    resolveConflict: (schedule: Schedule, selectedMeeting: ZoomMeetingCandidate) => void;

    // Método interno para inicializar el worker
    _initWorker: (meetings: ZoomMeetingCandidate[], users: ZoomUser[]) => void;
}

export const useZoomStore = create<ZoomState>((set, get) => ({
    meetings: [],
    users: [],
    matchResults: [],
    isSyncing: false,
    syncProgress: 0,
    syncError: null,
    lastSyncedAt: null,
    isLoadingData: false,
    worker: null,

    // Cache interno eliminado a favor del worker

    fetchZoomData: async () => {
        // Evitar múltiples llamadas simultáneas que puedan reiniciar el worker incorrectamente
        if (get().isLoadingData) {
            console.log('Fetch already in progress, skipping...');
            return;
        }

        set({ isLoadingData: true });
        try {
            const pageSize = 1000;

            const fetchAllPages = async <T>(
                table: 'zoom_meetings' | 'zoom_users',
                select: string
            ): Promise<T[]> => {
                let allData: T[] = [];
                let page = 0;
                let hasMore = true;

                while (hasMore) {
                    const { data, error } = await supabase
                        .from(table)
                        .select(select)
                        .range(page * pageSize, (page + 1) * pageSize - 1);

                    if (error) throw error;

                    if (data && data.length > 0) {
                        allData = [...allData, ...data as T[]];
                        if (data.length < pageSize) hasMore = false;
                        else page++;
                    } else {
                        hasMore = false;
                    }
                }
                return allData;
            };

            const [allMeetings, allUsers] = await Promise.all([
                fetchAllPages<ZoomMeetingCandidate>(
                    'zoom_meetings',
                    'meeting_id, topic, host_id, start_time, join_url'
                ),
                fetchAllPages<ZoomUser>(
                    'zoom_users',
                    'id, email, first_name, last_name, display_name'
                )
            ]);

            set({
                meetings: allMeetings,
                users: allUsers,
            });

            // Inicializar worker con los nuevos datos
            get()._initWorker(allMeetings, allUsers);

        } catch (error) {
            console.error("Error fetching Zoom data:", error);
        } finally {
            set({ isLoadingData: false });
        }
    },

    _initWorker: (meetings, users) => {
        const currentWorker = get().worker;
        if (currentWorker) {
            currentWorker.terminate();
        }

        // Crear nuevo worker
        const worker = new Worker(new URL('../workers/match.worker.ts', import.meta.url), {
            type: 'module'
        });

        worker.onmessage = (e) => {
            if (e.data.type === 'READY') {
                console.log('Matching Worker Ready');
            } else if (e.data.type === 'ERROR') {
                console.error('Matching Worker Error:', e.data.error);
            }
        };

        // Enviar datos de inicialización
        worker.postMessage({ type: 'INIT', meetings, users });
        set({ worker });
    },

    triggerSync: async () => {
        set({ isSyncing: true, syncError: null, syncProgress: 10 });
        try {
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();

            if (sessionError || !session) {
                console.warn("No active session during sync trigger. Attempting refresh...");
                const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
                if (refreshError || !refreshData.session) {
                    throw new Error("Authentication failed: No active session. Please log in again.");
                }
            }

            console.log("Session verified.");

            const { data, error } = await supabase.functions.invoke('zoom-sync', {
                method: 'POST',
            });

            if (error) {
                const errorMessage = error instanceof Error ? error.message : "Error invocando función";
                let context = "";
                if (typeof error === 'object' && error !== null && 'context' in error) {
                    // @ts-ignore
                    context = JSON.stringify(error.context);
                }
                throw new Error(errorMessage + (context ? ` ${context}` : ""));
            }

            if (!data || data.error) {
                throw new Error(data?.error || "La sincronización falló sin detalles.");
            }

            set({ syncProgress: 80 });

            await get().fetchZoomData();

            set({
                isSyncing: false,
                syncProgress: 100,
                lastSyncedAt: new Date().toISOString()
            });

        } catch (error: any) {
            console.error('Fallo en sincronización:', error);
            set({
                isSyncing: false,
                syncError: error.message || 'Unknown error during synchronization'
            });
            throw error;
        }
    },

    runMatching: async (schedules: Schedule[]) => {
        const { worker, meetings, users } = get();
        let activeWorker = worker;

        // Si no hay worker (ej: recarga live), intentar revivirlo
        if (!activeWorker) {
            console.warn("Worker not found, re-initializing...");
            get()._initWorker(meetings, users);
            activeWorker = get().worker;
            // Pequeña espera para asegurar que INIT se procese antes de MATCH (aunque postMessage garantiza orden)
        }

        if (!activeWorker) {
            console.error("Failed to initialize worker for matching");
            return;
        }

        return new Promise<void>((resolve, reject) => {
            // Configurar listener temporal para esta ejecución
            // Nota: En una app más compleja, usaríamos IDs de mensaje para correlacionar respuestas
            const handleMessage = (e: MessageEvent) => {
                if (e.data.type === 'MATCH_RESULT') {
                    set({ matchResults: e.data.results });
                    activeWorker?.removeEventListener('message', handleMessage);
                    resolve();
                } else if (e.data.type === 'ERROR') {
                    console.error("Worker matching error:", e.data.error);
                    activeWorker?.removeEventListener('message', handleMessage);
                    reject(new Error(e.data.error));
                }
            };

            activeWorker.addEventListener('message', handleMessage);
            activeWorker.postMessage({ type: 'MATCH', schedules });
        });
    },

    resolveConflict: (schedule: Schedule, selectedMeeting: ZoomMeetingCandidate) => {
        const results = get().matchResults.map(r => {
            if (r.schedule === schedule) {
                return {
                    ...r,
                    status: 'assigned' as const,
                    matchedCandidate: selectedMeeting,
                    bestMatch: selectedMeeting,
                    meeting_id: selectedMeeting.meeting_id,
                    reason: 'Manually Assigned',
                };
            }
            return r;
        });
        set({ matchResults: results });
    }
}));

