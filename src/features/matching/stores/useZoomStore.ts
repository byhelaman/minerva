import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { ZoomMeetingCandidate, ZoomUserCandidate, MatchResult } from '../types';
import type { Schedule } from '@/features/schedules/types';
import { logger } from '@/lib/logger';

interface ZoomState {
    // Datos
    meetings: ZoomMeetingCandidate[];
    users: ZoomUserCandidate[];
    matchResults: MatchResult[];
    activeMeetingIds: string[];

    // Estado UI
    isSyncing: boolean;
    syncProgress: number; // 0-100
    syncError: string | null;
    lastSyncedAt: string | null;

    // Estado de Carga de Datos
    isLoadingData: boolean;
    isInitialized: boolean;

    // Estado de Ejecución de Asignaciones
    isExecuting: boolean;

    // Instancia del Worker
    worker: Worker | null,

    // Acciones
    fetchZoomData: (options?: { force?: boolean; silent?: boolean }) => Promise<void>;
    fetchActiveMeetings: () => Promise<void>;
    triggerSync: () => Promise<void>;
    runMatching: (schedules: Schedule[]) => Promise<void>;
    resolveConflict: (schedule: Schedule, selectedMeeting: ZoomMeetingCandidate) => void;
    createMeetings: (items: (string | { topic: string; startTime?: string; selectedDate?: string; schedule_for?: string })[], options?: { dailyOnly?: boolean }) => Promise<{ succeeded: number; failed: number; errors: string[] }>;
    updateMatchings: (updates: { meeting_id: string; topic?: string; schedule_for?: string }[]) => Promise<{ succeeded: number; failed: number; errors: string[] }>;
    executeAssignments: (schedules?: Schedule[]) => Promise<{ succeeded: number; failed: number; errors: string[] }>;

    _genericBatchAction: (schedules?: Schedule[]) => Promise<{ succeeded: number; failed: number; errors: string[] }>;

    // Promesa de fetch activa para deduplicación
    _activeFetchPromise: Promise<void> | null;

    // Método interno para inicializar el worker
    _initWorker: (meetings: ZoomMeetingCandidate[], users: ZoomUserCandidate[]) => void;
}

export const useZoomStore = create<ZoomState>((set, get) => ({
    meetings: [],
    users: [],
    matchResults: [],
    activeMeetingIds: [],
    isSyncing: false,
    syncProgress: 0,
    syncError: null,
    lastSyncedAt: null,
    isLoadingData: false,
    isInitialized: false,
    isExecuting: false,
    worker: null,
    _activeFetchPromise: null,

    // Cache interno eliminado a favor del worker

    fetchZoomData: async (options = {}) => {
        const { force = false, silent = false } = options;
        const activePromise = get()._activeFetchPromise;

        // Si hay un fetch activo:
        if (activePromise) {
            // Si no se fuerza, reutilizar la promesa existente (deduplicación)
            if (!force) {
                return activePromise;
            }
            // Si se fuerza, esperar a que termine la activa y luego lanzar una nueva
            // Esto es crucial para operaciones de escritura que necesitan datos frescos
            // y no pueden confiar en un fetch iniciado ANTES de la escritura.
            await activePromise;
        }

        const fetchPromise = (async () => {
            if (!silent) {
                set({ isLoadingData: true });
            }
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
                        'meeting_id, topic, host_id, start_time, join_url, created_at'
                    ),
                    fetchAllPages<ZoomUserCandidate>(
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
                set({ isLoadingData: false, _activeFetchPromise: null, isInitialized: true });
            }
        })();

        set({ _activeFetchPromise: fetchPromise });
        return fetchPromise;
    },

    fetchActiveMeetings: async () => {
        try {
            const { data, error } = await supabase.rpc('get_active_meetings');
            if (error) {
                console.error("Error fetching active meetings:", error);
                return;
            }
            const meetingIds = (data as { meeting_id: string }[] | null)?.map(r => r.meeting_id) ?? [];
            set({ activeMeetingIds: meetingIds });
        } catch (error) {
            console.error("Error fetching active meetings:", error);
        }
    },

    _initWorker: (meetings: ZoomMeetingCandidate[], users: ZoomUserCandidate[]) => {
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
                    context = JSON.stringify((error as { context: unknown }).context);
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

    executeAssignments: async (schedules?: Schedule[]) => {
        // Delegando a la acción por lotes genérica
        return get()._genericBatchAction(schedules);
    },

    // Ayudante para acciones por lotes (interno) - refactorización para reutilizar lógica
    _genericBatchAction: async (schedules?: Schedule[]) => {
        const { matchResults } = get();

        // Filtrar: 'to_update', 'manual' (ambiguedad resuelta), o 'assigned' (re-actualización)
        // Se requiere meeting_id e instructor
        // Si se proporcionan schedules, filtrar solo esos
        let toUpdate = matchResults.filter(r =>
            (r.status === 'to_update' || r.status === 'manual' || r.status === 'assigned') &&
            r.meeting_id &&
            r.found_instructor
        );

        if (schedules && schedules.length > 0) {
            toUpdate = toUpdate.filter(r => schedules.some(s =>
                s.date === r.schedule.date &&
                s.start_time === r.schedule.start_time &&
                s.program === r.schedule.program &&
                s.instructor === r.schedule.instructor
            ));
        }

        if (toUpdate.length === 0) {
            return { succeeded: 0, failed: 0, errors: ['No assignments to execute'] };
        }

        set({ isExecuting: true });

        try {
            // Construir solicitudes para lote
            const allRequests = toUpdate.map(result => {
                const schedule = result.schedule;
                const instructor = result.found_instructor!;
                const duration = calculateDuration(schedule.start_time, schedule.end_time);
                const startTimeISO = toISODateTime(schedule.date, schedule.start_time);
                const recurrence = buildRecurrence(schedule.date);

                return {
                    meeting_id: result.meeting_id!,
                    schedule_for: instructor.email,
                    start_time: startTimeISO,
                    duration,
                    timezone: 'America/Lima',
                    recurrence,
                    action: 'update' as const // Acción explícita
                };
            });

            // Reutilizando lógica de procesamiento por trozos
            const result = await processBatchChunks(allRequests);

            // Actualizar matchResults con los resultados
            const updatedResults = matchResults.map(r => {
                if (!['to_update', 'manual', 'assigned'].includes(r.status) || !r.meeting_id) return r;
                const res = result.results.find(res => res.meeting_id === r.meeting_id);
                if (res?.success) {
                    return { ...r, status: 'assigned' as const, reason: 'Updated' };
                }
                return r;
            });

            set({ matchResults: updatedResults });

            // Refrescar datos inmediatamente (el backend ya sincronizó con DB)
            if (result.succeeded > 0) {
                await get().fetchZoomData({ force: true });
            }

            set({ isExecuting: false });
            return { succeeded: result.succeeded, failed: result.failed, errors: result.errors };

        } catch (err) {
            set({ isExecuting: false });
            const message = err instanceof Error ? err.message : 'Unknown error';
            return { succeeded: 0, failed: toUpdate.length, errors: [message] };
        }
    },

    createMeetings: async (items: (string | { topic: string; startTime?: string; selectedDate?: string; schedule_for?: string })[], options?: { dailyOnly?: boolean }) => {
        set({ isExecuting: true });
        try {
            const dailyOnly = options?.dailyOnly ?? false;

            // Normalizar ítems a objetos
            const meetingConfigs = items.map(item =>
                typeof item === 'string' ? { topic: item, startTime: undefined, selectedDate: undefined, schedule_for: undefined } : item
            );

            // Construir solicitudes
            let requests;

            if (dailyOnly) {
                // Tipo 2 (Programado) - Reunión única para hoy
                const today = new Date();
                const todayDateStr = today.toISOString().split('T')[0]; // YYYY-MM-DD

                requests = meetingConfigs.map(config => {
                    const dateStr = config.selectedDate || todayDateStr;
                    let startTimeStr;

                    if (config.startTime) {
                        // Usar hora específica ingresada
                        startTimeStr = `${dateStr}T${config.startTime}:00`;
                    } else {
                        // Por defecto 9AM
                        startTimeStr = `${dateStr}T09:00:00`;
                    }

                    return {
                        action: 'create' as const,
                        topic: config.topic,
                        type: 2, // Scheduled (single occurrence)
                        start_time: startTimeStr,
                        duration: 45, // Requested default
                        timezone: 'America/Lima',
                        schedule_for: config.schedule_for, // Optional: email of host
                        settings: {
                            join_before_host: true,
                            waiting_room: true
                        }
                    };
                });
            } else {
                // Default payload reference:
                // Type 8 (Recurring fixed time), Weekly, Lun-Jue, +120 days
                // Start time: Tomorrow 9AM (arbitrary start for recurring container)
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                tomorrow.setHours(9, 0, 0, 0);
                const startTimeStr = tomorrow.toISOString().split('.')[0]; // Remove millis

                // End date +120 days
                const endDate = new Date(tomorrow);
                endDate.setDate(endDate.getDate() + 120);
                const endDateTime = endDate.toISOString().replace('.000', ''); // Z format roughly

                requests = meetingConfigs.map(config => ({
                    action: 'create' as const,
                    topic: config.topic,
                    type: 8,
                    start_time: startTimeStr,
                    duration: 60,
                    timezone: 'America/Lima',
                    schedule_for: config.schedule_for,
                    recurrence: {
                        type: 2, // Weekly
                        repeat_interval: 1,
                        weekly_days: "2,3,4,5", // Mon-Thu
                        end_date_time: endDateTime
                    },
                    settings: {
                        join_before_host: true,
                        waiting_room: true
                    }
                }));
            }

            const result = await processBatchChunks(requests);

            // Refresh data should be handled by caller
            // await get().fetchZoomData({ force: true });

            set({ isExecuting: false });
            return { succeeded: result.succeeded, failed: result.failed, errors: result.errors };
        } catch (err) {
            set({ isExecuting: false });
            return { succeeded: 0, failed: items.length, errors: [err instanceof Error ? err.message : 'Unknown error'] };
        }
    },

    updateMatchings: async (updates) => {
        set({ isExecuting: true });
        try {
            // Actualizaciones básicas (ej: renombrar tema o confirmar)
            // Por ahora, asumiendo actualización de tema o simplemente "tocarlo".
            // Build recurrence for updates (same as create)
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(9, 0, 0, 0);
            const startTimeStr = tomorrow.toISOString().split('.')[0];

            const endDate = new Date(tomorrow);
            endDate.setDate(endDate.getDate() + 120);
            const endDateTime = endDate.toISOString().replace('.000', '');

            const recurrence = {
                type: 2, // Weekly
                repeat_interval: 1,
                weekly_days: "2,3,4,5", // Mon-Thu
                end_date_time: endDateTime
            };

            const requests = updates.map(u => ({
                action: 'update' as const,
                meeting_id: u.meeting_id,
                schedule_for: u.schedule_for, // Requerido por backend
                topic: u.topic,
                // Agregamos el resto de campos para asegurar actualización completa en Zoom
                type: 8,
                start_time: startTimeStr,
                duration: 60,
                timezone: 'America/Lima',
                recurrence: recurrence,
                settings: {
                    join_before_host: true,
                    waiting_room: true
                }
            }));

            const result = await processBatchChunks(requests);



            // Refresh data should be handled by caller
            // await get().fetchZoomData({ force: true });

            set({ isExecuting: false });
            return { succeeded: result.succeeded, failed: result.failed, errors: result.errors };
        } catch (err) {
            set({ isExecuting: false });
            return { succeeded: 0, failed: updates.length, errors: [err instanceof Error ? err.message : 'Unknown error'] };
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
        if (!dateStr || !timeStr) {
            console.warn("toISODateTime: Missing date or time", { dateStr, timeStr });
            return '';
        }

        let year: number, month: number, day: number;

        // Primary format: YYYY-MM-DD (ISO 8601)
        // Legacy fallback: DD/MM/YYYY for backwards compatibility
        if (dateStr.includes('/')) {
            const parts = dateStr.split('/');
            if (parts[0].length === 4) {
                // YYYY/MM/DD
                [year, month, day] = parts.map(Number);
            } else {
                // DD/MM/YYYY (legacy format)
                [day, month, year] = parts.map(Number);
            }
        } else if (dateStr.includes('-')) {
            // YYYY-MM-DD
            [year, month, day] = dateStr.split('-').map(Number);
        } else {
            // Fallback: Intentar parsear con Date nativo (ej: "Mon Jan 19 2026...")
            const d = new Date(dateStr);
            if (!isNaN(d.getTime())) {
                year = d.getFullYear();
                month = d.getMonth() + 1;
                day = d.getDate();
            } else {
                console.error("toISODateTime: Unsupported format", { dateStr });
                return '';
            }
        }

        if (isNaN(year) || isNaN(month) || isNaN(day)) {
            console.error("toISODateTime: Parsed NaN values", { dateStr, year, month, day });
            return '';
        }

        const [hours, minutes] = timeStr.split(':').map(Number);
        if (isNaN(hours) || isNaN(minutes)) {
            console.error("toISODateTime: Invalid time", { timeStr });
            return '';
        }

        // Construir string ISO directamente sin conversión UTC
        // Formato: yyyy-MM-ddTHH:mm:ss (Zoom usa timezone por separado)
        const pad = (n: number) => n.toString().padStart(2, '0');
        return `${year}-${pad(month)}-${pad(day)}T${pad(hours)}:${pad(minutes)}:00`;
    } catch (e) {
        console.error("toISODateTime check error:", e);
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
            return 2; // Por defecto Lunes
        }

        const date = new Date(year, month - 1, day);
        const jsDay = date.getDay(); // 0=Dom, 1=Lun...6=Sab
        return jsDay === 0 ? 1 : jsDay + 1; // 1=Dom, 2=Lun...7=Sab
    } catch {
        return 2;
    }
}

// Helper para procesar batch chunks común
async function processBatchChunks(allRequests: any[]): Promise<{ succeeded: number; failed: number; errors: string[]; results: any[] }> {
    const CHUNK_SIZE = 30;
    const DELAY_BETWEEN_CHUNKS_MS = 3500;
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    let totalSucceeded = 0;
    let totalFailed = 0;
    const allErrors: string[] = [];
    const allResults: Array<{ meeting_id: string; success: boolean; error?: string }> = [];

    const chunks = [];
    for (let i = 0; i < allRequests.length; i += CHUNK_SIZE) {
        chunks.push(allRequests.slice(i, i + CHUNK_SIZE));
    }

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

            const chunkErrors = response.results
                .filter(r => !r.success && r.error)
                .map(r => `${r.meeting_id}: ${r.error}`);
            allErrors.push(...chunkErrors);
        }

        if (i < chunks.length - 1) {
            await delay(DELAY_BETWEEN_CHUNKS_MS);
        }
    }

    return { succeeded: totalSucceeded, failed: totalFailed, errors: allErrors, results: allResults };
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

