import { describe, it, expect } from 'vitest';
import { mergeSchedulesWithIncidences } from '../../src/features/schedules/utils/merge-utils';
import type { Schedule, DailyIncidence } from '../../src/features/schedules/types';

// Helper para crear un schedule mínimo
function makeSchedule(overrides: Partial<Schedule>): Schedule {
    return {
        date: '2024-06-15',
        shift: 'morning',
        branch: 'main',
        start_time: '08:00',
        end_time: '10:00',
        code: 'C001',
        instructor: 'Instructor A',
        program: 'Program X',
        minutes: '120',
        units: '2',
        ...overrides,
    };
}

describe('mergeSchedulesWithIncidences', () => {
    it('should return schedules unchanged when no incidences match', () => {
        const schedules = [
            makeSchedule({ program: 'P1', instructor: 'A' }),
            makeSchedule({ program: 'P2', instructor: 'B' }),
        ];
        const incidences: DailyIncidence[] = [];

        const result = mergeSchedulesWithIncidences(schedules, incidences);
        expect(result).toHaveLength(2);
        expect(result[0].status).toBeUndefined();
        expect(result[1].status).toBeUndefined();
    });

    it('should merge matching incidence onto schedule', () => {
        const schedules = [
            makeSchedule({ date: '2024-06-15', program: 'P1', start_time: '08:00', instructor: 'A' }),
        ];
        const incidences: DailyIncidence[] = [
            makeSchedule({
                date: '2024-06-15',
                program: 'P1',
                start_time: '08:00',
                instructor: 'A',
                status: 'suspended',
                substitute: 'Jane',
                type: 'absence',
            }),
        ];

        const result = mergeSchedulesWithIncidences(schedules, incidences);
        expect(result[0].status).toBe('suspended');
        expect(result[0].substitute).toBe('Jane');
        expect(result[0].type).toBe('absence');
    });

    it('should not merge when key does not match (different program)', () => {
        const schedules = [
            makeSchedule({ program: 'P1', instructor: 'A' }),
        ];
        const incidences: DailyIncidence[] = [
            makeSchedule({
                program: 'P2', // Programa diferente
                instructor: 'A',
                status: 'suspended',
            }),
        ];

        const result = mergeSchedulesWithIncidences(schedules, incidences);
        expect(result[0].status).toBeUndefined();
    });

    it('should not merge when key does not match (different instructor)', () => {
        const schedules = [
            makeSchedule({ program: 'P1', instructor: 'A' }),
        ];
        const incidences: DailyIncidence[] = [
            makeSchedule({
                program: 'P1',
                instructor: 'B', // Instructor diferente
                status: 'suspended',
            }),
        ];

        const result = mergeSchedulesWithIncidences(schedules, incidences);
        expect(result[0].status).toBeUndefined();
    });

    it('should handle multiple schedules with partial incidence matches', () => {
        const schedules = [
            makeSchedule({ program: 'P1', instructor: 'A', start_time: '08:00' }),
            makeSchedule({ program: 'P2', instructor: 'B', start_time: '10:00' }),
            makeSchedule({ program: 'P3', instructor: 'C', start_time: '12:00' }),
        ];
        const incidences: DailyIncidence[] = [
            makeSchedule({
                program: 'P2',
                instructor: 'B',
                start_time: '10:00',
                status: 'late',
                description: 'Arrived 15 min late',
            }),
        ];

        const result = mergeSchedulesWithIncidences(schedules, incidences);
        expect(result[0].status).toBeUndefined();
        expect(result[1].status).toBe('late');
        expect(result[1].description).toBe('Arrived 15 min late');
        expect(result[2].status).toBeUndefined();
    });

    it('should handle empty schedules array', () => {
        const result = mergeSchedulesWithIncidences([], []);
        expect(result).toHaveLength(0);
    });

    it('should preserve original schedule fields after merge', () => {
        const schedules = [
            makeSchedule({ program: 'P1', instructor: 'A', code: 'X99', minutes: '60' }),
        ];
        const incidences: DailyIncidence[] = [
            makeSchedule({
                program: 'P1',
                instructor: 'A',
                status: 'replaced',
                substitute: 'NewTeacher',
            }),
        ];

        const result = mergeSchedulesWithIncidences(schedules, incidences);
        // Los campos originales deben preservarse (o ser sobreescritos por el spread de incidencia)
        expect(result[0].program).toBe('P1');
        expect(result[0].status).toBe('replaced');
        expect(result[0].substitute).toBe('NewTeacher');
    });
});
