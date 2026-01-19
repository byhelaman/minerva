import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { ZoomMeetingCandidate, MatchResult } from '../services/matcher';
import { Schedule } from '@/features/schedules/utils/excel-parser';
import { logger } from '@/lib/logger';

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

    // Estado de Ejecución de Asignaciones
    isExecuting: boolean;

    // Worker Instance
    worker: Worker | null,

    // Acciones
    fetchZoomData: () => Promise<void>;
    triggerSync: () => Promise<void>;
    runMatching: (schedules: Schedule[]) => Promise<void>;
    resolveConflict: (schedule: Schedule, selectedMeeting: ZoomMeetingCandidate) => void;
    executeAssignments: (meetingIds?: string[]) => Promise<{ succeeded: number; failed: number; errors: string[] }>;

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
    isExecuting: false,
    worker: null,

    // Cache interno eliminado a favor del worker

    fetchZoomData: async () => {
        // Evitar múltiples llamadas simultáneas que puedan reiniciar el worker incorrectamente
        if (get().isLoadingData) {
            logger.debug('Fetch already in progress, skipping...');
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
                logger.debug('Matching Worker Ready');
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

            logger.debug("Session verified.");

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
    },

    executeAssignments: async (meetingIds?: string[]) => {
        const { matchResults } = get();

        // Filtrar: 'to_update', 'manual' (ambiguedad resuelta), o 'assigned' (re-actualización)
        // Se requiere meeting_id e instructor
        // Si se proporcionan meetingIds, filtrar solo esos
        let toUpdate = matchResults.filter(r =>
            (r.status === 'to_update' || r.status === 'manual' || r.status === 'assigned') &&
            r.meeting_id &&
            r.found_instructor
        );

        if (meetingIds && meetingIds.length > 0) {
            toUpdate = toUpdate.filter(r => meetingIds.includes(r.meeting_id!));
        }

        if (toUpdate.length === 0) {
            return { succeeded: 0, failed: 0, errors: ['No assignments to execute'] };
        }

        set({ isExecuting: true });

        try {
            // Construir requests para batch
            const allRequests = toUpdate.map(result => {
                const schedule = result.schedule;
                const instructor = result.found_instructor!;

                // Calcular duración
                const duration = calculateDuration(schedule.start_time, schedule.end_time);

                // Construir start_time ISO
                const startTimeISO = toISODateTime(schedule.date, schedule.start_time);

                // Construir recurrence
                const recurrence = buildRecurrence(schedule.date);

                return {
                    meeting_id: result.meeting_id!,
                    schedule_for: instructor.email,
                    start_time: startTimeISO,
                    duration,
                    timezone: 'America/Lima',
                    recurrence
                };
            });

            // Procesar en chunks de 30 secuencialmente
            // Zoom Heavy APIs tienen límite de 10 req/s, la Edge Function procesa en paralelo internamente
            const CHUNK_SIZE = 30;
            const DELAY_BETWEEN_CHUNKS_MS = 3500; // 3.5 segundos entre chunks (30 items / 10 req/s = 3s + margen)

            const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

            let totalSucceeded = 0;
            let totalFailed = 0;
            const allErrors: string[] = [];
            const allResults: Array<{ meeting_id: string; success: boolean; error?: string }> = [];

            // Dividir en chunks
            const chunks: typeof allRequests[] = [];
            for (let i = 0; i < allRequests.length; i += CHUNK_SIZE) {
                chunks.push(allRequests.slice(i, i + CHUNK_SIZE));
            }

            // Procesar chunks secuencialmente con delay entre cada uno
            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                const chunkNum = i + 1;

                const { data, error } = await supabase.functions.invoke('zoom-api', {
                    body: { batch: true, requests: chunk }
                });

                if (error) {
                    totalFailed += chunk.length;
                    allErrors.push(`Chunk ${chunkNum}: ${error.message}`);
                } else {
                    const response = data as {
                        batch: boolean;
                        total: number;
                        succeeded: number;
                        failed: number;
                        results: Array<{ meeting_id: string; success: boolean; error?: string }>;
                    };

                    totalSucceeded += response.succeeded;
                    totalFailed += response.failed;
                    allResults.push(...response.results);

                    // Agregar errores individuales
                    const chunkErrors = response.results
                        .filter(r => !r.success && r.error)
                        .map(r => `${r.meeting_id}: ${r.error}`);
                    allErrors.push(...chunkErrors);
                }

                // Delay entre chunks para respetar rate limit de Zoom (30 items / 10 req/s = 3s + margen)
                if (i < chunks.length - 1) {
                    await delay(DELAY_BETWEEN_CHUNKS_MS);
                }
            }

            // Actualizar matchResults con los resultados
            const updatedResults = matchResults.map(r => {
                // Solo procesar los status que fueron enviados para actualización
                if (!['to_update', 'manual', 'assigned'].includes(r.status) || !r.meeting_id) return r;

                const result = allResults.find(res => res.meeting_id === r.meeting_id);
                if (result?.success) {
                    return { ...r, status: 'assigned' as const, reason: 'Updated' };
                }
                return r;
            });

            set({ matchResults: updatedResults, isExecuting: false });

            return {
                succeeded: totalSucceeded,
                failed: totalFailed,
                errors: allErrors
            };
        } catch (err) {
            set({ isExecuting: false });
            const message = err instanceof Error ? err.message : 'Unknown error';
            return { succeeded: 0, failed: toUpdate.length, errors: [message] };
        }
    }
}));

// ========== Utilidades ==========

/** Calcular duración en minutos entre start_time y end_time */
function calculateDuration(startTime: string, endTime: string): number {
    try {
        const [startH, startM] = startTime.split(':').map(Number);
        const [endH, endM] = endTime.split(':').map(Number);

        const startMinutes = startH * 60 + startM;
        const endMinutes = endH * 60 + endM;

        const diff = endMinutes - startMinutes;
        return diff > 0 ? diff : 60; // Default 60 si falla
    } catch {
        return 60;
    }
}

/** Convertir fecha y hora a ISO 8601 (hora local sin conversión UTC) */
function toISODateTime(dateStr: string, timeStr: string): string {
    try {
        // Intentar formatos: DD/MM/YYYY, YYYY-MM-DD
        let year: number, month: number, day: number;

        if (dateStr.includes('/')) {
            const parts = dateStr.split('/');
            if (parts[0].length === 4) {
                // YYYY/MM/DD
                [year, month, day] = parts.map(Number);
            } else {
                // DD/MM/YYYY (formato Perú)
                [day, month, year] = parts.map(Number);
            }
        } else if (dateStr.includes('-')) {
            [year, month, day] = dateStr.split('-').map(Number);
        } else {
            return '';
        }

        const [hours, minutes] = timeStr.split(':').map(Number);

        // Construir string ISO directamente sin conversión UTC
        // Formato: yyyy-MM-ddTHH:mm:ss (Zoom usa timezone por separado)
        const pad = (n: number) => n.toString().padStart(2, '0');
        return `${year}-${pad(month)}-${pad(day)}T${pad(hours)}:${pad(minutes)}:00`;
    } catch {
        return '';
    }
}

/** Obtener día de semana en formato Zoom (1=Sun, 2=Mon...7=Sat) */
function getZoomWeekday(dateStr: string): number {
    try {
        let year: number, month: number, day: number;

        if (dateStr.includes('/')) {
            const parts = dateStr.split('/');
            if (parts[0].length === 4) {
                [year, month, day] = parts.map(Number);
            } else {
                [day, month, year] = parts.map(Number);
            }
        } else if (dateStr.includes('-')) {
            [year, month, day] = dateStr.split('-').map(Number);
        } else {
            return 2; // Default Monday
        }

        const date = new Date(year, month - 1, day);
        const jsDay = date.getDay(); // 0=Sun, 1=Mon...6=Sat
        return jsDay === 0 ? 1 : jsDay + 1; // 1=Sun, 2=Mon...7=Sat
    } catch {
        return 2;
    }
}

/** Construir objeto recurrence para Zoom API */
function buildRecurrence(dateStr: string): {
    type: number;
    repeat_interval: number;
    weekly_days: string;
    end_date_time: string;
} {
    // Base: Lun-Jue (2,3,4,5)
    const baseDays = new Set([2, 3, 4, 5]);

    // Agregar el día del schedule
    const scheduleDay = getZoomWeekday(dateStr);
    baseDays.add(scheduleDay);

    const weeklyDays = [...baseDays].sort((a, b) => a - b).join(',');

    // end_date: 120 días desde hoy
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 120);
    const endDateTime = endDate.toISOString();

    return {
        type: 2, // Weekly
        repeat_interval: 1,
        weekly_days: weeklyDays,
        end_date_time: endDateTime
    };
}

