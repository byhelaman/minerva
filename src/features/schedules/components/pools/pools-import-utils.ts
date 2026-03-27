import { read, utils } from "xlsx";
import type { PoolRule, PoolRuleInput } from "@/features/schedules/types";
import {
    countPositivePoolInstructors,
    findPoolIntersections,
    normalizeProgramKey,
    parseInstructorCell,
    sanitizeInstructorList,
} from "@/features/schedules/utils/pool-utils";
import { parseDayInstructorPoolsCell } from "@/features/schedules/utils/weekdays";

export interface PoolImportRow {
    branch?: unknown;
    program_name?: unknown;
    program?: unknown;
    allowed_instructors?: unknown;
    positive_pool?: unknown;
    positive_pool_by_day?: unknown;
    blocked_instructors?: unknown;
    negative_pool?: unknown;
    hard_lock?: unknown;
    strict?: unknown;
    is_active?: unknown;
    status?: unknown;
    has_rotation_limit?: unknown;
    rotation_limit?: unknown;
    comments?: unknown;
}

export type PoolImportStatus = "new" | "update" | "identical" | "invalid";

export interface PoolImportDraft {
    id: string;
    payload: PoolRuleInput;
}

export interface PoolImportPreviewRow extends PoolRuleInput {
    id: string;
    status: PoolImportStatus;
    reason: string | null;
    existingRuleId: string | null;
}

export interface PoolImportSummary {
    newCount: number;
    updateCount: number;
    identicalCount: number;
    invalidCount: number;
    unresolvedCount: number;
}

function isPoolRuleChanged(existing: PoolRule, incoming: PoolRuleInput): boolean {
    if (existing.branch !== incoming.branch) return true;
    if (existing.hard_lock !== incoming.hard_lock) return true;
    if (existing.is_active !== incoming.is_active) return true;
    if (existing.has_rotation_limit !== incoming.has_rotation_limit) return true;
    if ((existing.comments ?? "") !== (incoming.comments ?? "")) return true;

    const existingAllowed = sanitizeInstructorList(existing.allowed_instructors);
    const incomingAllowed = sanitizeInstructorList(incoming.allowed_instructors);
    if (existingAllowed.length !== incomingAllowed.length
        || existingAllowed.some((v, i) => v.toLowerCase() !== incomingAllowed[i].toLowerCase())) {
        return true;
    }

    const existingBlocked = sanitizeInstructorList(existing.blocked_instructors);
    const incomingBlocked = sanitizeInstructorList(incoming.blocked_instructors);
    if (existingBlocked.length !== incomingBlocked.length
        || existingBlocked.some((v, i) => v.toLowerCase() !== incomingBlocked[i].toLowerCase())) {
        return true;
    }

    // Excel import does not support day_overrides — if existing rule has overrides it will show as update
    const existingOverrideCount = existing.day_overrides.length;
    const incomingOverrideCount = (incoming.day_overrides ?? []).length;
    if (existingOverrideCount !== incomingOverrideCount) return true;

    return false;
}

function getRuleIdentityKey(branch: string, programQuery: string): string {
    const normalizedBranch = branch.trim().toLowerCase();
    const normalizedProgram = normalizeProgramKey(programQuery);
    return `${normalizedBranch}::${normalizedProgram}`;
}

function parseBooleanCell(value: unknown, fallback: boolean): boolean {
    if (typeof value === "boolean") return value;
    const normalized = String(value ?? "").trim().toLowerCase();
    if (!normalized) return fallback;
    if (["1", "true", "yes", "y", "si", "s", "on", "active", "strict"].includes(normalized)) return true;
    if (["0", "false", "no", "n", "off", "inactive", "open"].includes(normalized)) return false;
    return fallback;
}

export function buildPoolImportPreview(drafts: PoolImportDraft[], rules: PoolRule[]): { rows: PoolImportPreviewRow[]; summary: PoolImportSummary } {
    const existingByRuleKey = new Map<string, PoolRule[]>();
    for (const rule of rules) {
        const key = getRuleIdentityKey(rule.branch, rule.program_name);
        if (!key) continue;
        const bucket = existingByRuleKey.get(key) ?? [];
        bucket.push(rule);
        existingByRuleKey.set(key, bucket);
    }

    const ruleKeyCounts = new Map<string, number>();
    for (const draft of drafts) {
        const key = getRuleIdentityKey(draft.payload.branch, draft.payload.program_name);
        if (!key) continue;
        ruleKeyCounts.set(key, (ruleKeyCounts.get(key) ?? 0) + 1);
    }

    const rows: PoolImportPreviewRow[] = drafts.map((draft) => {
        const payload = draft.payload;
        const normalizedProgram = normalizeProgramKey(payload.program_name);
        const identityKey = getRuleIdentityKey(payload.branch, payload.program_name);
        const duplicateCount = normalizedProgram ? (ruleKeyCounts.get(identityKey) ?? 0) : 0;

        const intersections = findPoolIntersections(payload);

        if (!normalizedProgram) {
            return {
                ...payload,
                id: draft.id,
                status: "invalid" as const,
                reason: "Program is required",
                existingRuleId: null,
            };
        }

        if (!payload.branch.trim()) {
            return {
                ...payload,
                id: draft.id,
                status: "invalid" as const,
                reason: "Branch is required",
                existingRuleId: null,
            };
        }

        if (duplicateCount > 1) {
            return {
                ...payload,
                id: draft.id,
                status: "invalid" as const,
                reason: "Duplicated branch + program in import file",
                existingRuleId: null,
            };
        }

        if (countPositivePoolInstructors(payload) > 5) {
            return {
                ...payload,
                id: draft.id,
                status: "invalid" as const,
                reason: "Positive pool supports up to 5 instructors",
                existingRuleId: null,
            };
        }

        if (intersections.length > 0) {
            return {
                ...payload,
                id: draft.id,
                status: "invalid" as const,
                reason: "An instructor cannot be in both positive and negative pool",
                existingRuleId: null,
            };
        }

        const existing = existingByRuleKey.get(identityKey) ?? [];
        if (existing.length === 0) {
            return {
                ...payload,
                id: draft.id,
                status: "new" as const,
                reason: null,
                existingRuleId: null,
            };
        }

        if (existing.length > 1) {
            return {
                ...payload,
                id: draft.id,
                status: "invalid" as const,
                reason: `Found ${existing.length} existing rules for same branch + program`,
                existingRuleId: null,
            };
        }

        const matchedRule = existing[0];
        if (isPoolRuleChanged(matchedRule, payload)) {
            return {
                ...payload,
                id: draft.id,
                status: "update" as const,
                reason: "Will update existing rule",
                existingRuleId: matchedRule.id,
            };
        }

        return {
            ...payload,
            id: draft.id,
            status: "identical" as const,
            reason: "No changes detected",
            existingRuleId: matchedRule.id,
        };
    });

    const summary = rows.reduce<PoolImportSummary>((acc, row) => {
        if (row.status === "new") acc.newCount += 1;
        if (row.status === "update") acc.updateCount += 1;
        if (row.status === "identical") acc.identicalCount += 1;
        if (row.status === "invalid") acc.invalidCount += 1;
        return acc;
    }, {
        newCount: 0,
        updateCount: 0,
        identicalCount: 0,
        invalidCount: 0,
        unresolvedCount: 0,
    });

    summary.unresolvedCount = summary.invalidCount;

    return { rows, summary };
}

export async function parsePoolImportFiles(files: File[]): Promise<{ payloads: PoolRuleInput[]; fileErrors: string[] }> {
    const payloads: PoolRuleInput[] = [];
    const fileErrors: string[] = [];

    for (const file of files) {
        const buffer = await file.arrayBuffer();
        const workbook = read(buffer, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];

        if (!firstSheetName) {
            fileErrors.push(`The file ${file.name} has no sheets`);
            continue;
        }

        const worksheet = workbook.Sheets[firstSheetName];
        const importedRows = utils.sheet_to_json<PoolImportRow>(worksheet, { defval: "" });

        if (importedRows.length === 0) {
            fileErrors.push(`No rows found to import in ${file.name}`);
            continue;
        }

        const filePayloads = importedRows
            .map((row) => {
                const programValue = String(row.program_name ?? row.program ?? "").trim();
                if (!programValue) return null;
                const branchValue = String(row.branch ?? "").trim();

                const dayPools = parseDayInstructorPoolsCell(row.positive_pool_by_day);
                const day_overrides = Object.entries(dayPools).map(([day, instructors]) => ({
                    day_of_week: Number(day),
                    start_time: "00:00",
                    end_time: "23:59",
                    allowed_instructors: instructors,
                }));

                return {
                    branch: branchValue,
                    program_name: programValue,
                    day_overrides,
                    allowed_instructors: parseInstructorCell(row.allowed_instructors ?? row.positive_pool),
                    blocked_instructors: parseInstructorCell(row.blocked_instructors ?? row.negative_pool),
                    hard_lock: parseBooleanCell(row.hard_lock ?? row.strict, false),
                    is_active: parseBooleanCell(row.is_active ?? row.status, true),
                    has_rotation_limit: parseBooleanCell(row.has_rotation_limit ?? row.rotation_limit, false),
                    comments: String(row.comments ?? "").trim() || null,
                } as PoolRuleInput;
            })
            .filter((item): item is PoolRuleInput => item !== null);

        payloads.push(...filePayloads);
    }

    return { payloads, fileErrors };
}