import { describe, it, expect, vi } from 'vitest';
import { buildIssueRowKeys, type DbValidationResult } from '../../src/features/schedules/utils/db-validation-utils';
import { detectImportOverlaps } from '../../src/features/schedules/utils/overlap-utils';
import type { Schedule } from '../../src/features/schedules/types';
import { getSchedulePrimaryKey } from '../../src/features/schedules/utils/string-utils';

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
// detectImportOverlaps — Categorizes import rows as new/update/duplicate
// =============================================================================

describe('detectImportOverlaps - categorization', () => {
    const normalizer = (s: Schedule) => getSchedulePrimaryKey(s);

    it('should classify all rows as "new" when DB is empty', () => {
        const data = [
            makeSchedule({ program: 'P1' }),
            makeSchedule({ program: 'P2' }),
        ];
        const result = detectImportOverlaps(data, new Set(), normalizer);

        expect(result.newCount).toBe(2);
        expect(result.updateCount).toBe(0);
        expect(result.duplicateCount).toBe(0);
    });

    it('should classify all rows as "update" when all exist in DB', () => {
        const data = [
            makeSchedule({ program: 'P1' }),
            makeSchedule({ program: 'P2' }),
        ];
        const existingKeys = new Set(data.map(normalizer));
        const result = detectImportOverlaps(data, existingKeys, normalizer);

        expect(result.newCount).toBe(0);
        expect(result.updateCount).toBe(2);
        expect(result.duplicateCount).toBe(0);
    });

    it('should detect intra-file duplicates', () => {
        const data = [
            makeSchedule({ program: 'P1' }),
            makeSchedule({ program: 'P1' }),  // duplicate of first
            makeSchedule({ program: 'P1' }),  // another duplicate
        ];
        const result = detectImportOverlaps(data, new Set(), normalizer);

        expect(result.newCount).toBe(1);         // first occurrence
        expect(result.duplicateCount).toBe(2);   // two duplicates
        expect(result.intraFileDuplicateKeys.size).toBe(1);
    });

    it('should correctly mix new + update + duplicate', () => {
        const existing = makeSchedule({ program: 'P1' });
        const existingKeys = new Set([normalizer(existing)]);

        const data = [
            makeSchedule({ program: 'P1' }),   // update (exists in DB)
            makeSchedule({ program: 'P2' }),   // new
            makeSchedule({ program: 'P2' }),   // intra-file duplicate of P2
            makeSchedule({ program: 'P3' }),   // new
        ];

        const result = detectImportOverlaps(data, existingKeys, normalizer);

        expect(result.updateCount).toBe(1);    // P1
        expect(result.newCount).toBe(2);       // P2 (first), P3
        expect(result.duplicateCount).toBe(1); // P2 (second)
    });

    it('should handle empty import data', () => {
        const result = detectImportOverlaps([], new Set(), normalizer);
        expect(result.newCount).toBe(0);
        expect(result.updateCount).toBe(0);
        expect(result.duplicateCount).toBe(0);
    });

    it('should normalize keys consistently (dirty vs clean inputs produce same key)', () => {
        const cleanKey = normalizer(makeSchedule({ instructor: 'Juan Perez', start_time: '08:00' }));
        const existingKeys = new Set([cleanKey]);

        const data = [
            makeSchedule({ instructor: '  Juan   Perez  ', start_time: '8:00' }), // dirty version
        ];
        const result = detectImportOverlaps(data, existingKeys, normalizer);

        // Should match because normalizer cleans both sides
        expect(result.updateCount).toBe(1);
        expect(result.newCount).toBe(0);
    });
});

// =============================================================================
// validateAgainstDb — Classifies rows as new/modified/identical
// (uses mock for scheduleEntriesService)
// =============================================================================

// Mock the service at module level
vi.mock('../../src/features/schedules/services/schedule-entries-service', () => ({
    scheduleEntriesService: {
        getFullSchedulesByDates: vi.fn(),
    },
}));

import { validateAgainstDb } from '../../src/features/schedules/utils/db-validation-utils';
import { scheduleEntriesService } from '../../src/features/schedules/services/schedule-entries-service';

describe('validateAgainstDb - categorization', () => {
    const mockGetFull = vi.mocked(scheduleEntriesService.getFullSchedulesByDates);

    it('should classify all rows as "new" when DB returns empty map', async () => {
        mockGetFull.mockResolvedValue(new Map());

        const data = [
            makeSchedule({ program: 'P1' }),
            makeSchedule({ program: 'P2' }),
        ];
        const result = await validateAgainstDb(data);

        expect(result.newCount).toBe(2);
        expect(result.existingKeys.size).toBe(0);
        expect(result.modifiedKeys.size).toBe(0);
        expect(result.identicalKeys.size).toBe(0);
    });

    it('should classify identical rows correctly', async () => {
        const s = makeSchedule({ program: 'P1', shift: 'morning', branch: 'HUB' });
        const pk = getSchedulePrimaryKey(s);

        // DB returns same values as import
        const dbMap = new Map([[pk, {
            shift: 'morning', branch: 'HUB', end_time: '10:00',
            code: 'C01', minutes: '60', units: '2',
            status: '', substitute: '', type: '', subtype: '',
            description: '', department: '', feedback: '',
        }]]);
        mockGetFull.mockResolvedValue(dbMap);

        const result = await validateAgainstDb([s]);

        expect(result.newCount).toBe(0);
        expect(result.identicalKeys.size).toBe(1);
        expect(result.modifiedKeys.size).toBe(0);
    });

    it('should classify modified rows with diff reasons', async () => {
        const s = makeSchedule({ program: 'P1', shift: 'afternoon' }); // changed shift
        const pk = getSchedulePrimaryKey(s);

        const dbMap = new Map([[pk, {
            shift: 'morning', branch: 'HUB', end_time: '10:00',
            code: 'C01', minutes: '60', units: '2',
            status: '', substitute: '', type: '', subtype: '',
            description: '', department: '', feedback: '',
        }]]);
        mockGetFull.mockResolvedValue(dbMap);

        const result = await validateAgainstDb([s]);

        expect(result.modifiedKeys.size).toBe(1);
        expect(result.modifiedReasons.size).toBe(1);
        const reason = result.modifiedReasons.get(pk)!;
        expect(reason).toContain('shift');
    });

    it('should NOT report incidence-only changes as modifications (incidences deprecated)', async () => {
        const s = makeSchedule({ program: 'P1' }); // no base field changes — type not tracked
        const pk = getSchedulePrimaryKey(s);

        const dbMap = new Map([[pk, {
            shift: 'morning', branch: 'HUB', end_time: '10:00',
            code: 'C01', minutes: '60', units: '2',
        }]]);
        mockGetFull.mockResolvedValue(dbMap);

        const result = await validateAgainstDb([s]);

        // Incidence fields (type, status, etc.) no longer compared — row is identical
        expect(result.identicalKeys.size).toBe(1);
        expect(result.modifiedKeys.size).toBe(0);
    });

    it('should treat null incidence fields as identical to empty DB fields', async () => {
        const s = makeSchedule({ program: 'P1', status: null, type: null });
        const pk = getSchedulePrimaryKey(s);

        const dbMap = new Map([[pk, {
            shift: 'morning', branch: 'HUB', end_time: '10:00',
            code: 'C01', minutes: '60', units: '2',
            status: '', substitute: '', type: '', subtype: '',
            description: '', department: '', feedback: '',
        }]]);
        mockGetFull.mockResolvedValue(dbMap);

        const result = await validateAgainstDb([s]);

        // null imported vs '' in DB → should be identical, not modified
        expect(result.identicalKeys.size).toBe(1);
        expect(result.modifiedKeys.size).toBe(0);
    });

    it('should deduplicate intra-file entries (skip second occurrence)', async () => {
        mockGetFull.mockResolvedValue(new Map());

        const data = [
            makeSchedule({ program: 'P1' }),
            makeSchedule({ program: 'P1' }), // same PK — should be skipped
        ];
        const result = await validateAgainstDb(data);

        // Only 1 unique entry counted
        expect(result.newCount).toBe(1);
    });

    it('should correctly mix new + modified + identical', async () => {
        const sNew = makeSchedule({ program: 'NewProgram' });
        const sModified = makeSchedule({ program: 'ExistingMod', shift: 'afternoon' });
        const sIdentical = makeSchedule({ program: 'ExistingSame' });

        const pkMod = getSchedulePrimaryKey(sModified);
        const pkSame = getSchedulePrimaryKey(sIdentical);

        const dbMap = new Map([
            [pkMod, {
                shift: 'morning', branch: 'HUB', end_time: '10:00',
                code: 'C01', minutes: '60', units: '2',
                status: '', substitute: '', type: '', subtype: '',
                description: '', department: '', feedback: '',
            }],
            [pkSame, {
                shift: 'morning', branch: 'HUB', end_time: '10:00',
                code: 'C01', minutes: '60', units: '2',
                status: '', substitute: '', type: '', subtype: '',
                description: '', department: '', feedback: '',
            }],
        ]);
        mockGetFull.mockResolvedValue(dbMap);

        const result = await validateAgainstDb([sNew, sModified, sIdentical]);

        expect(result.newCount).toBe(1);
        expect(result.modifiedKeys.size).toBe(1);
        expect(result.identicalKeys.size).toBe(1);
    });
});

// =============================================================================
// buildIssueRowKeys — Converts DB-level PKs to UI-level schedule keys
// =============================================================================

describe('buildIssueRowKeys', () => {
    const s1 = makeSchedule({ program: 'P1', instructor: 'A' });
    const s2 = makeSchedule({ program: 'P2', instructor: 'B' });
    const s3 = makeSchedule({ program: 'P3', instructor: 'C' });
    const workingData = [s1, s2, s3];

    it('should build "new" keys when newCount > 0', () => {
        const validation: DbValidationResult = {
            newCount: 1,
            existingKeys: new Set([getSchedulePrimaryKey(s1), getSchedulePrimaryKey(s2)]),
            modifiedKeys: new Set(),
            identicalKeys: new Set(),
            modifiedReasons: new Map(),
        };

        const result = buildIssueRowKeys(workingData, validation);

        expect(result.new).toBeDefined();
        expect(result.new!.size).toBe(1); // s3 is not in existingKeys
    });

    it('should build "modified" keys', () => {
        const pk2 = getSchedulePrimaryKey(s2);
        const validation: DbValidationResult = {
            newCount: 0,
            existingKeys: new Set([getSchedulePrimaryKey(s1), pk2, getSchedulePrimaryKey(s3)]),
            modifiedKeys: new Set([pk2]),
            identicalKeys: new Set([getSchedulePrimaryKey(s1), getSchedulePrimaryKey(s3)]),
            modifiedReasons: new Map([[pk2, 'Modified: shift']]),
        };

        const result = buildIssueRowKeys(workingData, validation);

        expect(result.modified).toBeDefined();
        expect(result.modified!.size).toBe(1);
        expect(result.identical).toBeDefined();
        expect(result.identical!.size).toBe(2);
    });

    it('should build "duplicates" keys when provided', () => {
        const dupKeys = new Set(['2024-06-15|08:00|D|PX']);
        const validation: DbValidationResult = {
            newCount: 3,
            existingKeys: new Set(),
            modifiedKeys: new Set(),
            identicalKeys: new Set(),
            modifiedReasons: new Map(),
        };

        const result = buildIssueRowKeys(workingData, validation, dupKeys, 2);

        expect(result.duplicates).toBeDefined();
        expect(result.duplicates).toBe(dupKeys);
    });

    it('should NOT include "duplicates" when count is 0', () => {
        const validation: DbValidationResult = {
            newCount: 3,
            existingKeys: new Set(),
            modifiedKeys: new Set(),
            identicalKeys: new Set(),
            modifiedReasons: new Map(),
        };

        const result = buildIssueRowKeys(workingData, validation, new Set(), 0);

        expect(result.duplicates).toBeUndefined();
    });

    it('should return empty map when all are new and no issues', () => {
        const validation: DbValidationResult = {
            newCount: 3,
            existingKeys: new Set(),
            modifiedKeys: new Set(),
            identicalKeys: new Set(),
            modifiedReasons: new Map(),
        };

        const result = buildIssueRowKeys(workingData, validation);

        expect(result.new).toBeDefined();
        expect(result.new!.size).toBe(3);
        expect(result.modified).toBeUndefined();
        expect(result.identical).toBeUndefined();
        expect(result.duplicates).toBeUndefined();
    });
});
