import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { Schedule, SchedulesConfig } from '../types';
import { normalizeString, getSchedulePrimaryKey } from "../utils/string-utils";
import { scheduleEntriesService } from './schedule-entries-service';

// Relaxed schema - only truly required fields are strict
const ImportScheduleSchema = z.object({
    // Required fields (no defaults possible)
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"),
    start_time: z.string().regex(/^\d{2}:\d{2}$/, "Invalid time format (HH:MM)"),
    end_time: z.string().regex(/^\d{2}:\d{2}$/, "Invalid time format (HH:MM)"),
    program: z.string().min(1, "Program is required"),

    // Optional fields with defaults
    shift: z.string().default(''),
    branch: z.string().default(''),
    code: z.string().default(''),
    instructor: z.string().default(''),
    minutes: z.string().default('0'),
    units: z.string().default('0'),

    // Incidence fields (fully optional)
    status: z.string().optional(),
    substitute: z.string().optional(),
    type: z.string().optional(),
    subtype: z.string().optional(),
    description: z.string().optional(),
    department: z.string().optional(),
    feedback: z.string().optional(),
});

export interface RowError {
    key: string;
    errors: string[];
}

export interface ImportPreview {
    schedules: Schedule[];
    errorMap: Map<string, string[]>; // key -> errors
    validCount: number;
    invalidCount: number;
}

// Generate a unique key for a schedule row
export function getRowKey(row: Partial<Schedule>): string {
    return getSchedulePrimaryKey({
        date: row.date || '',
        start_time: row.start_time || '',
        instructor: row.instructor || '',
        program: row.program || ''
    });
}

// Map Excel headers to Schedule field names
const HEADER_MAP: Record<string, keyof Schedule> = {
    'date': 'date',
    'shift': 'shift',
    'branch': 'branch',
    'start_time': 'start_time',
    'end_time': 'end_time',
    'code': 'code',
    'instructor': 'instructor',
    'program': 'program',
    'minutes': 'minutes',
    'units': 'units',
    'status': 'status',
    'substitute': 'substitute',
    'type': 'type',
    'subtype': 'subtype',
    'description': 'description',
    'department': 'department',
    'feedback': 'feedback',
};

/**
 * Fetches rows from Excel table and validates them.
 * Returns ALL rows (valid and invalid) with error tracking.
 */
export async function fetchAndValidateFromExcel(
    config: SchedulesConfig,
    dateFilter?: string
): Promise<ImportPreview> {
    if (!config.isConnected) {
        throw new Error('Microsoft account not connected');
    }
    if (!config.incidencesFileId) {
        throw new Error('Incidences file not configured');
    }
    if (!config.incidencesTableId) {
        throw new Error('Incidences table not configured');
    }

    // 1. Fetch rows from Edge Function
    const { data, error } = await supabase.functions.invoke('microsoft-graph', {
        body: {
            action: 'read-table-rows',
            fileId: config.incidencesFileId,
            tableId: config.incidencesTableId,
            dateFilter
        }
    });

    if (error) {
        throw new Error(error.message || 'Failed to fetch data from Excel');
    }

    const headers = data.headers as string[];
    const rows = data.rows as unknown[][];

    // 2. Map rows to Schedule objects and validate
    const schedules: Schedule[] = [];
    const errorMap = new Map<string, string[]>();
    let validCount = 0;
    let invalidCount = 0;

    for (let i = 0; i < rows.length; i++) {
        const rowArray = rows[i];
        const rowObj: Record<string, unknown> = {};

        headers.forEach((header, idx) => {
            const fieldName = HEADER_MAP[header];
            if (fieldName) {
                const raw = rowArray[idx];
                rowObj[fieldName] = typeof raw === 'string' ? normalizeString(raw) : (raw ?? '');
            }
        });

        // Validate with Zod
        const result = ImportScheduleSchema.safeParse(rowObj);
        const rowKey = getRowKey(rowObj as Partial<Schedule>);

        if (result.success) {
            schedules.push(result.data as Schedule);
            validCount++;
        } else {
            // Extract error messages
            const errors = result.error.issues.map((issue) =>
                `${issue.path.join('.')}: ${issue.message}`
            );
            errorMap.set(rowKey, errors);

            // Still add to schedules array (with whatever data we have) so it shows in table
            const partialSchedule: Schedule = {
                date: String(rowObj.date || ''),
                shift: String(rowObj.shift || ''),
                branch: String(rowObj.branch || ''),
                start_time: String(rowObj.start_time || ''),
                end_time: String(rowObj.end_time || ''),
                code: String(rowObj.code || ''),
                instructor: String(rowObj.instructor || ''),
                program: String(rowObj.program || ''),
                minutes: String(rowObj.minutes || '0'),
                units: String(rowObj.units || '0'),
                status: rowObj.status as string | undefined,
                substitute: rowObj.substitute as string | undefined,
                type: rowObj.type as string | undefined,
                subtype: rowObj.subtype as string | undefined,
                description: rowObj.description as string | undefined,
                department: rowObj.department as string | undefined,
                feedback: rowObj.feedback as string | undefined,
            };
            schedules.push(partialSchedule);
            invalidCount++;
        }
    }

    return {
        schedules,
        errorMap,
        validCount,
        invalidCount
    };
}

/**
 * Validates a single schedule and returns errors if any.
 */
export function validateSchedule(schedule: Schedule): string[] | null {
    const result = ImportScheduleSchema.safeParse(schedule);
    if (result.success) {
        return null;
    }
    return result.error.issues.map((issue) =>
        `${issue.path.join('.')}: ${issue.message}`
    );
}

/**
 * Executes the import by upserting validated schedules to Supabase.
 * Uses importSchedules() which includes incidence fields (status, type, etc.).
 */
export async function executeImport(schedules: Schedule[], publishedBy: string): Promise<{ upsertedCount: number; duplicatesSkipped: number }> {
    if (schedules.length === 0) {
        throw new Error('No schedules to import');
    }

    return scheduleEntriesService.importSchedules(schedules, publishedBy);
}
