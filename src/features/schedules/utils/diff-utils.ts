import { normalizeString } from "./string-utils";
import { ensureTimeFormat } from "./time-utils";

/**
 * Get list of field differences between an imported schedule row and its DB counterpart.
 * Used by SyncFromExcelModal and ImportReportsModal to show per-row change details.
 */
export function getFieldDiffs(
    imported: {
        shift?: string; branch?: string; end_time?: string; code?: string;
        minutes?: string; units?: string;
    },
    dbFields: Record<string, string>
): string[] {
    const n = (v: string | undefined | null) => normalizeString(v);
    const t = (v: string | undefined | null) => ensureTimeFormat(v);

    const checks: [string, string, string][] = [
        ['shift', n(imported.shift), dbFields.shift ?? ''],
        ['branch', n(imported.branch), dbFields.branch ?? ''],
        ['end_time', t(imported.end_time), dbFields.end_time ?? ''],
        ['code', n(imported.code), dbFields.code ?? ''],
        ['minutes', n(imported.minutes), dbFields.minutes ?? ''],
        ['units', n(imported.units), dbFields.units ?? ''],
    ];

    return checks
        .filter(([, a, b]) => a !== b)
        .map(([field, imported, db]) => `${field}: "${db || '(empty)'}" → "${imported || '(empty)'}"`);
}
