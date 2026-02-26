import { normalizeString } from "./string-utils";
import { ensureTimeFormat } from "./time-utils";

/**
 * Get list of field differences between an imported schedule row and its DB counterpart.
 * Used by SyncFromExcelModal and ImportReportsModal to show per-row change details.
 */
export function getFieldDiffs(
    imported: {
        shift?: string; branch?: string; end_time?: string; code?: string;
        minutes?: string; units?: string; status?: string | null;
        substitute?: string | null; type?: string | null; subtype?: string | null;
        description?: string | null; department?: string | null; feedback?: string | null;
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
        ['status', n(imported.status), dbFields.status ?? ''],
        ['substitute', n(imported.substitute), dbFields.substitute ?? ''],
        ['type', n(imported.type), dbFields.type ?? ''],
        ['subtype', n(imported.subtype), dbFields.subtype ?? ''],
        ['description', n(imported.description), dbFields.description ?? ''],
        ['department', n(imported.department), dbFields.department ?? ''],
        ['feedback', n(imported.feedback), dbFields.feedback ?? ''],
    ];

    return checks
        .filter(([, a, b]) => a !== b)
        .map(([field, imported, db]) => `${field}: "${db || '(empty)'}" → "${imported || '(empty)'}"`);
}
