import { Schedule, DailyIncidence } from '../types';

/**
 * Merge incidences on top of schedules using composite key:
 * date + program + start_time + instructor
 */
export function mergeSchedulesWithIncidences(
    schedules: Schedule[],
    incidences: DailyIncidence[]
): Schedule[] {
    return schedules.map(sch => {
        const match = incidences.find(inc =>
            inc.date === sch.date &&
            inc.program === sch.program &&
            inc.start_time === sch.start_time &&
            inc.instructor === sch.instructor
        );
        return match ? { ...sch, ...match } : sch;
    });
}
