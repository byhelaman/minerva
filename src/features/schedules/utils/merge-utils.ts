import { Schedule, DailyIncidence } from '../types';

/**
 * Merge incidences on top of schedules using composite key:
 * date + program + start_time + instructor
 */
export function mergeSchedulesWithIncidences(
    schedules: Schedule[],
    incidences: DailyIncidence[]
): Schedule[] {
    // 1. Build a lookup map for incidences (O(M))
    const incidenceMap = new Map<string, DailyIncidence>();

    for (const inc of incidences) {
        // Fast composite key
        const key = `${inc.date}|${inc.program}|${inc.start_time}|${inc.instructor}`;
        incidenceMap.set(key, inc);
    }

    // 2. Map schedules with O(1) lookup (O(N))
    return schedules.map(sch => {
        const key = `${sch.date}|${sch.program}|${sch.start_time}|${sch.instructor}`;
        const match = incidenceMap.get(key);
        return match ? { ...sch, ...match } : sch;
    });
}
