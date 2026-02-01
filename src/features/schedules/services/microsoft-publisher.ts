import { supabase } from '@/lib/supabase';
import { extractYearMonth } from '@/lib/utils';
import { DailyIncidence, Schedule, SchedulesConfig } from '../types';

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

/**
 * Publishes daily changes to Excel via Microsoft Graph.
 * @param config Microsoft connection configuration
 * @param incidences List of incidences to log
 * @param activeDate The date being published (YYYY-MM-DD)
 * @param computedSchedules The final schedule data to write
 * @param onStatusUpdate Optional callback for status messages
 */
export async function publishScheduleToExcel(
    config: SchedulesConfig,
    incidences: DailyIncidence[],
    activeDate: string,
    computedSchedules: (Schedule | DailyIncidence)[],
    onStatusUpdate?: (msg: string) => void
): Promise<void> {

    const notify = (msg: string) => {
        if (onStatusUpdate) onStatusUpdate(msg);
    };

    if (!config.isConnected) {
        throw new Error('Microsoft account not connected');
    }

    // 1. Sync Incidences Log
    if (config.incidencesFileId && incidences.length > 0) {
        notify("Syncing incidence log...");
        const { data: content, error: listError } = await supabase.functions.invoke('microsoft-graph', {
            body: { action: 'list-content', fileId: config.incidencesFileId }
        });

        if (listError) throw listError;

        const table = content.value.find((i: any) => i.type === 'table');
        if (!table) throw new Error('No table found in Incidences file.');

        const rows = incidences.map(inc => [
            inc.date, inc.shift, inc.branch, inc.start_time, inc.end_time,
            inc.code, inc.instructor, inc.program, inc.minutes, inc.units,
            inc.status || '', inc.substitute || '', inc.type || '',
            inc.subtype || '', inc.description || '', inc.department || '',
            inc.feedback || ''
        ]);

        const { error: appendError } = await supabase.functions.invoke('microsoft-graph', {
            body: { action: 'append-row', fileId: config.incidencesFileId, tableId: table.id, values: rows }
        });

        if (appendError) throw appendError;
    }

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
                        range: 'B2'
                    }
                });
                if (replaceError) throw replaceError;
            }

        } catch (tableError: any) {
            console.error("Failed to manage Excel table/upsert", tableError);
            throw new Error(`Sync warning: ${tableError.message}`);
        }
    }
}
