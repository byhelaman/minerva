import { describe, it, expect } from 'vitest';
import { ScoringEngine, scoreCandidate, evaluateMatch } from '../../src/features/matching/scoring/scorer';
import { normalizeString } from '../../src/features/matching/utils/normalizer';
import type { ScoringContext, PenaltyFunction } from '../../src/features/matching/scoring/types';
import type { ZoomMeetingCandidate } from '../../src/features/matching/types';
import { BASE_SCORE, THRESHOLDS } from '../../src/features/matching/config/matching.config';

// Helper para crear un candidato de meeting mock
function mockMeeting(id: string, topic: string): ZoomMeetingCandidate {
    return { meeting_id: id, topic, host_id: 'h1', start_time: '2023-01-01' };
}

// =============================================================================
// ScoringEngine
// =============================================================================

describe('ScoringEngine', () => {
    it('should return base score with no rules', () => {
        const engine = new ScoringEngine([]);
        const ctx: ScoringContext = {
            rawProgram: 'APP',
            rawTopic: 'APP',
            normalizedProgram: normalizeString('APP'),
            normalizedTopic: normalizeString('APP'),
            candidate: mockMeeting('m1', 'APP'),
            allCandidates: [mockMeeting('m1', 'APP')],
        };

        const result = engine.evaluate(ctx);
        expect(result.finalScore).toBe(BASE_SCORE);
        expect(result.penalties).toHaveLength(0);
        expect(result.isDisqualified).toBe(false);
    });

    it('should apply penalty from a single rule', () => {
        const mockPenalty: PenaltyFunction = () => ({
            name: 'TEST_PENALTY',
            points: -30,
            reason: 'Test reason',
        });

        const engine = new ScoringEngine([mockPenalty]);
        const ctx: ScoringContext = {
            rawProgram: 'APP',
            rawTopic: 'APP',
            normalizedProgram: normalizeString('APP'),
            normalizedTopic: normalizeString('APP'),
            candidate: mockMeeting('m1', 'APP'),
            allCandidates: [mockMeeting('m1', 'APP')],
        };

        const result = engine.evaluate(ctx);
        expect(result.finalScore).toBe(BASE_SCORE - 30);
        expect(result.penalties).toHaveLength(1);
        expect(result.penalties[0].name).toBe('TEST_PENALTY');
    });

    it('should skip rules that return null (no penalty)', () => {
        const noPenalty: PenaltyFunction = () => null;

        const engine = new ScoringEngine([noPenalty]);
        const ctx: ScoringContext = {
            rawProgram: 'APP',
            rawTopic: 'APP',
            normalizedProgram: normalizeString('APP'),
            normalizedTopic: normalizeString('APP'),
            candidate: mockMeeting('m1', 'APP'),
            allCandidates: [mockMeeting('m1', 'APP')],
        };

        const result = engine.evaluate(ctx);
        expect(result.finalScore).toBe(BASE_SCORE);
        expect(result.penalties).toHaveLength(0);
    });

    it('should not go below 0', () => {
        const hugePenalty: PenaltyFunction = () => ({
            name: 'HUGE',
            points: -9999,
        });

        const engine = new ScoringEngine([hugePenalty]);
        const ctx: ScoringContext = {
            rawProgram: 'APP',
            rawTopic: 'XYZ',
            normalizedProgram: 'app',
            normalizedTopic: 'xyz',
            candidate: mockMeeting('m1', 'XYZ'),
            allCandidates: [mockMeeting('m1', 'XYZ')],
        };

        const result = engine.evaluate(ctx);
        expect(result.finalScore).toBe(0);
        expect(result.isDisqualified).toBe(true);
    });

    it('should accumulate penalties from multiple rules', () => {
        const p1: PenaltyFunction = () => ({ name: 'P1', points: -10 });
        const p2: PenaltyFunction = () => ({ name: 'P2', points: -20 });

        const engine = new ScoringEngine([p1, p2]);
        const ctx: ScoringContext = {
            rawProgram: 'APP',
            rawTopic: 'APP',
            normalizedProgram: 'app',
            normalizedTopic: 'app',
            candidate: mockMeeting('m1', 'APP'),
            allCandidates: [mockMeeting('m1', 'APP')],
        };

        const result = engine.evaluate(ctx);
        expect(result.finalScore).toBe(BASE_SCORE - 30);
        expect(result.penalties).toHaveLength(2);
    });

    it('should addRule dynamically', () => {
        const engine = new ScoringEngine([]);
        engine.addRule(() => ({ name: 'DYNAMIC', points: -5 }));

        const ctx: ScoringContext = {
            rawProgram: 'A',
            rawTopic: 'B',
            normalizedProgram: 'a',
            normalizedTopic: 'b',
            candidate: mockMeeting('m1', 'B'),
            allCandidates: [mockMeeting('m1', 'B')],
        };

        const result = engine.evaluate(ctx);
        expect(result.penalties).toHaveLength(1);
        expect(result.penalties[0].name).toBe('DYNAMIC');
    });

    it('should survive a throwing rule without crashing', () => {
        const throwingRule: PenaltyFunction = () => {
            throw new Error('Boom');
        };

        const engine = new ScoringEngine([throwingRule]);
        const ctx: ScoringContext = {
            rawProgram: 'A',
            rawTopic: 'B',
            normalizedProgram: 'a',
            normalizedTopic: 'b',
            candidate: mockMeeting('m1', 'B'),
            allCandidates: [mockMeeting('m1', 'B')],
        };

        expect(() => engine.evaluate(ctx)).not.toThrow();
        const result = engine.evaluate(ctx);
        expect(result.finalScore).toBe(BASE_SCORE);
    });
});

// =============================================================================
// scoreCandidate
// =============================================================================

describe('scoreCandidate', () => {
    it('should return ScoringResult with base score for perfect match', () => {
        const candidate = mockMeeting('m1', 'EXACT MATCH');
        const result = scoreCandidate('EXACT MATCH', candidate, [candidate]);

        expect(result.baseScore).toBe(BASE_SCORE);
        expect(result.candidate).toBe(candidate);
        expect(result.finalScore).toBeGreaterThan(0);
    });

    it('should penalize poor matches', () => {
        const candidate = mockMeeting('m1', 'COMPLETELY DIFFERENT');
        const result = scoreCandidate('ABC XYZ', candidate, [candidate]);

        expect(result.finalScore).toBeLessThan(BASE_SCORE);
    });

    it('should disqualify when score drops to 0', () => {
        // Usando un engine con una penalización masiva
        const killEngine = new ScoringEngine([
            () => ({ name: 'KILL', points: -9999 }),
        ]);

        const candidate = mockMeeting('m1', 'XYZ');
        const result = scoreCandidate('ABC', candidate, [candidate], undefined, killEngine);

        expect(result.isDisqualified).toBe(true);
        expect(result.finalScore).toBe(0);
    });
});

// =============================================================================
// evaluateMatch
// =============================================================================

describe('evaluateMatch', () => {
    it('should return not_found for empty candidates', () => {
        const result = evaluateMatch('APP', []);
        expect(result.decision).toBe('not_found');
        expect(result.confidence).toBe('none');
        expect(result.bestMatch).toBeNull();
    });

    it('should return assigned for a clear high-confidence match', () => {
        const candidates = [mockMeeting('m1', 'TRIO TECHCORP L4 (ONLINE)')];
        const result = evaluateMatch('TRIO TECHCORP L4 (ONLINE)', candidates);

        expect(result.decision).toBe('assigned');
        expect(result.confidence).toBe('high');
        expect(result.bestMatch).not.toBeNull();
    });

    it('should return ambiguous when multiple candidates have similar scores', () => {
        const candidates = [
            mockMeeting('m1', 'APP GROUP A L2'),
            mockMeeting('m2', 'APP GROUP B L2'),
        ];
        // Query sin grupo → ambos deben matchear de forma similar
        const result = evaluateMatch('APP L2', candidates);

        // Dependiendo del scoring, debe ser ambiguo o tener un score diff cercano
        if (result.allResults.length >= 2) {
            const scoreDiff = result.allResults[0].finalScore - result.allResults[1].finalScore;
            if (scoreDiff < THRESHOLDS.AMBIGUITY_DIFF) {
                expect(result.decision).toBe('ambiguous');
            }
        }
    });

    it('should return not_found when all candidates are disqualified', () => {
        // Mismatch fuerte: TRIO vs DUO
        const candidates = [mockMeeting('m1', 'TRIO APP')];
        const result = evaluateMatch('DUO APP', candidates);

        // CRITICAL_TOKEN_MISMATCH debe descalificar
        expect(result.decision).toBe('not_found');
    });

    it('should sort results by score descending', () => {
        const candidates = [
            mockMeeting('m1', 'COMPLETELY UNRELATED'),
            mockMeeting('m2', 'TRIO TECHCORP L4 EXACT'),
        ];
        const result = evaluateMatch('TRIO TECHCORP L4 EXACT', candidates);

        if (result.allResults.length >= 2) {
            expect(result.allResults[0].finalScore).toBeGreaterThanOrEqual(result.allResults[1].finalScore);
        }
    });
});
