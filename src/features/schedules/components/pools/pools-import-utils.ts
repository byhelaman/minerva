import { read, utils } from "xlsx";
import type { PoolRule, PoolRuleInput } from "@/features/schedules/types";
import {
    normalizeDayInstructorPools,
    parseDayInstructorPoolsCell,
} from "@/features/schedules/utils/weekdays";

export interface PoolImportRow {
    branch?: unknown;
    program_query?: unknown;
    program?: unknown;
    allowed_instructors?: unknown;
    positive_pool_by_day?: unknown;
    allowed_instructors_by_day?: unknown;
    positive_pool?: unknown;
    blocked_instructors?: unknown;
    negative_pool?: unknown;
    hard_lock?: unknown;
    strict?: unknown;
    is_active?: unknown;
    status?: unknown;
    notes?: unknown;
}

export type PoolImportStatus = "new" | "modified" | "identical" | "duplicate" | "invalid" | "ambiguous";

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
    modifiedCount: number;
    identicalCount: number;
    duplicateCount: number;
    invalidCount: number;
    ambiguousCount: number;
    unresolvedCount: number;
}

export function sanitizeInstructorList(values: string[]): string[] {
    const unique = new Map<string, string>();
    values
        .map((value) => value.trim())
        .filter(Boolean)
        .forEach((value) => {
            const key = value.toLowerCase();
            if (!unique.has(key)) {
                unique.set(key, value);
            }
        });

    return Array.from(unique.values());
}

export function countWords(value: string): number {
    return value.trim().split(/\s+/).filter(Boolean).length;
}

export function parseInstructorCell(value: unknown): string[] {
    if (Array.isArray(value)) {
        return sanitizeInstructorList(value.map((entry) => String(entry ?? "")));
    }

    const raw = String(value ?? "").trim();
    if (!raw) return [];

    return sanitizeInstructorList(raw.split(/[\n,;|]+/).map((entry) => entry.trim()));
}

function normalizeProgramQuery(value: string): string {
    return value.trim().toLowerCase();
}

function parseBooleanCell(value: unknown, fallback: boolean): boolean {
    if (typeof value === "boolean") return value;
    const normalized = String(value ?? "").trim().toLowerCase();
    if (!normalized) return fallback;
    if (["1", "true", "yes", "y", "si", "s", "on", "active", "strict"].includes(normalized)) return true;
    if (["0", "false", "no", "n", "off", "inactive", "open"].includes(normalized)) return false;
    return fallback;
}

function countPositivePoolInstructors(input: PoolRuleInput): number {
    const dayAllowed = Object.values(normalizeDayPools(input.allowed_instructors_by_day)).flatMap((list) => list ?? []);
    return sanitizeInstructorList([...input.allowed_instructors, ...dayAllowed]).length;
}

function getRuleIdentityKey(programQuery: string): string {
    const normalizedProgram = normalizeProgramQuery(programQuery);
    return normalizedProgram;
}

function normalizeDayPools(value: unknown): Partial<Record<number, string[]>> {
    return normalizeDayInstructorPools(value);
}

function findPoolIntersections(payload: PoolRuleInput): string[] {
    const dayAllowed = Object.values(normalizeDayPools(payload.allowed_instructors_by_day))
        .flatMap((list) => list ?? []);
    const allPositive = sanitizeInstructorList([...payload.allowed_instructors, ...dayAllowed]);

    return allPositive.filter((value) =>
        payload.blocked_instructors.some((blocked) => blocked.toLowerCase() === value.toLowerCase())
    );
}

export function buildPoolImportPreview(drafts: PoolImportDraft[], rules: PoolRule[]): { rows: PoolImportPreviewRow[]; summary: PoolImportSummary } {
    const existingByRuleKey = new Map<string, PoolRule[]>();
    for (const rule of rules) {
        const key = getRuleIdentityKey(rule.program_query);
        if (!key) continue;
        const bucket = existingByRuleKey.get(key) ?? [];
        bucket.push(rule);
        existingByRuleKey.set(key, bucket);
    }

    const ruleKeyCounts = new Map<string, number>();
    for (const draft of drafts) {
        const key = getRuleIdentityKey(draft.payload.program_query);
        if (!key) continue;
        ruleKeyCounts.set(key, (ruleKeyCounts.get(key) ?? 0) + 1);
    }

    const rows: PoolImportPreviewRow[] = drafts.map((draft) => {
        const payload = draft.payload;
        const normalizedProgram = normalizeProgramQuery(payload.program_query);
        const identityKey = getRuleIdentityKey(payload.program_query);
        const duplicateCount = normalizedProgram ? (ruleKeyCounts.get(identityKey) ?? 0) : 0;

        const intersections = findPoolIntersections(payload);

        if (!normalizedProgram) {
            return {
                ...payload,
                id: draft.id,
                status: "invalid",
                reason: "Program is required",
                existingRuleId: null,
            };
        }

        if (!payload.branch.trim()) {
            return {
                ...payload,
                id: draft.id,
                status: "invalid",
                reason: "Branch is required",
                existingRuleId: null,
            };
        }

        if (duplicateCount > 1) {
            return {
                ...payload,
                id: draft.id,
                status: "duplicate",
                reason: "Duplicated program in import file",
                existingRuleId: null,
            };
        }

        if (countPositivePoolInstructors(payload) > 5) {
            return {
                ...payload,
                id: draft.id,
                status: "invalid",
                reason: "Positive pool supports up to 5 instructors (3 fixed + 2 backups)",
                existingRuleId: null,
            };
        }

        if (payload.hard_lock && payload.allowed_instructors.length === 0) {
            return {
                ...payload,
                id: draft.id,
                status: "invalid",
                reason: "Hard lock requires at least one allowed instructor",
                existingRuleId: null,
            };
        }

        if (intersections.length > 0) {
            return {
                ...payload,
                id: draft.id,
                status: "invalid",
                reason: "An instructor cannot be in both positive and negative pool (general/day)",
                existingRuleId: null,
            };
        }

        const existing = existingByRuleKey.get(identityKey) ?? [];
        if (existing.length === 0) {
            return {
                ...payload,
                id: draft.id,
                status: "new",
                reason: "Will create a new rule",
                existingRuleId: null,
            };
        }

        return {
            ...payload,
            id: draft.id,
            status: "duplicate",
            reason: "Program already exists in database",
            existingRuleId: existing[0]?.id ?? null,
        };
    });

    const summary = rows.reduce<PoolImportSummary>((acc, row) => {
        if (row.status === "new") acc.newCount += 1;
        if (row.status === "modified") acc.modifiedCount += 1;
        if (row.status === "identical") acc.identicalCount += 1;
        if (row.status === "duplicate") acc.duplicateCount += 1;
        if (row.status === "invalid") acc.invalidCount += 1;
        if (row.status === "ambiguous") acc.ambiguousCount += 1;
        return acc;
    }, {
        newCount: 0,
        modifiedCount: 0,
        identicalCount: 0,
        duplicateCount: 0,
        invalidCount: 0,
        ambiguousCount: 0,
        unresolvedCount: 0,
    });

    summary.unresolvedCount = summary.duplicateCount + summary.invalidCount + summary.ambiguousCount;

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
                const programValue = String(row.program_query ?? row.program ?? "").trim();
                if (!programValue) return null;
                const branchValue = String(row.branch ?? "").trim();

                return {
                    branch: branchValue,
                    program_query: programValue,
                    allowed_instructors: parseInstructorCell(row.allowed_instructors ?? row.positive_pool),
                    allowed_instructors_by_day: parseDayInstructorPoolsCell(
                        row.allowed_instructors_by_day ?? row.positive_pool_by_day,
                    ),
                    blocked_instructors: parseInstructorCell(row.blocked_instructors ?? row.negative_pool),
                    hard_lock: parseBooleanCell(row.hard_lock ?? row.strict, false),
                    is_active: parseBooleanCell(row.is_active ?? row.status, true),
                    notes: String(row.notes ?? "").trim() || null,
                } as PoolRuleInput;
            })
            .filter((item): item is PoolRuleInput => item !== null);

        payloads.push(...filePayloads);
    }

    return { payloads, fileErrors };
}