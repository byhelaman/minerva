import { describe, it, expect } from 'vitest';
import { mapScheduleToExcelRow } from '../../src/features/schedules/utils/export-utils';
import type { Schedule } from '../../src/features/schedules/types';

// =============================================================================
// Helper
// =============================================================================

function makeSchedule(overrides: Partial<Schedule> = {}): Schedule {
    return {
        date: '2024-06-15',
        shift: 'morning',
        branch: 'HUB',
        start_time: '08:00',
        end_time: '10:00',
        code: 'C01',
        instructor: 'Teacher A',
        program: 'English 101',
        minutes: '60',
        units: '2',
        ...overrides,
    };
}

// =============================================================================
// Output format
// =============================================================================

describe('mapScheduleToExcelRow - output format', () => {
    it('should produce a tab-separated string', () => {
        const result = mapScheduleToExcelRow(makeSchedule());
        expect(result).toContain('\t');
        const columns = result.split('\t');
        expect(columns.length).toBe(15); // 15 columns total
    });

    it('should include date, branch, times, code, instructor, program, minutes, units', () => {
        const result = mapScheduleToExcelRow(makeSchedule());
        const columns = result.split('\t');
        // Column order: date, branch, start_time(12h), end_time(12h), code, instructor, program, minutes, units, status, type, subtype, description, department, substitute
        expect(columns[1]).toBe('HUB');             // branch
        expect(columns[4]).toBe('C01');              // code
        expect(columns[5]).toBe('Teacher A');        // instructor
        expect(columns[6]).toBe('English 101');      // program
        expect(columns[7]).toBe('60');               // minutes
        expect(columns[8]).toBe('2');                // units
    });
});

// =============================================================================
// Null/undefined/empty handling in export
// =============================================================================

describe('mapScheduleToExcelRow - null/undefined handling', () => {
    it('should export null incidence fields as empty strings', () => {
        const schedule = makeSchedule({
            status: null,
            type: null,
            subtype: null,
            description: null,
            department: null,
            substitute: null,
        });
        const result = mapScheduleToExcelRow(schedule);
        const columns = result.split('\t');
        // Last 6 columns should be empty strings
        expect(columns[9]).toBe('');  // status
        expect(columns[10]).toBe(''); // type
        expect(columns[11]).toBe(''); // subtype
        expect(columns[12]).toBe(''); // description
        expect(columns[13]).toBe(''); // department
        expect(columns[14]).toBe(''); // substitute
    });

    it('should export undefined incidence fields as empty strings', () => {
        const schedule = makeSchedule(); // no incidence fields set
        const result = mapScheduleToExcelRow(schedule);
        const columns = result.split('\t');
        expect(columns[9]).toBe('');
        expect(columns[10]).toBe('');
    });

    it('should export actual incidence values', () => {
        const schedule = makeSchedule({
            status: 'suspended',
            type: 'absence',
            substitute: 'Jane',
        });
        const result = mapScheduleToExcelRow(schedule);
        const columns = result.split('\t');
        expect(columns[9]).toBe('suspended');
        expect(columns[10]).toBe('absence');
        expect(columns[14]).toBe('Jane');
    });
});

// =============================================================================
// Branch normalization in export
// =============================================================================

describe('mapScheduleToExcelRow - normalization', () => {
    it('should normalize branch whitespace', () => {
        const schedule = makeSchedule({ branch: '  HUB  ' });
        const result = mapScheduleToExcelRow(schedule);
        const columns = result.split('\t');
        expect(columns[1]).toBe('HUB');
    });

    it('should handle empty branch gracefully', () => {
        const schedule = makeSchedule({ branch: '' });
        const result = mapScheduleToExcelRow(schedule);
        const columns = result.split('\t');
        expect(columns[1]).toBe('');
    });
});
