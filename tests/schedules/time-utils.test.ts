import { describe, it, expect } from 'vitest';
import {
    parseTimeValue,
    formatTimeTo24h,
    formatTimeTo12Hour,
    ensureTimeFormat,
    parseTimeToMinutes,
} from '../../src/features/schedules/utils/time-utils';

// =============================================================================
// parseTimeValue
// =============================================================================

describe('parseTimeValue', () => {
    describe('Excel serial numbers (numeric)', () => {
        it('should parse 0.5 as 12:00 (noon)', () => {
            const result = parseTimeValue(0.5);
            expect(result).toEqual({ hours: 12, minutes: 0 });
        });

        it('should parse 0.75 as 18:00', () => {
            const result = parseTimeValue(0.75);
            expect(result).toEqual({ hours: 18, minutes: 0 });
        });

        it('should parse 0.0 as 00:00 (midnight)', () => {
            const result = parseTimeValue(0);
            expect(result).toEqual({ hours: 0, minutes: 0 });
        });

        it('should parse 0.354167 as ~08:30', () => {
            // 0.354166... * 24 * 60 = 510 min = 8h 30m
            const result = parseTimeValue(0.354167);
            expect(result).toEqual({ hours: 8, minutes: 30 });
        });

        it('should parse 1.0 as 00:00 (wraps around)', () => {
            // 1.0 * 24 * 60 = 1440 min = 24h = 0h (mod 24)
            const result = parseTimeValue(1.0);
            expect(result).toEqual({ hours: 0, minutes: 0 });
        });
    });

    describe('String numeric serials', () => {
        it('should parse "0.708333" as ~17:00', () => {
            // 0.708333 * 24 * 60 = 1020 min = 17h 0m
            const result = parseTimeValue('0.708333');
            expect(result).toEqual({ hours: 17, minutes: 0 });
        });

        it('should parse "0.5" as 12:00', () => {
            const result = parseTimeValue('0.5');
            expect(result).toEqual({ hours: 12, minutes: 0 });
        });
    });

    describe('AM/PM format', () => {
        it('should parse "2:30 PM" correctly', () => {
            const result = parseTimeValue('2:30 PM');
            expect(result).toEqual({ hours: 14, minutes: 30 });
        });

        it('should parse "8:00 AM" correctly', () => {
            const result = parseTimeValue('8:00 AM');
            expect(result).toEqual({ hours: 8, minutes: 0 });
        });

        it('should parse "12:00 PM" as noon (12:00)', () => {
            const result = parseTimeValue('12:00 PM');
            expect(result).toEqual({ hours: 12, minutes: 0 });
        });

        it('should parse "12:00 AM" as midnight (00:00)', () => {
            const result = parseTimeValue('12:00 AM');
            expect(result).toEqual({ hours: 0, minutes: 0 });
        });

        it('should parse "8:00 a.m." (dot format)', () => {
            const result = parseTimeValue('8:00 a.m.');
            expect(result).toEqual({ hours: 8, minutes: 0 });
        });

        it('should parse "3:45 p.m." (dot format)', () => {
            const result = parseTimeValue('3:45 p.m.');
            expect(result).toEqual({ hours: 15, minutes: 45 });
        });
    });

    describe('24h format', () => {
        it('should parse "14:30"', () => {
            const result = parseTimeValue('14:30');
            expect(result).toEqual({ hours: 14, minutes: 30 });
        });

        it('should parse "08:00"', () => {
            const result = parseTimeValue('08:00');
            expect(result).toEqual({ hours: 8, minutes: 0 });
        });

        it('should parse "0:00"', () => {
            const result = parseTimeValue('0:00');
            expect(result).toEqual({ hours: 0, minutes: 0 });
        });

        it('should parse "23:59"', () => {
            const result = parseTimeValue('23:59');
            expect(result).toEqual({ hours: 23, minutes: 59 });
        });
    });

    describe('Edge cases', () => {
        it('should return { hours: 0, minutes: 0 } for unparseable string', () => {
            const result = parseTimeValue('invalid');
            expect(result).toEqual({ hours: 0, minutes: 0 });
        });

        it('should return { hours: 0, minutes: 0 } for empty string', () => {
            const result = parseTimeValue('');
            expect(result).toEqual({ hours: 0, minutes: 0 });
        });
    });
});

// =============================================================================
// formatTimeTo24h
// =============================================================================

describe('formatTimeTo24h', () => {
    it('should format Excel serial 0.5 to "12:00"', () => {
        expect(formatTimeTo24h(0.5)).toBe('12:00');
    });

    it('should format "2:30 PM" to "14:30"', () => {
        expect(formatTimeTo24h('2:30 PM')).toBe('14:30');
    });

    it('should format "8:00 AM" to "08:00"', () => {
        expect(formatTimeTo24h('8:00 AM')).toBe('08:00');
    });

    it('should format "14:30" to "14:30"', () => {
        expect(formatTimeTo24h('14:30')).toBe('14:30');
    });

    it('should format "0:00" to "00:00"', () => {
        expect(formatTimeTo24h('0:00')).toBe('00:00');
    });

    it('should pad single-digit hours: "9:05" to "09:05"', () => {
        expect(formatTimeTo24h('9:05')).toBe('09:05');
    });
});

// =============================================================================
// formatTimeTo12Hour
// =============================================================================

describe('formatTimeTo12Hour', () => {
    it('should format "14:30" to "02:30 PM"', () => {
        expect(formatTimeTo12Hour('14:30')).toBe('02:30 PM');
    });

    it('should format "08:00" to "08:00 AM"', () => {
        expect(formatTimeTo12Hour('08:00')).toBe('08:00 AM');
    });

    it('should format "00:00" to "12:00 AM" (midnight)', () => {
        expect(formatTimeTo12Hour('0:00')).toBe('12:00 AM');
    });

    it('should format "12:00" to "12:00 PM" (noon)', () => {
        expect(formatTimeTo12Hour('12:00')).toBe('12:00 PM');
    });

    it('should format Excel serial 0.75 to "06:00 PM"', () => {
        expect(formatTimeTo12Hour(0.75)).toBe('06:00 PM');
    });
});

// =============================================================================
// ensureTimeFormat
// =============================================================================

describe('ensureTimeFormat', () => {
    it('should return empty string for null', () => {
        expect(ensureTimeFormat(null)).toBe('');
    });

    it('should return empty string for undefined', () => {
        expect(ensureTimeFormat(undefined)).toBe('');
    });

    it('should return empty string for empty string', () => {
        expect(ensureTimeFormat('')).toBe('');
    });

    it('should normalize "8:30" to "08:30"', () => {
        expect(ensureTimeFormat('8:30')).toBe('08:30');
    });

    it('should pass through "14:30" unchanged', () => {
        expect(ensureTimeFormat('14:30')).toBe('14:30');
    });

    it('should convert decimal string "0.5" to "12:00"', () => {
        expect(ensureTimeFormat('0.5')).toBe('12:00');
    });

    it('should convert number 0.75 to "18:00"', () => {
        expect(ensureTimeFormat(0.75)).toBe('18:00');
    });

    it('should convert number 0 to "00:00"', () => {
        expect(ensureTimeFormat(0)).toBe('00:00');
    });

    it('should handle HH:MM with extra text after it', () => {
        // "14:30:00" → debe tomar las primeras dos partes
        expect(ensureTimeFormat('14:30:00')).toBe('14:30');
    });

    it('should return non-parseable string as-is', () => {
        expect(ensureTimeFormat('foobar')).toBe('foobar');
    });
});

// =============================================================================
// parseTimeToMinutes
// =============================================================================

describe('parseTimeToMinutes', () => {
    it('should convert "00:00" to 0', () => {
        expect(parseTimeToMinutes('00:00')).toBe(0);
    });

    it('should convert "08:30" to 510', () => {
        expect(parseTimeToMinutes('08:30')).toBe(510);
    });

    it('should convert "12:00" to 720', () => {
        expect(parseTimeToMinutes('12:00')).toBe(720);
    });

    it('should convert "23:59" to 1439', () => {
        expect(parseTimeToMinutes('23:59')).toBe(1439);
    });

    it('should convert "14:15" to 855', () => {
        expect(parseTimeToMinutes('14:15')).toBe(855);
    });
});
