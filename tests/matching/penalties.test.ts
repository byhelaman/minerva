import { describe, it, expect } from 'vitest';
import {
    criticalTokenMismatch,
    levelConflict,
    companyConflict,
    programVsPerson,
    structuralTokenMissing,
    weakMatch,
    groupNumberConflict,
    numericConflict,
    orphanNumberWithSiblings,
    orphanLevelWithSiblings
} from '../../src/features/matching/scoring/penalties';
import { ScoringContext, MatchOptions } from '../../src/features/matching/scoring/types';
import { ZoomMeetingCandidate } from '../../src/features/matching/services/matcher';
import { normalizeString } from '../../src/features/matching/utils/normalizer';

// Helper para crear contexto mock
function mockContext(program: string, topic: string, options?: MatchOptions, otherCandidates: ZoomMeetingCandidate[] = []): ScoringContext {
    const candidate: ZoomMeetingCandidate = {
        meeting_id: 'm1',
        topic: topic,
        host_id: 'h1',
        start_time: '2023-01-01'
    };

    return {
        rawProgram: program,
        rawTopic: topic,
        normalizedProgram: normalizeString(program),
        normalizedTopic: normalizeString(topic),
        candidate,
        allCandidates: otherCandidates.length > 0 ? otherCandidates : [candidate],
        options
    };
}

describe('Penalties Unit Tests', () => {

    describe('criticalTokenMismatch', () => {
        it('should return PENALTY when TRIO is in query and DUO in topic', () => {
            const ctx = mockContext('TRIO APP', 'DUO APP');
            const result = criticalTokenMismatch(ctx);
            expect(result).not.toBeNull();
            expect(result?.name).toBe('CRITICAL_TOKEN_MISMATCH');
        });

        it('should return NULL when both are TRIO', () => {
            const ctx = mockContext('TRIO APP', 'TRIO APP');
            const result = criticalTokenMismatch(ctx);
            expect(result).toBeNull();
        });

        it('should return NULL when neither has structural tokens', () => {
            const ctx = mockContext('APP L1', 'APP L1');
            const result = criticalTokenMismatch(ctx);
            expect(result).toBeNull();
        });
    });

    describe('levelConflict', () => {
        it('should return PENALTY when levels differ (L2 vs L3)', () => {
            const ctx = mockContext('APP L2', 'APP L3');
            const result = levelConflict(ctx);
            expect(result).not.toBeNull();
            expect(result?.name).toBe('LEVEL_CONFLICT');
        });

        it('should return IGNORED penalty when options.ignoreLevelMismatch is true', () => {
            const ctx = mockContext('APP L2', 'APP L3', { ignoreLevelMismatch: true });
            const result = levelConflict(ctx);
            expect(result).not.toBeNull();
            expect(result?.name).toBe('LEVEL_MISMATCH_IGNORED');
        });

        it('should return NULL when levels match', () => {
            const ctx = mockContext('APP L2', 'APP L2');
            const result = levelConflict(ctx);
            expect(result).toBeNull();
        });
    });

    describe('companyConflict', () => {
        it('should return PENALTY when companies differ (SCOTIABANK vs HAYDUK)', () => {
            const ctx = mockContext('SCOTIABANK APP', 'APP (HAYDUK)');
            const result = companyConflict(ctx);
            expect(result).not.toBeNull();
            expect(result?.name).toBe('COMPANY_CONFLICT');
        });

        it('should return NULL when companies match', () => {
            const ctx = mockContext('SCOTIABANK APP', 'APP (SCOTIABANK)');
            const result = companyConflict(ctx);
            expect(result).toBeNull();
        });

        it('should return NULL if query company is part of person name in topic', () => {
            const ctx = mockContext('ESPINOZA', 'JUAN ESPINOZA (OTHER)');
            const result = companyConflict(ctx);
            expect(result).toBeNull();
        });
    });

    describe('programVsPerson', () => {
        it('should return PENALTY when query is Program and topic is Person format', () => {
            const ctx = mockContext('TRIO APP', 'JUAN GARCIA LOPEZ - KEYNOTES (ONLINE)');
            const result = programVsPerson(ctx);
            expect(result).not.toBeNull();
            expect(result?.name).toBe('PROGRAM_VS_PERSON');
        });

        it('should return NULL if topic ALSO has program tokens', () => {
            const ctx = mockContext('TRIO APP', 'TRIO JUAN PEREZ (ONLINE)');
            const result = programVsPerson(ctx);
            expect(result).toBeNull();
        });
    });

    describe('structuralTokenMissing', () => {
        it('should return PENALTY when TRIO is in query but missing in topic', () => {
            const ctx = mockContext('TRIO APP', 'APP ONLY');
            const result = structuralTokenMissing(ctx);
            expect(result).not.toBeNull();
            expect(result?.name).toBe('STRUCTURAL_TOKEN_MISSING');
        });

        it('should return NULL if ignoreLevelMismatch is true', () => {
            const ctx = mockContext('TRIO APP', 'APP ONLY', { ignoreLevelMismatch: true });
            const result = structuralTokenMissing(ctx);
            expect(result).toBeNull();
        });
    });

    describe('groupNumberConflict', () => {
        it('should return PENALTY for CH 1 vs CH 2', () => {
            const ctx = mockContext('CH 1 APP', 'CH 2 APP');
            const result = groupNumberConflict(ctx);
            expect(result).not.toBeNull();
            expect(result?.name).toBe('GROUP_NUMBER_CONFLICT');
        });

        it('should return NULL if numbers match', () => {
            const ctx = mockContext('CH 1 APP', 'CH 1 APP');
            const result = groupNumberConflict(ctx);
            expect(result).toBeNull();
        });
    });

    describe('numericConflict', () => {
        it('should return PENALTY for random number mismatch', () => {
            const ctx = mockContext('APP 123', 'APP 456');
            const result = numericConflict(ctx);
            expect(result).not.toBeNull();
            expect(result?.name).toBe('NUMERIC_CONFLICT');
        });
    });

    describe('orphanNumberWithSiblings', () => {
        it('should return PENALTY if topic has extra number and siblings exist', () => {
            const main = { meeting_id: 'm1', topic: 'APP 1', host_id: 'h1', start_time: '' };
            const sibling = { meeting_id: 'm2', topic: 'APP 2', host_id: 'h1', start_time: '' };

            const ctx = mockContext('APP', 'APP 1', undefined, [main, sibling]);
            const result = orphanNumberWithSiblings(ctx);

            expect(result).not.toBeNull();
            expect(result?.name).toBe('ORPHAN_NUMBER_WITH_SIBLINGS');
        });

        it('should return NULL if no siblings exist', () => {
            const main = { meeting_id: 'm1', topic: 'APP 1', host_id: 'h1', start_time: '' };
            const ctx = mockContext('APP', 'APP 1', undefined, [main]);
            const result = orphanNumberWithSiblings(ctx);

            expect(result).toBeNull();
        });
    });

    describe('orphanLevelWithSiblings', () => {
        it('should return PENALTY if topic has extra level and siblings exist with other levels', () => {
            const main = { meeting_id: 'm1', topic: 'APP L2', host_id: 'h1', start_time: '' };
            const sibling = { meeting_id: 'm2', topic: 'APP L3', host_id: 'h1', start_time: '' };

            const ctx = mockContext('APP', 'APP L2', undefined, [main, sibling]);
            const result = orphanLevelWithSiblings(ctx);

            expect(result).not.toBeNull();
            expect(result?.name).toBe('ORPHAN_LEVEL_WITH_SIBLINGS');
        });

        it('should return NULL if no siblings exist', () => {
            const main = { meeting_id: 'm1', topic: 'APP L2', host_id: 'h1', start_time: '' };
            const ctx = mockContext('APP', 'APP L2', undefined, [main]);
            const result = orphanLevelWithSiblings(ctx);

            expect(result).toBeNull();
        });
    });

    describe('weakMatch', () => {
        it('should return PENALTY when no distinctive tokens match', () => {
            const ctx = mockContext('ABC', 'XYZ');
            const result = weakMatch(ctx);
            expect(result).not.toBeNull();
            expect(result?.name).toBe('WEAK_MATCH');
        });

        it('should return PARTIAL_MATCH when some tokens missing', () => {
            const ctx = mockContext('ABC DEF', 'ABC');
            const result = weakMatch(ctx);
            expect(result).not.toBeNull();
            expect(result?.name).not.toBeNull();
        });

        it('should return NULL for good match', () => {
            const ctx = mockContext('ABC', 'ABC');
            const result = weakMatch(ctx);
            expect(result).toBeNull();
        });
    });
});
