import { format } from "date-fns";
import type { DateRange } from "react-day-picker";

import { STORAGE_KEYS } from "@/lib/constants";
import type { DailyIncidence, Schedule } from "@/features/schedules/types";

const REPORTS_CACHE_VERSION = 2;
const REPORTS_CACHE_TTL_MS = 10 * 60 * 1000;
const REPORTS_CACHE_MAX_ENTRIES = 8;

interface PersistedDateRange {
    from: string;
    to: string;
}

interface ReportsCacheEntry {
    key: string;
    schedules: Schedule[];
    incidences: DailyIncidence[];
    dateRange: PersistedDateRange;
    updatedAt: number;
}

interface ReportsCacheState {
    version: number;
    entries: ReportsCacheEntry[];
}

export interface ReportsCacheSnapshot {
    key: string;
    schedules: Schedule[];
    incidences: DailyIncidence[];
    dateRange: DateRange;
    updatedAt: number;
}

let inMemoryCache: ReportsCacheState | null = null;

function toDateRange(value: PersistedDateRange): DateRange {
    return {
        from: new Date(`${value.from}T00:00:00`),
        to: new Date(`${value.to}T00:00:00`),
    };
}

function toPersistedDateRange(range: DateRange): PersistedDateRange | null {
    if (!range.from) return null;

    const from = format(range.from, "yyyy-MM-dd");
    const toDate = range.to ?? range.from;
    const to = format(toDate, "yyyy-MM-dd");

    return { from, to };
}

function isExpired(updatedAt: number): boolean {
    return Date.now() - updatedAt > REPORTS_CACHE_TTL_MS;
}

function saveState(state: ReportsCacheState): void {
    try {
        localStorage.setItem(STORAGE_KEYS.REPORTS_PAGE_CACHE, JSON.stringify(state));
    } catch {
        // Ignorar errores de quota/serialización de localStorage
    }
}

function normalizeState(state: ReportsCacheState): ReportsCacheState {
    const validEntries = state.entries
        .filter(entry => !isExpired(entry.updatedAt))
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, REPORTS_CACHE_MAX_ENTRIES);

    return {
        version: REPORTS_CACHE_VERSION,
        entries: validEntries,
    };
}

function loadState(): ReportsCacheState {
    if (inMemoryCache) return inMemoryCache;

    try {
        const raw = localStorage.getItem(STORAGE_KEYS.REPORTS_PAGE_CACHE);
        if (!raw) {
            inMemoryCache = { version: REPORTS_CACHE_VERSION, entries: [] };
            return inMemoryCache;
        }

        const parsed = JSON.parse(raw) as ReportsCacheState;
        if (!parsed || parsed.version !== REPORTS_CACHE_VERSION || !Array.isArray(parsed.entries)) {
            inMemoryCache = { version: REPORTS_CACHE_VERSION, entries: [] };
            saveState(inMemoryCache);
            return inMemoryCache;
        }

        inMemoryCache = normalizeState(parsed);
        saveState(inMemoryCache);
        return inMemoryCache;
    } catch {
        inMemoryCache = { version: REPORTS_CACHE_VERSION, entries: [] };
        return inMemoryCache;
    }
}

function persistState(state: ReportsCacheState): ReportsCacheState {
    const normalized = normalizeState(state);
    inMemoryCache = normalized;
    saveState(normalized);
    return normalized;
}

export function getReportsDateRangeKey(range: DateRange | undefined): string {
    if (!range?.from) return "";
    const from = format(range.from, "yyyy-MM-dd");
    const to = range.to ? format(range.to, "yyyy-MM-dd") : from;
    return `${from}|${to}`;
}

export function getInitialReportsDateRange(): DateRange | null {
    const state = loadState();
    const latest = state.entries[0];
    if (!latest) return null;
    return toDateRange(latest.dateRange);
}

export function getReportsCache(range: DateRange | undefined): ReportsCacheSnapshot | null {
    const key = getReportsDateRangeKey(range);
    if (!key) return null;

    const state = loadState();
    const entry = state.entries.find(item => item.key === key);
    if (!entry) return null;

    if (isExpired(entry.updatedAt)) {
        persistState({
            version: REPORTS_CACHE_VERSION,
            entries: state.entries.filter(item => item.key !== key),
        });
        return null;
    }

    return {
        key: entry.key,
        schedules: entry.schedules,
        incidences: entry.incidences,
        dateRange: toDateRange(entry.dateRange),
        updatedAt: entry.updatedAt,
    };
}

export function setReportsCache(range: DateRange | undefined, schedules: Schedule[], incidences: DailyIncidence[]): void {
    if (!range?.from) return;

    const dateRange = toPersistedDateRange(range);
    if (!dateRange) return;

    const key = getReportsDateRangeKey(range);
    const state = loadState();
    const nextEntry: ReportsCacheEntry = {
        key,
        schedules,
        incidences,
        dateRange,
        updatedAt: Date.now(),
    };

    const otherEntries = state.entries.filter(entry => entry.key !== key);
    persistState({
        version: REPORTS_CACHE_VERSION,
        entries: [nextEntry, ...otherEntries],
    });
}

export function clearReportsCacheByRange(range: DateRange | undefined): void {
    const key = getReportsDateRangeKey(range);
    if (!key) return;

    const state = loadState();
    persistState({
        version: REPORTS_CACHE_VERSION,
        entries: state.entries.filter(entry => entry.key !== key),
    });
}

export function clearReportsCache(): void {
    persistState({
        version: REPORTS_CACHE_VERSION,
        entries: [],
    });
}
