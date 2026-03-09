import { sanitizeInstructorList } from "./pool-utils";

export interface WeekdayOption {
    value: number;
    label: string;
}

export type DayInstructorPools = Partial<Record<number, string[]>>;

export const WEEKDAY_OPTIONS: WeekdayOption[] = [
    { value: 1, label: "Mon" },
    { value: 2, label: "Tue" },
    { value: 3, label: "Wed" },
    { value: 4, label: "Thu" },
    { value: 5, label: "Fri" },
    { value: 6, label: "Sat" },
    { value: 7, label: "Sun" },
];


const dayAliases = new Map<string, number>([
    ["1", 1], ["mon", 1], ["monday", 1], ["lun", 1], ["lunes", 1],
    ["2", 2], ["tue", 2], ["tues", 2], ["tuesday", 2], ["mar", 2], ["martes", 2],
    ["3", 3], ["wed", 3], ["wednesday", 3], ["mie", 3], ["mier", 3], ["miércoles", 3], ["miercoles", 3],
    ["4", 4], ["thu", 4], ["thur", 4], ["thurs", 4], ["thursday", 4], ["jue", 4], ["jueves", 4],
    ["5", 5], ["fri", 5], ["friday", 5], ["vie", 5], ["viernes", 5],
    ["6", 6], ["sat", 6], ["saturday", 6], ["sab", 6], ["sábado", 6], ["sabado", 6],
    ["7", 7], ["sun", 7], ["sunday", 7], ["dom", 7], ["domingo", 7],
]);

export function getIsoWeekdayFromDateString(isoDate: string): number | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    const utcDate = new Date(Date.UTC(year, month - 1, day));
    if (Number.isNaN(utcDate.getTime())) return null;

    const jsDay = utcDate.getUTCDay();
    return jsDay === 0 ? 7 : jsDay;
}

function parseInstructorList(value: unknown): string[] {
    if (Array.isArray(value)) {
        return sanitizeInstructorList(value.map((item) => String(item ?? "")));
    }

    const raw = String(value ?? "").trim();
    if (!raw) return [];

    return sanitizeInstructorList(raw.split(/[\n,;|]+/).map((item) => item.trim()));
}

export function normalizeDayInstructorPools(value: unknown): DayInstructorPools {
    if (!value || typeof value !== "object") return {};

    const normalized: DayInstructorPools = {};
    const source = value as Record<string, unknown>;

    for (const [key, list] of Object.entries(source)) {
        const day = Number(key);
        if (!Number.isInteger(day) || day < 1 || day > 7) continue;
        const parsed = parseInstructorList(list);
        if (parsed.length > 0) {
            normalized[day] = parsed;
        }
    }

    return normalized;
}

export function formatDayInstructorPools(value: unknown): string {
    const pools = normalizeDayInstructorPools(value);
    const chunks: string[] = [];

    for (const day of WEEKDAY_OPTIONS) {
        const list = pools[day.value];
        if (!list || list.length === 0) continue;
        chunks.push(`${day.label}: ${list.join(", ")}`);
    }

    return chunks.length > 0 ? chunks.join(" | ") : "—";
}

export function parseDayInstructorPoolsCell(value: unknown): DayInstructorPools {
    if (Array.isArray(value) || (value && typeof value === "object")) {
        return normalizeDayInstructorPools(value);
    }

    const raw = String(value ?? "").trim();
    if (!raw) return {};

    try {
        const maybeJson = JSON.parse(raw);
        return normalizeDayInstructorPools(maybeJson);
    } catch {
        const parsed: DayInstructorPools = {};
        const groups = raw.split(/[|\n]+/).map((part) => part.trim()).filter(Boolean);

        for (const group of groups) {
            const [dayRaw, instructorsRaw] = group.split(":");
            if (!dayRaw || instructorsRaw === undefined) continue;
            const day = dayAliases.get(dayRaw.trim().toLowerCase());
            if (!day) continue;

            const instructors = parseInstructorList(instructorsRaw);
            if (instructors.length > 0) {
                parsed[day] = instructors;
            }
        }

        return normalizeDayInstructorPools(parsed);
    }
}
