import { supabase } from '@/lib/supabase';
// import { extractYearMonth } from '@/lib/utils';
import { DailyIncidence, Schedule, SchedulesConfig } from '../types';
import { scheduleEntriesService } from './schedule-entries-service';

/** Converts column-name-keyed char widths to Excel-letter-keyed pixel widths (table starts at col B) */
function toExcelColumnWidths(
    config: Record<string, number>,
    headers: string[]
): Record<string, number> {
    const CHAR_WIDTH_PX = 7;
    const result: Record<string, number> = {};
    headers.forEach((name, i) => {
        if (config[name] !== undefined) {
            // Table starts at column B (char code 66), so index 0 -> B, 1 -> C, etc.
            result[String.fromCharCode(66 + i)] = Math.round(config[name] * CHAR_WIDTH_PX);
        }
    });
    return result;
}

/** Ensures time is in HH:MM string format */
function ensureTimeFormat(time: any): string {
    if (!time && time !== 0) return '';

    // If already string in HH:MM format, return as-is
    if (typeof time === 'string') {
        const trimmed = time.trim();
        if (/^\d{1,2}:\d{2}/.test(trimmed)) {
            // Pad hour if needed (8:00 -> 08:00)
            const parts = trimmed.split(':');
            return `${parts[0].padStart(2, '0')}:${parts[1].substring(0, 2)}`;
        }
        // Try to parse if it's a decimal string
        const num = parseFloat(trimmed);
        if (!isNaN(num)) {
            time = num;
        } else {
            return trimmed; // Return original if can't parse
        }
    }

    // If it's a number (decimal fraction of day), convert to HH:MM
    if (typeof time === 'number') {
        const totalMinutes = Math.round(time * 24 * 60);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }

    return String(time);
}

/**
 * Publishes daily changes to Excel via Microsoft Graph.
 * @param config Microsoft connection configuration
 * @param activeDate The date being published (YYYY-MM-DD)
 * @param computedSchedules The final schedule data to write
 * @param onStatusUpdate Optional callback for status messages
 */
export async function publishScheduleToExcel(
    _config: SchedulesConfig,
    _activeDate: string,
    _computedSchedules: (Schedule | DailyIncidence)[],
    _onStatusUpdate?: (msg: string) => void
): Promise<void> {

    /* ONLY INCIDENCES LOG IS ACTIVE
    const notify = (msg: string) => {
        if (onStatusUpdate) onStatusUpdate(msg);
    };

    if (!config.isConnected) {
        throw new Error('Microsoft account not connected');
    }

    // ... (rest of the code commented out)
    
     // 2. Publish Daily Schedule File
    if (config.schedulesFolderId && activeDate) {
        const { year, month } = extractYearMonth(activeDate);

        const standardName = `${year}_${month.toString().padStart(2, '0')}_Schedules.xlsx`;

        notify(`Checking for file: ${standardName}...`);

        const { data: children, error: childrenError } = await supabase.functions.invoke('microsoft-graph', {
            body: { action: 'list-children', folderId: config.schedulesFolderId }
        });
        if (childrenError) throw childrenError;

        let fileId = children.value.find((f: any) => f.name === standardName)?.id;

        if (!fileId) {
            notify(`Creating new file: ${standardName}...`);
            try {
                // Dynamic import to keep bundle size low
                const XLSX = await import('xlsx');
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, [], "Sheet1");
                const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });

                const { data: createdFile, error: uploadError } = await supabase.functions.invoke('microsoft-graph', {
                    body: {
                        action: 'upload-file',
                        folderId: config.schedulesFolderId,
                        name: standardName,
                        values: wbout
                    }
                });

                if (uploadError) throw uploadError;
                fileId = createdFile.id;

                notify(`File created. Waiting for propagation...`);

            } catch (createError: any) {
                throw new Error(`Failed to create new schedule file: ${createError.message}`);
            }
        }

        if (!fileId) throw new Error("Could not target schedule file");

        const sheetName = activeDate.replace(/\//g, '-');
        let worksheetId = null;

        notify(`Preparing worksheet: ${sheetName}...`);
        const { data: createData, error: createError } = await supabase.functions.invoke('microsoft-graph', {
            body: { action: 'create-worksheet', fileId: fileId, name: sheetName }
        });

        if (createError) {
            const { data: sheetsContent } = await supabase.functions.invoke('microsoft-graph', {
                body: { action: 'list-worksheets', fileId: fileId }
            });
            const existingSheet = sheetsContent?.value?.find((s: any) => s.name === sheetName);
            if (existingSheet) worksheetId = existingSheet.id;
            else throw createError;
        } else {
            worksheetId = createData.id;
        }

        if (!worksheetId) throw new Error("Could not target worksheet");

        const headers = [
            "date", "shift", "branch", "start_time", "end_time",
            "code", "instructor", "program", "minutes", "units",
            "status", "substitute", "type", "subtype", "description",
            "department", "feedback"
        ];

        const dataRows = computedSchedules.map(s => {
            const inc = s as DailyIncidence; // Cast for access
            return [
                s.date, s.shift, s.branch, s.start_time, s.end_time,
                s.code, s.instructor, s.program, s.minutes, s.units,
                inc.status || '', inc.substitute || '', inc.type || '',
                inc.subtype || '', inc.description || '', inc.department || '',
                inc.feedback || ''
            ];
        });

        const values = [headers, ...dataRows];

        // --- Smart Sync & Table Management ---
        try {
            notify(`Syncing data tables...`);

            const { data: tablesData } = await supabase.functions.invoke('microsoft-graph', {
                body: { action: 'list-tables', fileId: fileId, sheetId: worksheetId }
            });

            const tables = tablesData?.value || [];
            const table = tables[0];

            if (!table) {
                // 1. Create Table (New Day)
                notify(`Writing new table...`);

                const { data: updateData, error: writeError } = await supabase.functions.invoke('microsoft-graph', {
                    body: { action: 'update-range', fileId: fileId, sheetId: worksheetId, values: values, range: 'B2' }
                });
                if (writeError) throw writeError;

                const fullAddress = updateData.address;
                const rangeAddress = fullAddress.includes('!') ? fullAddress.split('!')[1] : fullAddress;

                const { data: newTable } = await supabase.functions.invoke('microsoft-graph', {
                    body: { action: 'create-table', fileId: fileId, sheetId: worksheetId, range: rangeAddress }
                });

                // Apply Styling
                // notify(`Applying styles...`);
                // Note: We need to ensure excel-styles is imported or moved.
                // Assuming it is accessible relative to this file or we will refactor imports.
                const { SCHEDULE_TABLE_CONFIG } = await import('../utils/excel-styles');

                await supabase.functions.invoke('microsoft-graph', {
                    body: { action: 'update-table-style', fileId: fileId, tableId: newTable.id, style: SCHEDULE_TABLE_CONFIG.style }
                });

                const columnWidths = toExcelColumnWidths(SCHEDULE_TABLE_CONFIG.columns, headers);
                await supabase.functions.invoke('microsoft-graph', {
                    body: { action: 'format-columns', fileId: fileId, sheetId: worksheetId, columns: columnWidths }
                });

                if (SCHEDULE_TABLE_CONFIG.font) {
                    // notify(`Applying font...`);
                    await supabase.functions.invoke('microsoft-graph', {
                        body: {
                            action: 'format-font',
                            fileId: fileId,
                            sheetId: worksheetId,
                            range: 'A:Z', // Apply to whole sheet or used range if omitted. Let's use usedRange by omitting range if possible, but our IDL says if range is omitted it logic might vary. Let's target the whole sheet columns A-Z as a safe bet or just pass nothing for usedRange logic in edge function.
                            // Actually looking at my edge function impl: if (!range && !tableId) -> usedRange.
                            // So we can just omit range and tableId here to target usedRange of the sheet.
                            // BUT wait, create-table was just called. 
                            // The user request implies the whole table/sheet should have this font.
                            // Let's target the table specifically if possible? 
                            // Creating the table returns an ID. We have newTable.id.
                            // Let's use tableId to be safe and specific to the table, or usedRange for the whole sheet. 
                            // "el tamaño de la fuente debe ser 11 tipografia Aptos Narrow" - usually implies the whole document or at least the table.
                            // Let's go with usedRange (omit range/tableId) to ensure headers and everything get it.
                            font: SCHEDULE_TABLE_CONFIG.font
                        }
                    });
                }

            } else {
                // 2. Replace existing table data
                notify(`Replacing schedule data...`);

                const { error: replaceError } = await supabase.functions.invoke('microsoft-graph', {
                    body: {
                        action: 'replace-table-data',
                        fileId: fileId,
                        tableId: table.id,
                        sheetId: worksheetId,
                        values: values,
                                                range: 'B4'
                    }
                });
                if (replaceError) throw replaceError;
            }

        } catch (tableError: any) {
            console.error("Failed to manage Excel table/upsert", tableError);
            throw new Error(`Sync warning: ${tableError.message}`);
        }
    }
    */
}

/**
 * Publishes ALL incidences (from all dates) to a single consolidated Excel file.
 * Rewrites the entire table on each sync — no read/compare needed.
 */
export async function publishIncidencesToExcel(
    config: SchedulesConfig,
    onStatusUpdate?: (msg: string) => void
): Promise<void> {
    const notify = (msg: string) => {
        if (onStatusUpdate) onStatusUpdate(msg);
    };

    if (!config.isConnected) {
        throw new Error('Microsoft account not connected');
    }
    if (!config.incidencesFileId) {
        throw new Error('Incidences file not configured');
    }
    if (!config.incidencesWorksheetId) {
        throw new Error('Incidences worksheet not configured');
    }
    if (!config.incidencesTableId) {
        throw new Error('Incidences table not configured');
    }

    notify('Fetching all incidences...');
    const allIncidences = await scheduleEntriesService.getAllIncidences();

    const headers = [
        "date", "shift", "branch", "start_time", "end_time",
        "code", "instructor", "program", "minutes", "units",
        "status", "substitute", "type", "subtype", "description",
        "department", "feedback"
    ];

    const dataRows = allIncidences.map(inc => [
        inc.date,
        inc.shift,
        inc.branch,
        ensureTimeFormat(inc.start_time),  // Convert to HH:MM
        ensureTimeFormat(inc.end_time),    // Convert to HH:MM
        inc.code,
        inc.instructor,
        inc.program,
        String(inc.minutes || ''),         // Ensure string
        String(inc.units || ''),           // Ensure string
        inc.status || '',
        inc.substitute || '',
        inc.type || '',
        inc.subtype || '',
        inc.description || '',
        inc.department || '',
        inc.feedback || ''
    ]);

    const values = [headers, ...dataRows];

    // DEBUG: Log first row to verify format
    if (dataRows.length > 0) {
        console.log('🔍 DEBUG - First row being sent to Excel:');
        console.log('  Date:', dataRows[0][0], '(type:', typeof dataRows[0][0], ')');
        console.log('  Program:', dataRows[0][7], '(type:', typeof dataRows[0][7], ')');
        console.log('  Start Time:', dataRows[0][3], '(type:', typeof dataRows[0][3], ')');
        console.log('  Instructor:', dataRows[0][6], '(type:', typeof dataRows[0][6], ')');
    }

    // Prioritize Table ID from config, then File ID
    const fileId = config.incidencesFileId;
    const targetTableId = config.incidencesTableId;
    const worksheetId = config.incidencesWorksheetId;

    notify('Checking incidences file...');

    // 1. List valid tables to verify existence or find a fallback
    const { data: content, error: contentError } = await supabase.functions.invoke('microsoft-graph', {
        body: { action: 'list-content', fileId }
    });
    if (contentError) throw contentError;

    const items = content.value as { id: string; name: string; type: string }[];

    // Determine which table to use
    // A. Use Configured Table ID if it exists in the file
    let activeTable = targetTableId ? items.find(i => i.id === targetTableId && i.type === 'table') : null;

    // B. Fallback: Use the FIRST table found (if no specific table linked)
    if (!activeTable) {
        activeTable = items.find(i => i.type === 'table');
    }

    if (activeTable) {
        // Upsert: Add new incidences or update existing ones (preserves history)
        notify(`Syncing ${dataRows.length} incidences to table '${activeTable.name}'...`);

        // Key columns to identify unique rows: Only date + program (immutable fields)
        // start_time and instructor can change, so they shouldn't be part of the key
        const keyColumns = ["date", "program"];

        const { error: upsertError } = await supabase.functions.invoke('microsoft-graph', {
            body: {
                action: 'upsert-rows-by-key',
                fileId,
                tableId: activeTable.id,
                sheetId: worksheetId, // Required for writing to worksheet
                values: values, // Includes headers
                keyColumns: keyColumns,
                range: 'B4' // Table starts at B4
            }
        });

        if (upsertError) throw upsertError;
        notify('Sync complete - Incidences updated.');
    } else {
        // No table exists — write data and create a table
        notify('Creating incidences table...');

        // Use configured worksheet if available, otherwise find first sheet
        let sheet = worksheetId ? items.find(i => i.id === worksheetId && i.type === 'sheet') : null;
        if (!sheet) {
            sheet = items.find(i => i.type === 'sheet');
        }
        if (!sheet) throw new Error('No worksheet found in incidences file');

        const { data: updateData, error: writeError } = await supabase.functions.invoke('microsoft-graph', {
            body: { action: 'update-range', fileId, sheetId: sheet.id, values, range: 'B4' }
        });
        if (writeError) throw writeError;

        const fullAddress = updateData.address;
        const rangeAddress = fullAddress.includes('!') ? fullAddress.split('!')[1] : fullAddress;

        const { data: newTable } = await supabase.functions.invoke('microsoft-graph', {
            body: { action: 'create-table', fileId, sheetId: sheet.id, range: rangeAddress }
        });

        // Apply styling
        const { SCHEDULE_TABLE_CONFIG } = await import('../utils/excel-styles');

        await supabase.functions.invoke('microsoft-graph', {
            body: { action: 'update-table-style', fileId, tableId: newTable.id, style: SCHEDULE_TABLE_CONFIG.style }
        });

        const columnWidths = toExcelColumnWidths(SCHEDULE_TABLE_CONFIG.columns, headers);
        await supabase.functions.invoke('microsoft-graph', {
            body: { action: 'format-columns', fileId, sheetId: sheet.id, columns: columnWidths }
        });

        if (SCHEDULE_TABLE_CONFIG.font) {
            await supabase.functions.invoke('microsoft-graph', {
                body: { action: 'format-font', fileId, sheetId: sheet.id, font: SCHEDULE_TABLE_CONFIG.font }
            });
        }
    }

    notify('Incidences synced');
}
