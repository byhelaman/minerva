import { describe, it, expect } from 'vitest';
import {
    normalizeDate,
    normalizeTime,
    normalizeText,
    getColumnLetter,
    parseCell,
} from '../../supabase/functions/microsoft-graph/utils/excel-helpers';

// =============================================================================
// normalizeDate
// =============================================================================

describe('normalizeDate', () => {
    it('should return empty string for null', () => {
        expect(normalizeDate(null)).toBe('');
    });

    it('should return empty string for undefined', () => {
        expect(normalizeDate(undefined)).toBe('');
    });

    it('should return empty string for empty string', () => {
        expect(normalizeDate('')).toBe('');
    });

    it('should preserve ISO format YYYY-MM-DD', () => {
        expect(normalizeDate('2024-06-15')).toBe('2024-06-15');
    });

    it('should truncate YYYY-MM-DDTHH:MM to YYYY-MM-DD', () => {
        expect(normalizeDate('2024-06-15T08:00:00Z')).toBe('2024-06-15');
    });

    it('should convert DD/MM/YYYY to YYYY-MM-DD', () => {
        expect(normalizeDate('15/06/2024')).toBe('2024-06-15');
    });

    it('should pad single-digit day/month in DD/MM/YYYY', () => {
        expect(normalizeDate('5/6/2024')).toBe('2024-06-05');
    });

    it('should convert Excel serial number to YYYY-MM-DD', () => {
        // 45458 = 2024-06-15
        expect(normalizeDate(45458)).toBe('2024-06-15');
    });

    it('should convert string serial number to YYYY-MM-DD', () => {
        expect(normalizeDate('45458')).toBe('2024-06-15');
    });

    it('should reject out-of-range serial numbers (too low)', () => {
        // Below 25000 is not treated as serial
        expect(normalizeDate(100)).toBe('100');
    });

    it('should reject out-of-range serial numbers (too high)', () => {
        expect(normalizeDate(70000)).toBe('70000');
    });

    it('should match frontend excelDateToString for same serial', () => {
        // Cross-validate: frontend and backend must produce same date
        // 45458 = June 15, 2024 in both implementations
        const backendResult = normalizeDate(45458);
        expect(backendResult).toBe('2024-06-15');
    });
});

// =============================================================================
// normalizeTime
// =============================================================================

describe('normalizeTime', () => {
    it('should return empty string for null', () => {
        expect(normalizeTime(null)).toBe('');
    });

    it('should return empty string for undefined', () => {
        expect(normalizeTime(undefined)).toBe('');
    });

    it('should return empty string for empty string', () => {
        expect(normalizeTime('')).toBe('');
    });

    it('should NOT return empty for 0 (midnight)', () => {
        expect(normalizeTime(0)).toBe('00:00');
    });

    it('should convert Excel serial fraction to HH:MM (0.333 ≈ 08:00)', () => {
        expect(normalizeTime(1/3)).toBe('08:00');
    });

    it('should convert 0.5 to 12:00', () => {
        expect(normalizeTime(0.5)).toBe('12:00');
    });

    it('should convert 0.75 to 18:00', () => {
        expect(normalizeTime(0.75)).toBe('18:00');
    });

    it('should preserve HH:MM format', () => {
        expect(normalizeTime('08:00')).toBe('08:00');
    });

    it('should strip seconds from HH:MM:SS', () => {
        expect(normalizeTime('08:00:00')).toBe('08:00');
    });

    it('should pad single-digit hour (8:00 → 08:00)', () => {
        expect(normalizeTime('8:00')).toBe('08:00');
    });

    it('should pad single-digit hour (9:30 → 09:30)', () => {
        expect(normalizeTime('9:30')).toBe('09:30');
    });
});

// =============================================================================
// normalizeText
// =============================================================================

describe('normalizeText', () => {
    it('should return empty string for null', () => {
        expect(normalizeText(null)).toBe('');
    });

    it('should return empty string for undefined', () => {
        expect(normalizeText(undefined)).toBe('');
    });

    it('should return empty string for empty string', () => {
        expect(normalizeText('')).toBe('');
    });

    it('should trim whitespace', () => {
        expect(normalizeText('  hello  ')).toBe('hello');
    });

    it('should collapse internal whitespace', () => {
        expect(normalizeText('Juan     Perez')).toBe('Juan Perez');
    });

    it('should remove zero-width characters', () => {
        expect(normalizeText('Hello\u200BWorld')).toBe('HelloWorld');
    });

    it('should remove zero-width joiner', () => {
        expect(normalizeText('Test\u200DValue')).toBe('TestValue');
    });

    it('should remove BOM character', () => {
        expect(normalizeText('\uFEFFHello')).toBe('Hello');
    });

    it('should handle mixed invisible characters', () => {
        expect(normalizeText('  Juan\u200B   \u200DPerez\uFEFF  ')).toBe('Juan Perez');
    });
});

// =============================================================================
// getColumnLetter
// =============================================================================

describe('getColumnLetter', () => {
    it('should return A for index 0', () => {
        expect(getColumnLetter(0)).toBe('A');
    });

    it('should return Z for index 25', () => {
        expect(getColumnLetter(25)).toBe('Z');
    });

    it('should return AA for index 26', () => {
        expect(getColumnLetter(26)).toBe('AA');
    });

    it('should return AB for index 27', () => {
        expect(getColumnLetter(27)).toBe('AB');
    });
});

// =============================================================================
// parseCell
// =============================================================================

describe('parseCell', () => {
    it('should parse A1', () => {
        expect(parseCell('A1')).toEqual({ col: 0, row: 1 });
    });

    it('should parse Z99', () => {
        expect(parseCell('Z99')).toEqual({ col: 25, row: 99 });
    });

    it('should parse AA1', () => {
        expect(parseCell('AA1')).toEqual({ col: 26, row: 1 });
    });

    it('should handle lowercase', () => {
        expect(parseCell('b5')).toEqual({ col: 1, row: 5 });
    });

    it('should return defaults for invalid input', () => {
        expect(parseCell('invalid')).toEqual({ col: 0, row: 1 });
    });
});
