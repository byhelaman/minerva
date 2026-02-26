import { describe, it, expect } from 'vitest';
import {
    normalizeString,
    emptyToNull,
    getSchedulePrimaryKey,
} from '../../src/features/schedules/utils/string-utils';

// =============================================================================
// normalizeString
// =============================================================================

describe('normalizeString', () => {
    it('should return empty string for null', () => {
        expect(normalizeString(null)).toBe('');
    });

    it('should return empty string for undefined', () => {
        expect(normalizeString(undefined)).toBe('');
    });

    it('should return empty string for empty string', () => {
        expect(normalizeString('')).toBe('');
    });

    it('should trim leading/trailing whitespace', () => {
        expect(normalizeString('  hello  ')).toBe('hello');
    });

    it('should collapse multiple internal spaces to one', () => {
        expect(normalizeString('Juan     Perez')).toBe('Juan Perez');
    });

    it('should collapse tabs and newlines to single space', () => {
        expect(normalizeString('Hello\t\tWorld\nFoo')).toBe('Hello World Foo');
    });

    it('should collapse non-breaking spaces (\\xA0) to single space', () => {
        expect(normalizeString('Hello\u00A0\u00A0World')).toBe('Hello World');
    });

    it('should handle strings with only whitespace', () => {
        expect(normalizeString('   ')).toBe('');
    });

    it('should preserve already-clean strings', () => {
        expect(normalizeString('Clean Text')).toBe('Clean Text');
    });

    it('should handle mixed whitespace types', () => {
        expect(normalizeString('  Juan \t  \u00A0  Perez  ')).toBe('Juan Perez');
    });
});

// =============================================================================
// emptyToNull
// =============================================================================

describe('emptyToNull', () => {
    it('should return null for null input', () => {
        expect(emptyToNull(null)).toBeNull();
    });

    it('should return null for undefined input', () => {
        expect(emptyToNull(undefined)).toBeNull();
    });

    it('should return null for empty string', () => {
        expect(emptyToNull('')).toBeNull();
    });

    it('should return null for whitespace-only string', () => {
        expect(emptyToNull('   ')).toBeNull();
    });

    it('should return null for tab-only string', () => {
        expect(emptyToNull('\t\t')).toBeNull();
    });

    it('should preserve non-empty strings', () => {
        expect(emptyToNull('hello')).toBe('hello');
    });

    it('should normalize before checking emptiness', () => {
        expect(emptyToNull('  hello  ')).toBe('hello');
    });

    it('should collapse whitespace before returning', () => {
        expect(emptyToNull('Juan     Perez')).toBe('Juan Perez');
    });

    it('should NOT convert the string "0" to null (unlike || null)', () => {
        expect(emptyToNull('0')).toBe('0');
    });

    it('should NOT convert the string "false" to null', () => {
        expect(emptyToNull('false')).toBe('false');
    });

    it('should return null for non-breaking space only', () => {
        expect(emptyToNull('\u00A0')).toBeNull();
    });
});

// =============================================================================
// getSchedulePrimaryKey
// =============================================================================

describe('getSchedulePrimaryKey', () => {
    it('should produce standard key format: date|time|instructor|program', () => {
        const key = getSchedulePrimaryKey({
            date: '2024-06-15',
            start_time: '08:00',
            instructor: 'Teacher A',
            program: 'English 101',
        });
        expect(key).toBe('2024-06-15|08:00|Teacher A|English 101');
    });

    it('should fallback empty instructor to "none"', () => {
        const key = getSchedulePrimaryKey({
            date: '2024-06-15',
            start_time: '08:00',
            instructor: '',
            program: 'English 101',
        });
        expect(key).toBe('2024-06-15|08:00|none|English 101');
    });

    it('should fallback null instructor to "none"', () => {
        const key = getSchedulePrimaryKey({
            date: '2024-06-15',
            start_time: '08:00',
            instructor: undefined,
            program: 'English 101',
        });
        expect(key).toBe('2024-06-15|08:00|none|English 101');
    });

    it('should fallback whitespace-only instructor to "none"', () => {
        const key = getSchedulePrimaryKey({
            date: '2024-06-15',
            start_time: '08:00',
            instructor: '   ',
            program: 'English 101',
        });
        expect(key).toBe('2024-06-15|08:00|none|English 101');
    });

    it('should normalize instructor whitespace', () => {
        const key = getSchedulePrimaryKey({
            date: '2024-06-15',
            start_time: '08:00',
            instructor: '  Juan     Perez  ',
            program: 'English 101',
        });
        expect(key).toBe('2024-06-15|08:00|Juan Perez|English 101');
    });

    it('should normalize program whitespace', () => {
        const key = getSchedulePrimaryKey({
            date: '2024-06-15',
            start_time: '08:00',
            instructor: 'Teacher',
            program: '  English    101  ',
        });
        expect(key).toBe('2024-06-15|08:00|Teacher|English 101');
    });

    it('should pad single-digit hour via ensureTimeFormat', () => {
        const key = getSchedulePrimaryKey({
            date: '2024-06-15',
            start_time: '8:00',
            instructor: 'Teacher',
            program: 'Math',
        });
        expect(key).toBe('2024-06-15|08:00|Teacher|Math');
    });

    it('should produce same key for equivalent dirty/clean inputs', () => {
        const dirty = getSchedulePrimaryKey({
            date: '2024-06-15',
            start_time: '8:00',
            instructor: '  Juan   Perez  ',
            program: '  English    101  ',
        });
        const clean = getSchedulePrimaryKey({
            date: '2024-06-15',
            start_time: '08:00',
            instructor: 'Juan Perez',
            program: 'English 101',
        });
        expect(dirty).toBe(clean);
    });

    it('should handle all-empty row gracefully', () => {
        const key = getSchedulePrimaryKey({});
        expect(key).toBe('||none|');
    });
});
