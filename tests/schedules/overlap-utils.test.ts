import { describe, it, expect } from 'vitest';
import {
    detectOverlaps,
    getScheduleKey,
    getUniqueScheduleKey,
} from '../../src/features/schedules/utils/overlap-utils';
import type { Schedule } from '../../src/features/schedules/types';

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

// =============================================================================
// getScheduleKey
// =============================================================================

describe('getScheduleKey', () => {
    it('should produce consistent key from schedule fields', () => {
        const schedule = makeSchedule({});
        const key = getScheduleKey(schedule);
        expect(key).toBe('2024-06-15|08:00|10:00|Instructor A|Program X');
    });

    it('should produce different keys for different programs', () => {
        const s1 = makeSchedule({ program: 'Program A' });
        const s2 = makeSchedule({ program: 'Program B' });
        expect(getScheduleKey(s1)).not.toBe(getScheduleKey(s2));
    });

    it('should produce different keys for different times', () => {
        const s1 = makeSchedule({ start_time: '08:00' });
        const s2 = makeSchedule({ start_time: '09:00' });
        expect(getScheduleKey(s1)).not.toBe(getScheduleKey(s2));
    });
});

// =============================================================================
// getUniqueScheduleKey
// =============================================================================

describe('getUniqueScheduleKey', () => {
    it('should include shift, branch, and code in the key', () => {
        const schedule = makeSchedule({});
        const key = getUniqueScheduleKey(schedule);
        expect(key).toBe('2024-06-15|morning|main|08:00|10:00|Instructor A|C001|Program X');
    });

    it('should produce different keys for different branches', () => {
        const s1 = makeSchedule({ branch: 'main' });
        const s2 = makeSchedule({ branch: 'secondary' });
        expect(getUniqueScheduleKey(s1)).not.toBe(getUniqueScheduleKey(s2));
    });
});

// =============================================================================
// detectOverlaps
// =============================================================================

describe('detectOverlaps', () => {
    it('should return empty sets for non-overlapping schedules', () => {
        const schedules = [
            makeSchedule({ start_time: '08:00', end_time: '10:00', instructor: 'A' }),
            makeSchedule({ start_time: '10:00', end_time: '12:00', instructor: 'A' }),
        ];

        const result = detectOverlaps(schedules);
        expect(result.timeConflicts.size).toBe(0);
        expect(result.duplicateClasses.size).toBe(0);
        expect(result.overlapCount).toBe(0);
    });

    it('should detect time conflicts for same instructor', () => {
        const schedules = [
            makeSchedule({ start_time: '08:00', end_time: '10:00', instructor: 'A', program: 'P1' }),
            makeSchedule({ start_time: '09:00', end_time: '11:00', instructor: 'A', program: 'P2' }),
        ];

        const result = detectOverlaps(schedules);
        expect(result.timeConflicts.size).toBe(2);
        expect(result.overlapCount).toBe(2);
    });

    it('should NOT detect time conflicts for different instructors', () => {
        const schedules = [
            makeSchedule({ start_time: '08:00', end_time: '10:00', instructor: 'A', program: 'P1' }),
            makeSchedule({ start_time: '09:00', end_time: '11:00', instructor: 'B', program: 'P2' }),
        ];

        const result = detectOverlaps(schedules);
        expect(result.timeConflicts.size).toBe(0);
    });

    it('should NOT detect time conflicts for different dates', () => {
        const schedules = [
            makeSchedule({ date: '2024-06-15', start_time: '08:00', end_time: '10:00', instructor: 'A' }),
            makeSchedule({ date: '2024-06-16', start_time: '08:00', end_time: '10:00', instructor: 'A' }),
        ];

        const result = detectOverlaps(schedules);
        expect(result.timeConflicts.size).toBe(0);
    });

    it('should detect duplicate classes (same class, different instructors)', () => {
        const schedules = [
            makeSchedule({ start_time: '08:00', end_time: '10:00', instructor: 'A', program: 'Shared' }),
            makeSchedule({ start_time: '08:00', end_time: '10:00', instructor: 'B', program: 'Shared' }),
        ];

        const result = detectOverlaps(schedules);
        expect(result.duplicateClasses.size).toBe(2);
    });

    it('should NOT flag same class/same instructor as duplicate', () => {
        const schedules = [
            makeSchedule({ start_time: '08:00', end_time: '10:00', instructor: 'A', program: 'Shared' }),
            makeSchedule({ start_time: '08:00', end_time: '10:00', instructor: 'A', program: 'Shared' }),
        ];

        const result = detectOverlaps(schedules);
        // Mismo instructor + misma clase → no es "clase duplicada" por definición
        expect(result.duplicateClasses.size).toBe(0);
        // Los conflictos de horario SÍ se detectan pero ambos producen la misma clave
        // (misma fecha|inicio|fin|instructor|programa), así que el Set contiene solo 1 entrada
        expect(result.timeConflicts.size).toBe(1);
    });

    it('should compute allOverlaps as union of both types', () => {
        const schedules = [
            makeSchedule({ start_time: '08:00', end_time: '10:00', instructor: 'A', program: 'P1' }),
            makeSchedule({ start_time: '09:00', end_time: '11:00', instructor: 'A', program: 'P2' }),
            makeSchedule({ start_time: '08:00', end_time: '10:00', instructor: 'B', program: 'P1' }),
        ];

        const result = detectOverlaps(schedules);
        // Conflictos de horario: A/P1 vs A/P2 → 2 claves
        // Clases duplicadas: A/P1 vs B/P1 → 2 claves (mismo horario, programa, diferente instructor)
        expect(result.allOverlaps.size).toBeGreaterThan(0);
        expect(result.overlapCount).toBe(result.allOverlaps.size);
    });

    it('should return empty for single schedule', () => {
        const schedules = [makeSchedule({})];
        const result = detectOverlaps(schedules);
        expect(result.overlapCount).toBe(0);
    });

    it('should return empty for empty array', () => {
        const result = detectOverlaps([]);
        expect(result.overlapCount).toBe(0);
    });
});
