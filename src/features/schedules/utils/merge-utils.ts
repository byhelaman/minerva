import { Schedule, DailyIncidence } from '../types';
import { ensureTimeFormat } from './time-utils';

/**
 * Merge incidences on top of schedules using composite key:
 * date + time + instructor + program
 */
export function mergeSchedulesWithIncidences(
    schedules: Schedule[],
    incidences: DailyIncidence[]
): Schedule[] {
    // 1. Build a lookup map for incidences (O(M))
    const incidenceMap = new Map<string, DailyIncidence>();

    for (const inc of incidences) {
        // Fast composite key with normalized values for safety
        const time = ensureTimeFormat(inc.start_time);
        const instructor = (inc.instructor || '').trim();
        const program = (inc.program || '').trim();
        const key = `${inc.date}|${time}|${instructor}|${program}`;
        
        incidenceMap.set(key, inc);
    }

    // 2. Map schedules with O(1) lookup (O(N))
    return schedules.map(sch => {
        const time = ensureTimeFormat(sch.start_time);
        const instructor = (sch.instructor || '').trim();
        const program = (sch.program || '').trim();
        
        const key = `${sch.date}|${time}|${instructor}|${program}`;

        const match = incidenceMap.get(key);
        return match ? { ...sch, ...match } : sch;
    });
}
