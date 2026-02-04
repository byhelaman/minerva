import { supabase } from "@/lib/supabase";
import { scheduleEntriesService } from "./schedule-entries-service";

/**
 * Handles synchronization between Supabase (schedule_entries) and Excel (Microsoft Graph)
 * via Edge Functions.
 */
export const scheduleSyncService = {

    /**
     * Pushes the current state of schedule_entries for a given date
     * into the corresponding Excel Worksheet.
     * Uses 'replace-table-data' action on the Edge Function.
     */
    async syncToExcel(date: string, fileId: string) {
        // 1. Fetch latest data from DB
        const { schedules, incidences } = await scheduleEntriesService.getSchedulesByDate(date);

        if (schedules.length === 0) {
            throw new Error("No schedules found to sync");
        }

        // 2. Prepare payload for Excel
        // We need to merge base schedule with incidence status for the Excel view
        // The excel usually expects specific columns.
        // We match the format expected by 'microsoft-publisher' logic, but this time
        // we source it effectively from the DB status.

        // Create lookup map for O(1) access
        const incidenceMap = new Map<string, typeof incidences[0]>();
        for (const inc of incidences) {
            // const key = `${inc.program}|${inc.start_time}|${inc.instructor}`;
            const key = `${inc.date}|${inc.program}|${inc.start_time}|${inc.instructor}`;
            incidenceMap.set(key, inc);
        }

        const excelRows = schedules.map(sch => {
            // Find incidence for this row (O(1))
            // const key = `${sch.program}|${sch.start_time}|${sch.instructor}`;
            const key = `${sch.date}|${sch.program}|${sch.start_time}|${sch.instructor}`;
            const inc = incidenceMap.get(key);

            // Construct row object matching Excel table headers (implied)
            // Based on previous logic in microsoft-publisher.ts (which we will consult/replace)
            return [
                sch.date,
                sch.program,
                sch.start_time,
                sch.instructor,
                sch.shift,
                sch.branch,
                sch.end_time,
                sch.code,
                sch.minutes,
                sch.units,
                // Append Incidence Columns if they exist in Excel (Status, Substitute, etc.)
                // Assuming Excel has these columns extended
                inc?.status || '',
                inc?.substitute || '',
                inc?.type || '',
                inc?.subtype || '',
                inc?.description || '',
                inc?.department || '',
                inc?.feedback || ''
            ];
        });

        // 3. Call Edge Function (microsoft-publisher endpoint)
        // We reuse the 'microsoft_publisher' function but with a specific action
        const { data, error } = await supabase.functions.invoke('microsoft-publisher', {
            body: {
                action: 'sync-day',
                fileId: fileId,
                date: date,
                rows: excelRows
            }
        });

        if (error) throw error;

        // 4. Mark as synced in DB
        await scheduleEntriesService.markDateAsSynced(date);

        return data;
    }
};
