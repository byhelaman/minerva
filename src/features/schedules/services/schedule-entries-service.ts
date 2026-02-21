import { supabase } from "@/lib/supabase";
import { Schedule, DailyIncidence } from "../types";
import { ensureTimeFormat } from "../utils/time-utils";
import { normalizeString, getSchedulePrimaryKey } from "../utils/string-utils";

/**
 * Servicio para operaciones CRUD de entradas de horario en Supabase.
 */

// Helper para mapear fila de BD a tipo Schedule
const mapEntryToSchedule = (row: any): Schedule => ({
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
    status: row.status || undefined
});

// Helper para mapear fila de BD a DailyIncidence (si tiene type o status)
const mapEntryToIncidence = (row: any): DailyIncidence | null => {
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

        data?.forEach(row => {
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

        // El RPC retorna un array JSON directamente por el json_agg.
        // Supabase .rpc() con retorno JSON usualmente entrega la data directamente.
        // Casteo a any[] por seguridad.
        const rows = Array.isArray(data) ? data : (data as any) || [];

        rows.forEach((row: any) => {
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
        const rows: any[] = [];

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
        const baseOnlyRows: any[] = [];
        const incidenceRows: any[] = [];
        let duplicatesSkipped = 0;

        for (const s of schedules) {
            // Deduplicar dentro de este lote de importación
            const key = getSchedulePrimaryKey(s);

            if (uniqueKeys.has(key)) {
                duplicatesSkipped++;
                continue;
            }
            uniqueKeys.add(key);

            const baseRow: any = {
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
                    status: s.status || null,
                    substitute: s.substitute || null,
                    type: s.type || null,
                    subtype: s.subtype || null,
                    description: s.description || null,
                    department: s.department || null,
                    feedback: s.feedback || null,
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
                status: changes.status,
                substitute: changes.substitute,
                type: changes.type,
                subtype: changes.subtype,
                description: changes.description,
                department: changes.department,
                feedback: changes.feedback,
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

        return (data || []).map(row => ({
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
            status: row.status || undefined,
            substitute: row.substitute || undefined,
            type: row.type || undefined,
            subtype: row.subtype || undefined,
            description: row.description || undefined,
            department: row.department || undefined,
            feedback: row.feedback || undefined,
        }));
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
     */
    async getExistingKeys(dates: string[]): Promise<Set<string>> {
        if (dates.length === 0) return new Set();

        const { data, error } = await supabase
            .from('schedule_entries')
            .select('date, program, start_time, instructor')
            .in('date', dates);

        if (error) throw error;

        const keys = new Set<string>();
        data?.forEach(row => {
            const key = getSchedulePrimaryKey(row);
            keys.add(key);
        });
        return keys;
    },

    async addScheduleEntry(schedule: Schedule, publishedBy: string) {
        const { error } = await supabase
            .from('schedule_entries')
            .insert({
                date: schedule.date,
                program: (schedule.program || '').trim(),
                start_time: ensureTimeFormat(schedule.start_time),
                instructor: (schedule.instructor || '').trim(),
                shift: schedule.shift,
                branch: schedule.branch,
                end_time: ensureTimeFormat(schedule.end_time),
                code: schedule.code,
                minutes: schedule.minutes,
                units: schedule.units,
                published_by: publishedBy,

                // Campos de incidencia
                status: schedule.status || null,
                type: schedule.type || null,
                subtype: schedule.subtype || null,
                substitute: schedule.substitute || null,
                description: schedule.description || null,
                department: schedule.department || null,
            });

        if (error) throw error;
    }
};
