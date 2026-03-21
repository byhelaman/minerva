import type { PoolRuleInput } from "../types";

const MAX_POSITIVE_POOL_INSTRUCTORS = 5;

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

export function parseInstructorCell(value: unknown): string[] {
    if (Array.isArray(value)) {
        return sanitizeInstructorList(value.map((entry) => String(entry ?? "")));
    }

    const raw = String(value ?? "").trim();
    if (!raw) return [];

    return sanitizeInstructorList(raw.split(/[\n,;|]+/).map((entry) => entry.trim()));
}

export function countWords(value: string): number {
    return value.trim().split(/\s+/).filter(Boolean).length;
}

export function normalizeProgramKey(value: string): string {
    return value.trim().toLowerCase();
}

export function countPositivePoolInstructors(payload: PoolRuleInput): number {
    const dayAllowed = (payload.day_overrides ?? []).flatMap((o) => o.allowed_instructors);
    return sanitizeInstructorList([...payload.allowed_instructors, ...dayAllowed]).length;
}

export function findPoolIntersections(payload: PoolRuleInput): string[] {
    const dayAllowed = (payload.day_overrides ?? []).flatMap((o) => o.allowed_instructors);
    const allPositive = sanitizeInstructorList([...payload.allowed_instructors, ...dayAllowed]);

    return allPositive.filter((value) =>
        payload.blocked_instructors.some((blocked) => blocked.toLowerCase() === value.toLowerCase())
    );
}

export { MAX_POSITIVE_POOL_INSTRUCTORS };
