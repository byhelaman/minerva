import { describe, it, expect } from 'vitest';
import { getFieldDiffs } from '../../src/features/schedules/utils/diff-utils';

// =============================================================================
// Helper — only base schedule fields (incidence fields deprecated)
// =============================================================================

const baseImported = {
    shift: 'morning',
    branch: 'HUB',
    end_time: '10:00',
    code: 'C01',
    minutes: '60',
    units: '2',
};

const baseDb: Record<string, string> = {
    shift: 'morning',
    branch: 'HUB',
    end_time: '10:00',
    code: 'C01',
    minutes: '60',
    units: '2',
};

// =============================================================================
// Identical data (no diffs)
// =============================================================================

describe('getFieldDiffs - identical data', () => {
    it('should return no diffs for identical base fields', () => {
        const diffs = getFieldDiffs(baseImported, baseDb);
        expect(diffs).toEqual([]);
    });
});

// =============================================================================
// Null/Empty/Undefined equivalence
// =============================================================================

describe('getFieldDiffs - null/empty equivalence', () => {
    it('should treat null imported vs empty DB as identical (no diff)', () => {
        const imported = { ...baseImported, shift: null as unknown as string };
        const db = { ...baseDb, shift: '' };
        expect(getFieldDiffs(imported, db)).toEqual([]);
    });

    it('should treat undefined imported vs empty DB as identical', () => {
        const imported = { ...baseImported, code: undefined as unknown as string };
        const db = { ...baseDb, code: '' };
        expect(getFieldDiffs(imported, db)).toEqual([]);
    });

    it('should treat empty imported vs empty DB as identical', () => {
        const imported = { ...baseImported, code: '' };
        const db = { ...baseDb, code: '' };
        expect(getFieldDiffs(imported, db)).toEqual([]);
    });

    it('should treat null imported vs missing DB key as identical (via ?? fallback)', () => {
        const db = { ...baseDb };
        delete (db as Record<string, unknown>).code;
        const imported = { ...baseImported, code: null as unknown as string };
        expect(getFieldDiffs(imported, db as Record<string, string>)).toEqual([]);
    });

    it('should treat whitespace-only imported vs empty DB as identical', () => {
        const imported = { ...baseImported, branch: '   ' };
        const db = { ...baseDb, branch: '' };
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

    it('should detect changed branch', () => {
        const imported = { ...baseImported, branch: 'LA MOLINA' };
        const diffs = getFieldDiffs(imported, baseDb);
        expect(diffs).toHaveLength(1);
        expect(diffs[0]).toContain('branch');
    });

    it('should detect multiple differences at once', () => {
        const imported = { ...baseImported, shift: 'afternoon', branch: 'LA MOLINA', code: 'C99' };
        const diffs = getFieldDiffs(imported, baseDb);
        expect(diffs.length).toBe(3);
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
        const imported = { ...baseImported, branch: 'LA    MOLINA' };
        const db = { ...baseDb, branch: 'LA MOLINA' };
        const diffs = getFieldDiffs(imported, db);
        expect(diffs).toEqual([]);
    });
});
