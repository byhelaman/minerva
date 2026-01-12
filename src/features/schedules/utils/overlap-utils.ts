import { Schedule } from "./excel-parser";

/**
 * Parse time string (HH:MM) to minutes since midnight
 */
function parseTimeToMinutes(time: string): number {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
}

/**
 * Check if two time ranges overlap
 */
function timesOverlap(
    start1: number,
    end1: number,
    start2: number,
    end2: number
): boolean {
    return start1 < end2 && start2 < end1;
}

/**
 * Create unique key for a schedule row
 */
export function getScheduleKey(schedule: Schedule): string {
    return `${schedule.date}|${schedule.start_time}|${schedule.end_time}|${schedule.instructor}|${schedule.program}`;
}

/**
 * Create unique key for duplicate detection (matches v1 python logic)
 */
export function getUniqueScheduleKey(schedule: Schedule): string {
    return `${schedule.date}|${schedule.shift}|${schedule.branch}|${schedule.start_time}|${schedule.end_time}|${schedule.instructor}|${schedule.code}|${schedule.program}`;
}

export interface OverlapResult {
    /** Keys of rows with time conflicts (same instructor, overlapping times) */
    timeConflicts: Set<string>;
    /** Keys of rows with duplicate classes (same class, different instructors) */
    duplicateClasses: Set<string>;
    /** All overlapping keys (union of both) */
    allOverlaps: Set<string>;
    /** Count of overlapping schedules */
    overlapCount: number;
}

/**
 * Detect schedule overlaps
 * @param schedules Array of schedules
 * @returns Sets of keys for different overlap types
 */
export function detectOverlaps(schedules: Schedule[]): OverlapResult {
    const timeConflicts = new Set<string>();
    const duplicateClasses = new Set<string>();

    // Group schedules by date + instructor for time conflict detection
    const byDateInstructor = new Map<string, Schedule[]>();

    // Group by date + start_time + end_time + program for duplicate detection
    const byClassKey = new Map<string, Schedule[]>();

    schedules.forEach((schedule) => {
        // Key for time conflict: same date, same instructor
        const dateInstructorKey = `${schedule.date}|${schedule.instructor}`;
        if (!byDateInstructor.has(dateInstructorKey)) {
            byDateInstructor.set(dateInstructorKey, []);
        }
        byDateInstructor.get(dateInstructorKey)!.push(schedule);

        // Key for duplicate class: same date, time, program (different instructor)
        const classKey = `${schedule.date}|${schedule.start_time}|${schedule.end_time}|${schedule.program}`;
        if (!byClassKey.has(classKey)) {
            byClassKey.set(classKey, []);
        }
        byClassKey.get(classKey)!.push(schedule);
    });

    // Detect time conflicts for same instructor
    byDateInstructor.forEach((group) => {
        if (group.length < 2) return;

        // Check all pairs for time overlap
        for (let i = 0; i < group.length; i++) {
            for (let j = i + 1; j < group.length; j++) {
                const s1 = group[i];
                const s2 = group[j];

                const start1 = parseTimeToMinutes(s1.start_time);
                const end1 = parseTimeToMinutes(s1.end_time);
                const start2 = parseTimeToMinutes(s2.start_time);
                const end2 = parseTimeToMinutes(s2.end_time);

                if (timesOverlap(start1, end1, start2, end2)) {
                    timeConflicts.add(getScheduleKey(s1));
                    timeConflicts.add(getScheduleKey(s2));
                }
            }
        }
    });

    // Detect duplicate classes (same class, different instructors)
    byClassKey.forEach((group) => {
        if (group.length < 2) return;

        // Check if there are different instructors
        const instructors = new Set(group.map((s) => s.instructor));
        if (instructors.size > 1) {
            group.forEach((s) => duplicateClasses.add(getScheduleKey(s)));
        }
    });

    // Compute union
    const allOverlaps = new Set([...timeConflicts, ...duplicateClasses]);

    return {
        timeConflicts,
        duplicateClasses,
        allOverlaps,
        overlapCount: allOverlaps.size,
    };
}
