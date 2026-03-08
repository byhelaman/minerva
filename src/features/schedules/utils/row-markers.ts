import type { Schedule } from "@/features/schedules/types";
import { getSchedulePrimaryKey } from "@/features/schedules/utils/string-utils";

export const ROW_MARKERS_STORAGE_KEY = "minerva_schedule_row_markers";
export const ROW_MARKERS_UPDATED_EVENT = "minerva:row-markers-updated";

export const ROW_MARKER_COLORS = [
    { value: "gray", label: "Gray" },
    { value: "yellow", label: "Yellow" },
    { value: "blue", label: "Blue" },
    { value: "red", label: "Red" },
    { value: "green", label: "Green" },
    { value: "pink", label: "Pink" },
    { value: "purple", label: "Purple" },
    { value: "cyan", label: "Cyan" },
    { value: "orange", label: "Orange" },
] as const;

export type RowMarkerColor = (typeof ROW_MARKER_COLORS)[number]["value"];

export interface ScheduleRowMarker {
    color: RowMarkerColor;
    comment: string;
    updated_at: string;
}

function readAllMarkers(): Record<string, ScheduleRowMarker> {
    try {
        const raw = localStorage.getItem(ROW_MARKERS_STORAGE_KEY);
        if (!raw) return {};

        const parsed = JSON.parse(raw) as Record<string, ScheduleRowMarker>;
        if (!parsed || typeof parsed !== "object") return {};
        return parsed;
    } catch {
        return {};
    }
}

function persistMarkers(markers: Record<string, ScheduleRowMarker>) {
    localStorage.setItem(ROW_MARKERS_STORAGE_KEY, JSON.stringify(markers));
    window.dispatchEvent(new CustomEvent(ROW_MARKERS_UPDATED_EVENT));
}

export function isScheduleLike(row: unknown): row is Schedule {
    if (!row || typeof row !== "object") return false;

    const candidate = row as Partial<Schedule>;
    return typeof candidate.date === "string"
        && typeof candidate.start_time === "string"
        && typeof candidate.instructor === "string"
        && typeof candidate.program === "string";
}

export function getScheduleRowMarker(schedule: Schedule): ScheduleRowMarker | null {
    const markers = readAllMarkers();
    const key = getSchedulePrimaryKey(schedule);
    return markers[key] ?? null;
}

export function upsertScheduleRowMarker(schedule: Schedule, marker: Omit<ScheduleRowMarker, "updated_at">) {
    const markers = readAllMarkers();
    const key = getSchedulePrimaryKey(schedule);
    markers[key] = {
        ...marker,
        updated_at: new Date().toISOString(),
    };
    persistMarkers(markers);
}

export function removeScheduleRowMarker(schedule: Schedule) {
    const markers = readAllMarkers();
    const key = getSchedulePrimaryKey(schedule);
    if (!(key in markers)) return;
    delete markers[key];
    persistMarkers(markers);
}

export function getMarkerRowClass(color: RowMarkerColor): string {
    switch (color) {
        case "gray":
            return "bg-slate-100/70 dark:bg-slate-950/20 border-l-2 border-l-slate-500";
        case "blue":
            return "bg-blue-50/70 dark:bg-blue-950/20 border-l-2 border-l-blue-500";
        case "red":
            return "bg-rose-50/70 dark:bg-rose-950/20 border-l-2 border-l-rose-500";
        case "green":
            return "bg-emerald-50/70 dark:bg-emerald-950/20 border-l-2 border-l-emerald-500";
        case "pink":
            return "bg-pink-50/70 dark:bg-pink-950/20 border-l-2 border-l-pink-500";
        case "purple":
            return "bg-violet-50/70 dark:bg-violet-950/20 border-l-2 border-l-violet-500";
        case "cyan":
            return "bg-cyan-50/70 dark:bg-cyan-950/20 border-l-2 border-l-cyan-500";
        case "orange":
            return "bg-orange-50/70 dark:bg-orange-950/20 border-l-2 border-l-orange-500";
        case "yellow":
        default:
            return "bg-amber-50/70 dark:bg-amber-950/20 border-l-2 border-l-amber-500";
    }
}

export function getMarkerBadgeClass(color: RowMarkerColor): string {
    switch (color) {
        case "gray":
            return "border-slate-500/50 text-slate-700 bg-slate-500/10 dark:text-slate-300 dark:border-slate-400/50";
        case "blue":
            return "border-blue-500/50 text-blue-600 bg-blue-500/10 dark:text-blue-400";
        case "red":
            return "border-rose-500/50 text-rose-600 bg-rose-500/10 dark:text-rose-400";
        case "green":
            return "border-emerald-500/50 text-emerald-600 bg-emerald-500/10 dark:text-emerald-400";
        case "pink":
            return "border-pink-500/50 text-pink-600 bg-pink-500/10 dark:text-pink-400";
        case "purple":
            return "border-violet-500/50 text-violet-600 bg-violet-500/10 dark:text-violet-400";
        case "cyan":
            return "border-cyan-500/50 text-cyan-600 bg-cyan-500/10 dark:text-cyan-400";
        case "orange":
            return "border-orange-500/50 text-orange-600 bg-orange-500/10 dark:text-orange-400";
        case "yellow":
        default:
            return "border-amber-500/50 text-amber-600 bg-amber-500/10 dark:text-amber-400";
    }
}

export function getMarkerSwatchClass(color: RowMarkerColor): string {
    switch (color) {
        case "gray":
            return "bg-slate-400 border-slate-300 dark:border-slate-500";
        case "blue":
            return "bg-blue-500 border-blue-300 dark:border-blue-500";
        case "red":
            return "bg-rose-500 border-rose-300 dark:border-rose-500";
        case "green":
            return "bg-emerald-500 border-emerald-300 dark:border-emerald-500";
        case "pink":
            return "bg-pink-500 border-pink-300 dark:border-pink-500";
        case "purple":
            return "bg-violet-500 border-violet-300 dark:border-violet-500";
        case "cyan":
            return "bg-cyan-500 border-cyan-300 dark:border-cyan-500";
        case "orange":
            return "bg-orange-500 border-orange-300 dark:border-orange-500";
        case "yellow":
        default:
            return "bg-amber-500 border-amber-300 dark:border-amber-500";
    }
}