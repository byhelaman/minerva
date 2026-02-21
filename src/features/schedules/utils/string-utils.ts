import { ensureTimeFormat } from "./time-utils";

/**
 * Universal hook for string sanitization. 
 * Trims whitespace and replaces multiple consecutive spaces or Non-Breaking Spaces (\xA0) with a single space.
 * 
 * @param val The string to normalize.
 * @returns The sanitized string, or an empty string if null/undefined.
 */
export function normalizeString(val: string | undefined | null): string {
    return String(val ?? "").trim().replace(/\s+/g, ' ');
}

/**
 * Validatable standard Schedule Key. 
 * Standardizes data before combining it into the unique DB primary key format:
 * `${date}|${start_time}|${instructor}|${program}`
 * 
 * Ensures empty instructors fallback to 'none' and times are formatted to HH:MM.
 */
export function getSchedulePrimaryKey(row: {
    date?: string; 
    start_time?: string; 
    instructor?: string; 
    program?: string;
}): string {
    const time = ensureTimeFormat(row.start_time);
    const inst = normalizeString(row.instructor) || 'none';
    const prog = normalizeString(row.program);
    return `${row.date || ''}|${time}|${inst}|${prog}`;
}
