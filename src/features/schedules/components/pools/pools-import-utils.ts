import { read, utils } from "xlsx";
import type { PoolRule, PoolRuleInput } from "@/features/schedules/types";

export interface PoolImportRow {
    program_query?: unknown;
    program?: unknown;
    allowed_instructors?: unknown;
    positive_pool?: unknown;
    blocked_instructors?: unknown;
    negative_pool?: unknown;
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

function normalizeNotes(value: string | null | undefined): string {
    return (value ?? "").trim();
}

function normalizeInstructorSet(values: string[]): string[] {
    return sanitizeInstructorList(values)
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
}

function isSameInstructorSet(left: string[], right: string[]): boolean {
    const leftNormalized = normalizeInstructorSet(left);
    const rightNormalized = normalizeInstructorSet(right);
    if (leftNormalized.length !== rightNormalized.length) return false;

    for (let index = 0; index < leftNormalized.length; index++) {
        if (leftNormalized[index] !== rightNormalized[index]) return false;
    }

    return true;
}

function isEquivalentPoolRule(input: PoolRuleInput, existing: PoolRule): boolean {
    return (
        normalizeProgramQuery(input.program_query) === normalizeProgramQuery(existing.program_query)
        && isSameInstructorSet(input.allowed_instructors, existing.allowed_instructors)
        && isSameInstructorSet(input.blocked_instructors, existing.blocked_instructors)
        && input.hard_lock === existing.hard_lock
        && input.is_active === existing.is_active
        && normalizeNotes(input.notes) === normalizeNotes(existing.notes)
    );
}

export function buildPoolImportPreview(drafts: PoolImportDraft[], rules: PoolRule[]): { rows: PoolImportPreviewRow[]; summary: PoolImportSummary } {
    const existingByProgram = new Map<string, PoolRule[]>();
    for (const rule of rules) {
        const key = normalizeProgramQuery(rule.program_query);
        if (!key) continue;
        const bucket = existingByProgram.get(key) ?? [];
        bucket.push(rule);
        existingByProgram.set(key, bucket);
    }

    const programCounts = new Map<string, number>();
    for (const draft of drafts) {
        const key = normalizeProgramQuery(draft.payload.program_query);
        if (!key) continue;
        programCounts.set(key, (programCounts.get(key) ?? 0) + 1);
    }

    const rows: PoolImportPreviewRow[] = drafts.map((draft) => {
        const payload = draft.payload;
        const normalizedProgram = normalizeProgramQuery(payload.program_query);
        const duplicateCount = normalizedProgram ? (programCounts.get(normalizedProgram) ?? 0) : 0;

        const intersections = payload.allowed_instructors.filter((value) =>
            payload.blocked_instructors.some((blocked) => blocked.toLowerCase() === value.toLowerCase())
        );

        if (!normalizedProgram) {
            return {
                ...payload,
                id: draft.id,
                status: "invalid",
                reason: "Program is required",
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
                reason: "An instructor cannot be in both positive and negative pool",
                existingRuleId: null,
            };
        }

        const existing = existingByProgram.get(normalizedProgram) ?? [];
        if (existing.length > 1) {
            return {
                ...payload,
                id: draft.id,
                status: "ambiguous",
                reason: "More than one existing rule matches this program",
                existingRuleId: null,
            };
        }

        if (existing.length === 0) {
            return {
                ...payload,
                id: draft.id,
                status: "new",
                reason: "Will create a new rule",
                existingRuleId: null,
            };
        }

        const targetRule = existing[0];
        if (isEquivalentPoolRule(payload, targetRule)) {
            return {
                ...payload,
                id: draft.id,
                status: "identical",
                reason: "Already up-to-date in database",
                existingRuleId: targetRule.id,
            };
        }

        return {
            ...payload,
            id: draft.id,
            status: "modified",
            reason: "Will update existing rule",
            existingRuleId: targetRule.id,
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

                return {
                    program_query: programValue,
                    allowed_instructors: parseInstructorCell(row.allowed_instructors ?? row.positive_pool),
                    blocked_instructors: parseInstructorCell(row.blocked_instructors ?? row.negative_pool),
                    hard_lock: false,
                    is_active: true,
                    notes: null,
                } as PoolRuleInput;
            })
            .filter((item): item is PoolRuleInput => item !== null);

        payloads.push(...filePayloads);
    }

    return { payloads, fileErrors };
}