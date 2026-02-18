import { supabase } from "@/lib/supabase";
import { Schedule, DailyIncidence } from "../types";
import { ensureTimeFormat } from "../utils/time-utils";

/** Trim + collapse internal whitespace for consistent key comparison */
function normalizeField(val: string | undefined | null): string {
    return (val || '').trim().replace(/\s+/g, ' ');
}

/**
 * Service to handle CRUD operations for schedule entries in Supabase.
 * Replaces the JSONB storage model.
 */

// Helper to map DB row to Schedule type
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

// Helper to map DB row to DailyIncidence type (if type exists)
const mapEntryToIncidence = (row: any): DailyIncidence | null => {
    // We rely on 'type' being present to consider it an active incidence
    if (!row.type) return null;
    return {
        // Base Schedule fields (required since DailyIncidence extends Schedule)
        date: row.date,
        program: row.program,
        start_time: row.start_time,
        instructor: row.instructor,
        shift: row.shift,
        branch: row.branch,
        end_time: row.end_time,
        code: row.code,
        minutes: row.minutes,
        units: row.units,

        // Incidence-specific fields
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
     * Fetch all schedules for a specific date.
     * Returns both the base schedules and any recorded incidences.
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
     * Fetch all schedules for a date range.
     * Returns both the base schedules and any recorded incidences.
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

        // RPC returns a JSON array directly (as a single object/array) due to json_agg check
        // Supabase .rpc() with json return type usually returns the data directly.
        // We cast to any[] just to be safe.
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
     * Batch upsert schedules (Publish flow).
     * Updates existing rows or inserts new ones.
     * Incidence fields are excluded so existing incidence data is preserved on re-publish.
     */
    async publishSchedules(schedules: Schedule[], publishedBy: string) {
        if (schedules.length === 0) return;

        const uniqueKeys = new Set<string>();
        const rows: any[] = [];

        for (const s of schedules) {
            // Normalize composite key fields to prevent whitespace/format duplicates
            const program = (s.program || '').trim();
            const instructor = (s.instructor || '').trim();
            const start_time = ensureTimeFormat(s.start_time);

            // Deduplicate within the batch
            const key = `${s.date}|${program}|${start_time}|${instructor}`;

            if (!uniqueKeys.has(key)) {
                uniqueKeys.add(key);
                rows.push({
                    date: s.date,
                    program,
                    start_time,
                    instructor,

                    shift: s.shift,
                    branch: s.branch,
                    end_time: ensureTimeFormat(s.end_time),
                    code: s.code,
                    minutes: s.minutes,
                    units: s.units,

                    // NOTE: Incidence fields intentionally EXCLUDED from publish upsert.
                    // PostgREST upsert only updates columns present in the request body,
                    // so existing incidence data is preserved on re-publish.

                    published_by: publishedBy,
                    synced_at: null
                });
            }
        }

        const { error } = await supabase
            .from('schedule_entries')
            .upsert(rows, {
                onConflict: 'date,program,start_time,instructor',
                ignoreDuplicates: false
            });

        if (error) throw error;
    },

    /**
     * Batch upsert schedules from Import/Pull flows.
     * Normalizes all key fields (trim + time format) to prevent duplicates.
     *
     * IMPORTANT: PostgREST batch upsert uses the UNION of all columns across
     * all rows. If even ONE row has an incidence field, ALL rows get that column
     * with NULL for missing values — wiping existing incidence data on conflict.
     * To prevent this, rows are split into two separate upserts:
     *   1. Base-only rows (no incidence columns) → preserves existing incidences
     *   2. Incidence rows (ALL incidence columns, uniform shape) → updates incidences
     */
    async importSchedules(schedules: Schedule[], publishedBy: string): Promise<{ upsertedCount: number; duplicatesSkipped: number }> {
        if (schedules.length === 0) return { upsertedCount: 0, duplicatesSkipped: 0 };

        const uniqueKeys = new Set<string>();
        const baseOnlyRows: any[] = [];
        const incidenceRows: any[] = [];
        let duplicatesSkipped = 0;

        for (const s of schedules) {
            // Normalize ALL composite key fields consistently
            const program = normalizeField(s.program);
            const instructor = normalizeField(s.instructor);
            const start_time = ensureTimeFormat(s.start_time);

            // Deduplicate within this import batch
            const key = `${s.date}|${program}|${start_time}|${instructor}`;

            if (uniqueKeys.has(key)) {
                duplicatesSkipped++;
                continue;
            }
            uniqueKeys.add(key);

            const baseRow: any = {
                // Composite key fields (normalized)
                date: s.date,
                program,
                start_time,
                instructor,

                // Base schedule fields
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
                // Include ALL incidence fields to ensure uniform column shape
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
            onConflict: 'date,program,start_time,instructor',
            ignoreDuplicates: false
        };

        // Two separate upserts to avoid mixed-column contamination
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
     * Update a specific entry's incidence data (IncidenceModal).
     * Returns true if the update was successful (row existed), false otherwise.
     */
    async updateIncidence(key: { date: string, program: string, start_time: string, instructor: string }, changes: Partial<DailyIncidence>): Promise<boolean> {
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
            .match(key)
            .select();

        if (error) throw error;

        return (data?.length ?? 0) > 0;
    },

    /**
     * For Sync: Get entries that need to be synced to Excel
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
     * Find dates that look like they need syncing.
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
     * Fetch all entries that have incidence data.
     * Used for the consolidated incidences Excel export.
     */
    async getAllIncidences(startDate?: string, endDate?: string): Promise<DailyIncidence[]> {
        let query = supabase
            .from('schedule_entries')
            .select('*')
            .not('type', 'is', null)
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
     * Mark a date as synced
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
     * Delete a specific schedule entry.
     */
    async deleteScheduleEntry(entry: { date: string, program: string, start_time: string, instructor: string }) {
        const { date, program, start_time, instructor } = entry;
        const { error } = await supabase
            .from('schedule_entries')
            .delete()
            .match({ date, program, start_time, instructor });

        if (error) throw error;
    },

    /**
     * Insert a single schedule entry.
     * Used for manually adding entries from Reports page.
     */
    /**
     * Fetch composite keys for existing entries on given dates.
     * Lightweight: only selects key columns for overlap comparison.
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
            const key = `${row.date}|${normalizeField(row.program)}|${ensureTimeFormat(row.start_time)}|${normalizeField(row.instructor)}`;
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

                // Incidence fields
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
