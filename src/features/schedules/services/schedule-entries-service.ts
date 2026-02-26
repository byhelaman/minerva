import { supabase } from "@/lib/supabase";
import { Schedule, DailyIncidence } from "../types";
import { ensureTimeFormat } from "../utils/time-utils";
import { normalizeString, emptyToNull, getSchedulePrimaryKey } from "../utils/string-utils";

/**
 * Servicio para operaciones CRUD de entradas de horario en Supabase.
 */

/** Shape of a row returned by the schedule_entries table / RPC. */
interface ScheduleEntryRow {
    date: string;
    program: string;
    start_time: string;
    instructor: string;
    shift: string;
    branch: string;
    end_time: string;
    code: string;
    minutes: string;
    units: string;
    status?: string | null;
    substitute?: string | null;
    type?: string | null;
    subtype?: string | null;
    description?: string | null;
    department?: string | null;
    feedback?: string | null;
    published_by?: string | null;
    synced_at?: string | null;
    updated_at?: string | null;
}

// Helper para mapear fila de BD a tipo Schedule
const mapEntryToSchedule = (row: ScheduleEntryRow): Schedule => ({
    date: row.date,
    program: row.program,
    start_time: ensureTimeFormat(row.start_time),
    instructor: row.instructor,
    shift: row.shift,
    branch: row.branch,
    end_time: ensureTimeFormat(row.end_time),
    code: row.code,
    minutes: row.minutes,
    units: row.units,
});

// Helper para mapear fila de BD a DailyIncidence (si tiene type o status)
const mapEntryToIncidence = (row: ScheduleEntryRow): DailyIncidence | null => {
    // Considerar como incidencia si tiene 'type' (incidencia completa)
    // O si tiene 'status' (marcado via switch/Live mode)
    if (!row.type && !row.status) return null;
    return {
        // Campos base del Schedule (requeridos ya que DailyIncidence extiende Schedule)
        date: row.date,
        program: row.program,
        start_time: ensureTimeFormat(row.start_time),
        instructor: row.instructor,
        shift: row.shift,
        branch: row.branch,
        end_time: ensureTimeFormat(row.end_time),
        code: row.code,
        minutes: row.minutes,
        units: row.units,

        // Campos específicos de incidencia
        status: row.status,
        substitute: row.substitute || undefined,
        type: row.type || undefined,
        subtype: row.subtype || undefined,
        description: row.description || undefined,
        department: row.department || undefined,
        feedback: row.feedback || undefined
    };
};

export const scheduleEntriesService = {

    /**
     * Obtener todos los horarios de una fecha específica.
     * Retorna tanto los schedules base como las incidencias registradas.
     */
    async getSchedulesByDate(date: string) {
        const { data, error } = await supabase
            .from('schedule_entries')
            .select('*')
            .eq('date', date);

        if (error) throw error;

        const schedules: Schedule[] = [];
        const incidences: DailyIncidence[] = [];

        (data as ScheduleEntryRow[] | null)?.forEach(row => {
            schedules.push(mapEntryToSchedule(row));
            const incidence = mapEntryToIncidence(row);
            if (incidence) {
                incidences.push(incidence);
            }
        });

        return { schedules, incidences };
    },

    /**
     * Obtener todos los horarios de un rango de fechas.
     * Retorna tanto los schedules base como las incidencias registradas.
     */
    async getSchedulesByDateRange(startDate: string, endDate: string) {
        const { data, error } = await supabase
            .rpc('get_schedules_report', {
                p_start_date: startDate,
                p_end_date: endDate
            });

        if (error) throw error;

        const schedules: Schedule[] = [];
        const incidences: DailyIncidence[] = [];

        const rows: ScheduleEntryRow[] = Array.isArray(data) ? data : [];

        rows.forEach((row) => {
            schedules.push(mapEntryToSchedule(row));
            const incidence = mapEntryToIncidence(row);
            if (incidence) {
                incidences.push(incidence);
            }
        });

        return { schedules, incidences };
    },

    /**
     * Upsert masivo de schedules (flujo de Publicar).
     * Actualiza filas existentes o inserta nuevas.
     * Los campos de incidencia se excluyen para preservar datos existentes al re-publicar.
     */
    async publishSchedules(schedules: Schedule[], publishedBy: string) {
        if (schedules.length === 0) return;

        const uniqueKeys = new Set<string>();
        const rows: Omit<ScheduleEntryRow, 'updated_at'>[] = [];

        for (const s of schedules) {
            // Deduplicar dentro del lote
            const key = getSchedulePrimaryKey(s);

            if (!uniqueKeys.has(key)) {
                uniqueKeys.add(key);
                rows.push({
                    date: s.date,
                    program: normalizeString(s.program),
                    start_time: ensureTimeFormat(s.start_time),
                    instructor: normalizeString(s.instructor),

                    shift: s.shift,
                    branch: s.branch,
                    end_time: ensureTimeFormat(s.end_time),
                    code: s.code,
                    minutes: s.minutes,
                    units: s.units,

                    // NOTA: Campos de incidencia excluidos intencionalmente del publish upsert.
                    // PostgREST solo actualiza columnas presentes en el body del request,
                    // así que los datos de incidencia existentes se preservan al re-publicar.

                    published_by: publishedBy,
                    synced_at: null
                });
            }
        }

        const { error } = await supabase
            .from('schedule_entries')
            .upsert(rows, {
                onConflict: 'date,start_time,instructor,program',
                ignoreDuplicates: false
            });

        if (error) throw error;
    },

    /**
     * Upsert masivo de schedules desde flujos de Importar/Pull.
     * Normaliza todos los campos clave (trim + formato de hora) para prevenir duplicados.
     *
     * IMPORTANTE: El upsert masivo de PostgREST usa la UNIÓN de todas las columnas
     * de todas las filas. Si UNA fila tiene un campo de incidencia, TODAS las filas
     * reciben esa columna con NULL — borrando datos de incidencia existentes en conflicto.
     * Para evitarlo, las filas se dividen en dos upserts separados:
     *   1. Filas base (sin columnas de incidencia) → preserva incidencias existentes
     *   2. Filas de incidencia (TODAS las columnas, forma uniforme) → actualiza incidencias
     */
    async importSchedules(schedules: Schedule[], publishedBy: string): Promise<{ upsertedCount: number; duplicatesSkipped: number }> {
        if (schedules.length === 0) return { upsertedCount: 0, duplicatesSkipped: 0 };

        const uniqueKeys = new Set<string>();
        const baseOnlyRows: Omit<ScheduleEntryRow, 'updated_at'>[] = [];
        const incidenceRows: Omit<ScheduleEntryRow, 'updated_at'>[] = [];
        let duplicatesSkipped = 0;

        for (const s of schedules) {
            // Deduplicar dentro de este lote de importación
            const key = getSchedulePrimaryKey(s);

            if (uniqueKeys.has(key)) {
                duplicatesSkipped++;
                continue;
            }
            uniqueKeys.add(key);

            const baseRow: Omit<ScheduleEntryRow, 'updated_at'> = {
                // Campos clave compuesta (normalizados)
                date: s.date,
                program: normalizeString(s.program),
                start_time: ensureTimeFormat(s.start_time),
                instructor: normalizeString(s.instructor),

                // Campos base del schedule
                shift: s.shift,
                branch: s.branch,
                end_time: ensureTimeFormat(s.end_time),
                code: s.code,
                minutes: s.minutes,
                units: s.units,

                published_by: publishedBy,
                synced_at: null
            };

            const hasIncidence = s.substitute || s.type || s.subtype
                || s.description || s.department || s.feedback;

            if (hasIncidence) {
                // Incluir TODOS los campos de incidencia para asegurar forma de columnas uniforme
                incidenceRows.push({
                    ...baseRow,
                    status: emptyToNull(s.status),
                    substitute: emptyToNull(s.substitute),
                    type: emptyToNull(s.type),
                    subtype: emptyToNull(s.subtype),
                    description: emptyToNull(s.description),
                    department: emptyToNull(s.department),
                    feedback: emptyToNull(s.feedback),
                });
            } else {
                baseOnlyRows.push(baseRow);
            }
        }

        const upsertOpts = {
            onConflict: 'date,start_time,instructor,program',
            ignoreDuplicates: false
        };

        // Dos upserts separados para evitar contaminación de columnas mixtas
        if (baseOnlyRows.length > 0) {
            const { error } = await supabase
                .from('schedule_entries')
                .upsert(baseOnlyRows, upsertOpts);
            if (error) throw error;
        }

        if (incidenceRows.length > 0) {
            const { error } = await supabase
                .from('schedule_entries')
                .upsert(incidenceRows, upsertOpts);
            if (error) throw error;
        }

        return { upsertedCount: baseOnlyRows.length + incidenceRows.length, duplicatesSkipped };
    },

    /**
     * Actualizar datos de incidencia de una entrada específica (IncidenceModal).
     * Retorna true si la actualización fue exitosa (la fila existía), false si no.
     */
    async updateIncidence(key: { date: string, program: string, start_time: string, instructor: string }, changes: Partial<DailyIncidence>): Promise<boolean> {
        const normalizedKey = {
            date: key.date,
            program: normalizeString(key.program),
            start_time: ensureTimeFormat(key.start_time),
            instructor: normalizeString(key.instructor) || 'none'
        };

        const { data, error } = await supabase
            .from('schedule_entries')
            .update({
                status: emptyToNull(changes.status),
                substitute: emptyToNull(changes.substitute),
                type: emptyToNull(changes.type),
                subtype: emptyToNull(changes.subtype),
                description: emptyToNull(changes.description),
                department: emptyToNull(changes.department),
                feedback: emptyToNull(changes.feedback),
            })
            .match(normalizedKey)
            .select();

        if (error) throw error;

        return (data?.length ?? 0) > 0;
    },

    /**
     * Para Sync: Obtener entradas que necesitan sincronizarse a Excel
     */
    async getEntriesPendingSync(date: string) {
        const { data, error } = await supabase
            .from('schedule_entries')
            .select('*')
            .eq('date', date)
            .or('synced_at.is.null,updated_at.gt.synced_at');

        if (error) throw error;
        return data;
    },

    /**
     * Buscar fechas que parecen necesitar sincronización.
     */
    async getPendingSyncDates(): Promise<string[]> {
        const { data, error } = await supabase
            .from('schedule_entries')
            .select('date')
            .is('synced_at', null)
            .limit(100);

        if (error) return [];
        return Array.from(new Set(data.map(d => d.date)));
    },

    /**
     * Obtener todas las entradas que tienen datos de incidencia.
     * Usado para la exportación consolidada de incidencias a Excel.
     */
    async getAllIncidences(startDate?: string, endDate?: string): Promise<DailyIncidence[]> {
        let query = supabase
            .from('schedule_entries')
            .select('*')
            .not('type', 'is', null)
            .neq('type', '')
            .order('date', { ascending: true })
            .order('start_time', { ascending: true });

        if (startDate && endDate) {
            query = query.gte('date', startDate).lte('date', endDate);
        } else if (startDate) {
            query = query.eq('date', startDate);
        }

        const { data, error } = await query;

        if (error) throw error;

        return ((data || []) as ScheduleEntryRow[]).map(row => mapEntryToIncidence(row)).filter((inc): inc is DailyIncidence => inc !== null);
    },

    /**
     * Marcar una fecha como sincronizada
     */
    async markDateAsSynced(date: string) {
        const now = new Date().toISOString();
        const { error } = await supabase
            .from('schedule_entries')
            .update({ synced_at: now })
            .eq('date', date);

        if (error) throw error;
    },

    /**
     * Eliminar múltiples entradas de horario en una sola llamada RPC.
     * Mucho más rápido que eliminaciones individuales secuenciales.
     */
    async batchDeleteScheduleEntries(entries: { date: string, program: string, start_time: string, instructor: string }[]): Promise<number> {
        if (entries.length === 0) return 0;

        const keys = entries.map(e => ({
            date: e.date,
            program: e.program,
            start_time: ensureTimeFormat(e.start_time),
            instructor: e.instructor,
        }));

        const { data, error } = await supabase.rpc('batch_delete_schedule_entries', {
            p_keys: keys,
        });

        if (error) throw error;
        return data as number;
    },

    /**
     * Eliminar una entrada de horario específica.
     */
    async deleteScheduleEntry(entry: { date: string, program: string, start_time: string, instructor: string }) {
        const normalizedKey = {
            date: entry.date,
            program: normalizeString(entry.program),
            start_time: ensureTimeFormat(entry.start_time),
            instructor: normalizeString(entry.instructor)
        };

        const { error } = await supabase
            .from('schedule_entries')
            .delete()
            .match(normalizedKey);

        if (error) throw error;
    },

    /**
     * Obtener claves compuestas de entradas existentes en las fechas dadas.
     * Ligero: solo selecciona columnas clave para comparación de superposición.
     * Usa la RPC get_existing_keys_by_dates para evitar el límite de URLs largas de PostgREST.
     */
    async getExistingKeys(dates: string[]): Promise<Set<string>> {
        if (dates.length === 0) return new Set();

        const keys = new Set<string>();
        
        const { data, error } = await supabase.rpc('get_existing_keys_by_dates', {
            p_dates: dates
        });

        if (error) throw error;
        if (!data) return keys;

        (data as ScheduleEntryRow[]).forEach(row => {
            keys.add(getSchedulePrimaryKey(row));
        });

        return keys;
    },

    /**
     * Obtener filas completas normalizadas de entradas existentes en las fechas dadas.
     * Retorna Map<compositeKey, normalizedFields> para comparación campo por campo.
     * Usa la RPC get_schedules_by_dates_v2 para evitar el límite de URLs largas de PostgREST.
     */
    async getFullSchedulesByDates(dates: string[]): Promise<Map<string, Record<string, string>>> {
        if (dates.length === 0) return new Map();

        const map = new Map<string, Record<string, string>>();

        const { data, error } = await supabase.rpc('get_schedules_by_dates_v2', {
            p_dates: dates
        });

        if (error) throw error;
        if (!data) return map;

        (data as ScheduleEntryRow[]).forEach(row => {
            const key = getSchedulePrimaryKey(row);
            map.set(key, {
                shift: normalizeString(row.shift),
                branch: normalizeString(row.branch),
                end_time: ensureTimeFormat(row.end_time),
                code: normalizeString(row.code),
                minutes: normalizeString(row.minutes) || '0',
                units: normalizeString(row.units) || '0',
                status: normalizeString(row.status),
                substitute: normalizeString(row.substitute),
                type: normalizeString(row.type),
                subtype: normalizeString(row.subtype),
                description: normalizeString(row.description),
                department: normalizeString(row.department),
                feedback: normalizeString(row.feedback),
            });
        });

        return map;
    },

    async addScheduleEntry(schedule: Schedule, publishedBy: string) {
        const { error } = await supabase
            .from('schedule_entries')
            .insert({
                date: schedule.date,
                program: normalizeString(schedule.program),
                start_time: ensureTimeFormat(schedule.start_time),
                instructor: normalizeString(schedule.instructor) || 'none',
                shift: schedule.shift,
                branch: schedule.branch,
                end_time: ensureTimeFormat(schedule.end_time),
                code: schedule.code,
                minutes: schedule.minutes,
                units: schedule.units,
                published_by: publishedBy,

                // Campos de incidencia
                status: emptyToNull(schedule.status),
                type: emptyToNull(schedule.type),
                subtype: emptyToNull(schedule.subtype),
                substitute: emptyToNull(schedule.substitute),
                description: emptyToNull(schedule.description),
                department: emptyToNull(schedule.department),
                feedback: emptyToNull(schedule.feedback),
            });

        if (error) throw error;
    }
};
