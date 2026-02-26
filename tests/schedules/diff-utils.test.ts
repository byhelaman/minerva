import { describe, it, expect } from 'vitest';
import { getFieldDiffs } from '../../src/features/schedules/utils/diff-utils';

// =============================================================================
// Helper
// =============================================================================

const baseImported = {
    shift: 'morning',
    branch: 'HUB',
    end_time: '10:00',
    code: 'C01',
    minutes: '60',
    units: '2',
    status: null as string | null,
    substitute: null as string | null,
    type: null as string | null,
    subtype: null as string | null,
    description: null as string | null,
    department: null as string | null,
    feedback: null as string | null,
};

const baseDb: Record<string, string> = {
    shift: 'morning',
    branch: 'HUB',
    end_time: '10:00',
    code: 'C01',
    minutes: '60',
    units: '2',
    status: '',
    substitute: '',
    type: '',
    subtype: '',
    description: '',
    department: '',
    feedback: '',
};

// =============================================================================
// Identical data (no diffs)
// =============================================================================

describe('getFieldDiffs - identical data', () => {
    it('should return no diffs for identical base fields', () => {
        const diffs = getFieldDiffs(baseImported, baseDb);
        expect(diffs).toEqual([]);
    });

    it('should return no diffs when both have same incidence values', () => {
        const imported = { ...baseImported, type: 'absence', substitute: 'Jane' };
        const db = { ...baseDb, type: 'absence', substitute: 'Jane' };
        expect(getFieldDiffs(imported, db)).toEqual([]);
    });
});

// =============================================================================
// Null/Empty/Undefined equivalence (the core problem)
// =============================================================================

describe('getFieldDiffs - null/empty equivalence', () => {
    it('should treat null imported vs empty DB as identical (no diff)', () => {
        const imported = { ...baseImported, status: null };
        const db = { ...baseDb, status: '' };
        expect(getFieldDiffs(imported, db)).toEqual([]);
    });

    it('should treat undefined imported vs empty DB as identical', () => {
        const imported = { ...baseImported, type: undefined as unknown as null };
        const db = { ...baseDb, type: '' };
        expect(getFieldDiffs(imported, db)).toEqual([]);
    });

    it('should treat empty imported vs empty DB as identical', () => {
        const imported = { ...baseImported, feedback: '' };
        const db = { ...baseDb, feedback: '' };
        expect(getFieldDiffs(imported, db)).toEqual([]);
    });

    it('should treat null imported vs null-ish DB as identical (via ?? fallback)', () => {
        // Simulates when DB returns undefined (e.g., missing key in record)
        const db = { ...baseDb };
        delete (db as Record<string, unknown>).feedback;
        const imported = { ...baseImported, feedback: null };
        expect(getFieldDiffs(imported, db as Record<string, string>)).toEqual([]);
    });

    it('should treat whitespace-only imported vs empty DB as identical', () => {
        const imported = { ...baseImported, description: '   ' };
        const db = { ...baseDb, description: '' };
        expect(getFieldDiffs(imported, db)).toEqual([]);
    });
});

// =============================================================================
// Real differences
// =============================================================================

describe('getFieldDiffs - real differences', () => {
    it('should detect changed base field', () => {
        const imported = { ...baseImported, shift: 'afternoon' };
        const diffs = getFieldDiffs(imported, baseDb);
        expect(diffs).toHaveLength(1);
        expect(diffs[0]).toContain('shift');
        expect(diffs[0]).toContain('morning');
        expect(diffs[0]).toContain('afternoon');
    });

    it('should detect new incidence value (null → value)', () => {
        const imported = { ...baseImported, type: 'absence' };
        const diffs = getFieldDiffs(imported, baseDb);
        expect(diffs).toHaveLength(1);
        expect(diffs[0]).toContain('type');
        expect(diffs[0]).toContain('absence');
    });

    it('should detect removed incidence value (value → empty)', () => {
        const imported = { ...baseImported, type: null };
        const db = { ...baseDb, type: 'absence' };
        const diffs = getFieldDiffs(imported, db);
        expect(diffs).toHaveLength(1);
        expect(diffs[0]).toContain('type');
    });

    it('should detect multiple differences at once', () => {
        const imported = { ...baseImported, shift: 'afternoon', branch: 'LA MOLINA', type: 'late' };
        const diffs = getFieldDiffs(imported, baseDb);
        expect(diffs.length).toBeGreaterThanOrEqual(3);
    });

    it('should handle time format normalization (8:30 vs 08:30)', () => {
        const imported = { ...baseImported, end_time: '8:30' };
        const db = { ...baseDb, end_time: '08:30' };
        const diffs = getFieldDiffs(imported, db);
        // ensureTimeFormat should normalize both — no diff
        expect(diffs).toEqual([]);
    });

    it('should detect actual time difference', () => {
        const imported = { ...baseImported, end_time: '11:00' };
        const db = { ...baseDb, end_time: '10:00' };
        const diffs = getFieldDiffs(imported, db);
        expect(diffs).toHaveLength(1);
        expect(diffs[0]).toContain('end_time');
    });
});

// =============================================================================
// Whitespace normalization in comparison
// =============================================================================

describe('getFieldDiffs - whitespace normalization', () => {
    it('should ignore extra whitespace in imported values', () => {
        const imported = { ...baseImported, code: '  C01  ' };
        const diffs = getFieldDiffs(imported, baseDb);
        expect(diffs).toEqual([]);
    });

    it('should collapse internal spaces before comparing', () => {
        const imported = { ...baseImported, description: 'Late    arrival' };
        const db = { ...baseDb, description: 'Late arrival' };
        const diffs = getFieldDiffs(imported, db);
        expect(diffs).toEqual([]);
    });
});
