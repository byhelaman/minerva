import { describe, it, expect } from 'vitest';
import { ScheduleSchema } from '../../src/features/schedules/schemas/schedule-schema';

// =============================================================================
// Valid data
// =============================================================================

describe('ScheduleSchema - Valid data', () => {
    it('should accept a fully valid schedule entry', () => {
        const input = {
            date: '2024-06-15',
            start_time: '08:00',
            end_time: '10:00',
            program: 'English Advanced L5',
            minutes: '120',
            units: '2',
        };
        const result = ScheduleSchema.safeParse(input);
        expect(result.success).toBe(true);
    });

    it('should apply defaults for optional fields', () => {
        const input = {
            date: '2024-01-01',
            start_time: '09:00',
            end_time: '11:00',
            program: 'Math 101',
        };
        const result = ScheduleSchema.safeParse(input);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.shift).toBe('');
            expect(result.data.branch).toBe('');
            expect(result.data.code).toBe('');
            expect(result.data.instructor).toBe('');
            expect(result.data.minutes).toBe('0');
            expect(result.data.units).toBe('0');
        }
    });

    it('should accept incidence fields as optional', () => {
        const input = {
            date: '2024-06-15',
            start_time: '08:00',
            end_time: '10:00',
            program: 'English',
            status: 'suspended',
            substitute: 'Jane',
            type: 'absence',
        };
        const result = ScheduleSchema.safeParse(input);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.status).toBe('suspended');
            expect(result.data.substitute).toBe('Jane');
            expect(result.data.type).toBe('absence');
        }
    });
});

// =============================================================================
// Invalid data
// =============================================================================

describe('ScheduleSchema - Invalid data', () => {
    it('should reject invalid date format (DD/MM/YYYY)', () => {
        const input = {
            date: '15/06/2024',  // Formato incorrecto
            start_time: '08:00',
            end_time: '10:00',
            program: 'English',
        };
        const result = ScheduleSchema.safeParse(input);
        expect(result.success).toBe(false);
    });

    it('should reject semantically invalid date (2024-02-30)', () => {
        const input = {
            date: '2024-02-30',  // 30 de febrero no existe
            start_time: '08:00',
            end_time: '10:00',
            program: 'English',
        };
        const result = ScheduleSchema.safeParse(input);
        expect(result.success).toBe(false);
    });

    it('should reject invalid time format (8:00 AM)', () => {
        const input = {
            date: '2024-06-15',
            start_time: '8:00 AM',  // No es formato de hora ISO
            end_time: '10:00',
            program: 'English',
        };
        const result = ScheduleSchema.safeParse(input);
        expect(result.success).toBe(false);
    });

    it('should reject missing program', () => {
        const input = {
            date: '2024-06-15',
            start_time: '08:00',
            end_time: '10:00',
            // programa faltante
        };
        const result = ScheduleSchema.safeParse(input);
        expect(result.success).toBe(false);
    });

    it('should reject empty program', () => {
        const input = {
            date: '2024-06-15',
            start_time: '08:00',
            end_time: '10:00',
            program: '',
        };
        const result = ScheduleSchema.safeParse(input);
        expect(result.success).toBe(false);
    });

    it('should reject non-numeric minutes', () => {
        const input = {
            date: '2024-06-15',
            start_time: '08:00',
            end_time: '10:00',
            program: 'English',
            minutes: 'abc',
        };
        const result = ScheduleSchema.safeParse(input);
        expect(result.success).toBe(false);
    });

    it('should reject non-numeric units', () => {
        const input = {
            date: '2024-06-15',
            start_time: '08:00',
            end_time: '10:00',
            program: 'English',
            units: 'two',
        };
        const result = ScheduleSchema.safeParse(input);
        expect(result.success).toBe(false);
    });

    it('should reject time with seconds (HH:MM:SS not accepted)', () => {
        const input = {
            date: '2024-06-15',
            start_time: '08:00:00',  // precision: -1 significa sin segundos
            end_time: '10:00',
            program: 'English',
        };
        const result = ScheduleSchema.safeParse(input);
        expect(result.success).toBe(false);
    });
});
