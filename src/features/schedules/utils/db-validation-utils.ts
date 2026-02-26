import type { Schedule } from "../types";
import { getSchedulePrimaryKey } from "./string-utils";
import { getScheduleKey } from "./overlap-utils";
import { getFieldDiffs } from "./diff-utils";
import { scheduleEntriesService } from "../services/schedule-entries-service";

/**
 * Result of validating imported data against the database.
 */
export interface DbValidationResult {
    /** Count of entries not found in the DB */
    newCount: number;
    /** Set of composite primary keys that exist in DB */
    existingKeys: Set<string>;
    /** Set of PKs that differ from DB (modified fields) */
    modifiedKeys: Set<string>;
    /** Set of PKs identical to DB */
    identicalKeys: Set<string>;
    /** Map of PK → human-readable reason for modification */
    modifiedReasons: Map<string, string>;
}

/**
 * Validate an array of imported schedules against the database.
 * Classifies each row as new, modified, or identical.
 *
 * Used by ImportReportsModal and SyncFromExcelModal to preview DB impact.
 */
export async function validateAgainstDb(data: Schedule[]): Promise<DbValidationResult> {
    const uniqueDates = [...new Set(data.map(s => s.date))];
    const dbMap = await scheduleEntriesService.getFullSchedulesByDates(uniqueDates);

    const seenInFile = new Set<string>();
    const identical = new Set<string>();
    const modified = new Set<string>();
    const existing = new Set<string>();
    let newCount = 0;
    const reasons = new Map<string, string>();

    for (const s of data) {
        const pk = getSchedulePrimaryKey(s);
        if (seenInFile.has(pk)) continue;
        seenInFile.add(pk);

        const dbRow = dbMap.get(pk);
        if (!dbRow) {
            newCount++;
        } else {
            existing.add(pk);
            const diffs = getFieldDiffs(s, dbRow);
            if (diffs.length === 0) {
                identical.add(pk);
            } else {
                modified.add(pk);
                reasons.set(pk, `Modified: ${diffs.join(', ')}`);
            }
        }
    }

    return { newCount, existingKeys: existing, modifiedKeys: modified, identicalKeys: identical, modifiedReasons: reasons };
}

/**
 * Build issue row key maps for the ScheduleDataTable IssueFilter.
 * Converts primary keys (DB logic) to schedule keys (UI/table logic).
 */
export function buildIssueRowKeys(
    workingData: Schedule[],
    validation: DbValidationResult,
    duplicateKeys?: Set<string>,
    duplicateCount?: number,
): Record<string, Set<string>> {
    const map: Record<string, Set<string>> = {};

    // Duplicates (already in ScheduleKey format)
    if (duplicateCount && duplicateCount > 0 && duplicateKeys) {
        map.duplicates = duplicateKeys;
    }

    // Helper to convert Primary Keys → Schedule Keys
    const getScheduleKeysFromPKs = (targetPKs: Set<string>) => {
        const keys = new Set<string>();
        for (const s of workingData) {
            if (targetPKs.has(getSchedulePrimaryKey(s))) {
                keys.add(getScheduleKey(s));
            }
        }
        return keys;
    };

    // New items
    if (validation.newCount > 0) {
        const newKeys = new Set<string>();
        for (const s of workingData) {
            if (!validation.existingKeys.has(getSchedulePrimaryKey(s))) {
                newKeys.add(getScheduleKey(s));
            }
        }
        map.new = newKeys;
    }

    // Modified items
    if (validation.modifiedKeys.size > 0) {
        map.modified = getScheduleKeysFromPKs(validation.modifiedKeys);
    }

    // Identical items
    if (validation.identicalKeys.size > 0) {
        map.identical = getScheduleKeysFromPKs(validation.identicalKeys);
    }

    return map;
}
