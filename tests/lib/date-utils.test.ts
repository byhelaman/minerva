import { describe, it, expect } from 'vitest';
import {
    formatDateToISO,
    parseISODate,
    extractYearMonth,
    formatDateForDisplay,
    formatTimestampForDisplay,
} from '../../src/lib/date-utils';

// =============================================================================
// formatDateToISO
// =============================================================================

describe('formatDateToISO', () => {
    it('should format a standard date', () => {
        // Nota: el mes es base-0 en el constructor de Date en JS
        const date = new Date(2024, 0, 15); // Ene 15, 2024
        expect(formatDateToISO(date)).toBe('2024-01-15');
    });

    it('should pad single-digit month and day', () => {
        const date = new Date(2024, 2, 5); // Mar 5, 2024
        expect(formatDateToISO(date)).toBe('2024-03-05');
    });

    it('should handle last day of year', () => {
        const date = new Date(2024, 11, 31); // Dic 31, 2024
        expect(formatDateToISO(date)).toBe('2024-12-31');
    });
});

// =============================================================================
// parseISODate
// =============================================================================

describe('parseISODate', () => {
    it('should parse ISO date string to Date object', () => {
        const result = parseISODate('2024-06-15');
        expect(result.getFullYear()).toBe(2024);
        expect(result.getMonth()).toBe(5); // Base-0: Junio = 5
        expect(result.getDate()).toBe(15);
    });

    it('should parse beginning of year', () => {
        const result = parseISODate('2024-01-01');
        expect(result.getFullYear()).toBe(2024);
        expect(result.getMonth()).toBe(0);
        expect(result.getDate()).toBe(1);
    });
});

// =============================================================================
// extractYearMonth
// =============================================================================

describe('extractYearMonth', () => {
    it('should extract year and month from ISO date', () => {
        expect(extractYearMonth('2024-06-15')).toEqual({ year: '2024', month: '06' });
    });

    it('should extract from January date', () => {
        expect(extractYearMonth('2023-01-30')).toEqual({ year: '2023', month: '01' });
    });

    it('should extract from December date', () => {
        expect(extractYearMonth('2025-12-01')).toEqual({ year: '2025', month: '12' });
    });
});

// =============================================================================
// formatDateForDisplay
// =============================================================================

describe('formatDateForDisplay', () => {
    it('should convert ISO to DD/MM/YYYY', () => {
        expect(formatDateForDisplay('2024-06-15')).toBe('15/06/2024');
    });

    it('should handle single-digit day in ISO', () => {
        expect(formatDateForDisplay('2024-01-05')).toBe('05/01/2024');
    });

    it('should return empty string for null', () => {
        expect(formatDateForDisplay(null)).toBe('');
    });

    it('should return empty string for undefined', () => {
        expect(formatDateForDisplay(undefined)).toBe('');
    });

    it('should return empty string for empty string', () => {
        expect(formatDateForDisplay('')).toBe('');
    });
});

// =============================================================================
// formatTimestampForDisplay
// =============================================================================

describe('formatTimestampForDisplay', () => {
    it('should format a full ISO timestamp', () => {
        // Usando un timestamp fijo para evitar problemas de zona horaria
        const result = formatTimestampForDisplay('2024-06-15T14:30:00.000Z');
        // La salida exacta depende de la zona horaria local, pero debe contener la fecha
        expect(result).toMatch(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/);
    });

    it('should return empty string for empty input', () => {
        expect(formatTimestampForDisplay('')).toBe('');
    });
});
