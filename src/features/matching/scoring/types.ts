/**
 * Tipos e interfaces para el sistema de scoring
 */

import type { ZoomMeetingCandidate } from '../services/matcher';

/**
 * Contexto de scoring - toda la información necesaria para evaluar un match
 */
export interface ScoringContext {
    rawProgram: string;
    rawTopic: string;
    normalizedProgram: string;
    normalizedTopic: string;
    candidate: ZoomMeetingCandidate;
    allCandidates: ZoomMeetingCandidate[];
}

/**
 * Una penalización aplicada durante el scoring
 */
export interface AppliedPenalty {
    name: string;
    points: number;
    reason?: string;
}

/**
 * Resultado del scoring para un candidato
 */
export interface ScoringResult {
    candidate: ZoomMeetingCandidate;
    baseScore: number;
    finalScore: number;
    penalties: AppliedPenalty[];
    isDisqualified: boolean; // score <= 0
}

/**
 * Resultado de evaluar todos los candidatos
 */
export interface MatchEvaluation {
    bestMatch: ScoringResult | null;
    allResults: ScoringResult[];
    decision: 'assigned' | 'to_update' | 'ambiguous' | 'not_found';
    confidence: 'high' | 'medium' | 'low' | 'none';
    reason: string; // Mensaje corto para la columna Reason
    detailedReason?: string; // Mensaje detallado para el hover card
    ambiguousCandidates?: ZoomMeetingCandidate[];
}

/**
 * Función de penalización - retorna puntos a restar (negativo) o 0
 */
export type PenaltyFunction = (ctx: ScoringContext) => AppliedPenalty | null;
