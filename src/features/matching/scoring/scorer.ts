/**
 * Scorer - Orquestador del sistema de scoring
 * 
 * Calcula el score de cada candidato aplicando todas las penalizaciones
 * y determina la decisión final de matching usando un patrón de Rule Engine.
 */

import type { ZoomMeetingCandidate } from '../types';
import type { ScoringContext, ScoringResult, MatchEvaluation, AppliedPenalty, MatchOptions, PenaltyFunction } from './types';
import { ALL_PENALTIES } from './penalties';
import { BASE_SCORE, THRESHOLDS } from '../config/matching.config';
import { normalizeString } from '../utils/normalizer';

/**
 * Motor de Reglas de Scoring
 * Permite registrar y ejecutar reglas de penalización de forma desacoplada.
 */
export class ScoringEngine {
    private rules: PenaltyFunction[] = [];

    constructor(initialRules: PenaltyFunction[] = []) {
        this.rules = initialRules;
    }

    /**
     * Registra una nueva regla de penalización
     */
    public addRule(rule: PenaltyFunction): void {
        this.rules.push(rule);
    }

    /**
     * Evalúa todas las reglas contra el contexto dado
     */
    public evaluate(ctx: ScoringContext): { finalScore: number; penalties: AppliedPenalty[]; isDisqualified: boolean } {
        const penalties: AppliedPenalty[] = [];
        let score = BASE_SCORE;

        for (const rule of this.rules) {
            try {
                const result = rule(ctx);
                if (result) {
                    penalties.push(result);
                    score += result.points;
                }
            } catch (error) {
                console.error('Error executing scoring rule:', error);
                // Continue execution, do not crash matching process
            }
        }

        return {
            finalScore: Math.max(0, score),
            penalties,
            isDisqualified: score <= 0
        };
    }
}

// Instancia por defecto con todas las penalizaciones estándar
export const defaultScoringEngine = new ScoringEngine(ALL_PENALTIES);

/**
 * Convierte un nombre de penalización técnica en un mensaje corto y claro para el usuario
 */
function getShortReason(penalty: AppliedPenalty | null): string {
    if (!penalty) return 'No match found';

    switch (penalty.name) {
        case 'LEVEL_CONFLICT':
            return 'Level mismatch';
        case 'CRITICAL_TOKEN_MISMATCH':
            return 'Program type mismatch';
        case 'COMPANY_CONFLICT':
            return 'Company mismatch';
        case 'GROUP_NUMBER_CONFLICT':
            return 'Group number mismatch';
        case 'NUMERIC_CONFLICT':
            return 'Number mismatch';
        case 'PROGRAM_VS_PERSON':
            return 'Program vs person mismatch';
        case 'STRUCTURAL_TOKEN_MISSING':
            return 'Missing program type';
        case 'WEAK_MATCH':
            return 'Weak match';
        case 'PARTIAL_MATCH_MISSING_TOKENS':
            return 'Missing tokens';
        case 'ORPHAN_NUMBER_WITH_SIBLINGS':
            return 'Unspecified group number';
        case 'ORPHAN_LEVEL_WITH_SIBLINGS':
            return 'Unspecified level';
        case 'LEVEL_MISMATCH_IGNORED':
            return 'Level mismatch (Ignored)';
        default:
            return 'Match conflict';
    }
}

/**
 * Genera un mensaje detallado con todas las penalizaciones para el hover card
 */
function getDetailedReason(penalty: AppliedPenalty | null, allPenalties: AppliedPenalty[] = []): string {
    if (!penalty) return 'No match found';

    const penalties = allPenalties.length > 0 ? allPenalties : [penalty];
    const details = penalties.map(p => {
        const baseMsg = p.reason || 'Unknown conflict';
        return `${p.name}: ${baseMsg}`;
    });

    return details.join('\n');
}

/**
 * Calcula el score de un candidato aplicando todas las penalizaciones
 * Delega la lógica al ScoringEngine.
 */
export function scoreCandidate(
    rawProgram: string,
    candidate: ZoomMeetingCandidate,
    allCandidates: ZoomMeetingCandidate[],
    options?: MatchOptions,
    engine: ScoringEngine = defaultScoringEngine
): ScoringResult {
    const ctx: ScoringContext = {
        rawProgram,
        rawTopic: candidate.topic,
        normalizedProgram: normalizeString(rawProgram),
        normalizedTopic: normalizeString(candidate.topic),
        candidate,
        allCandidates,
        options,
    };

    const evaluation = engine.evaluate(ctx);

    return {
        candidate,
        baseScore: BASE_SCORE,
        finalScore: evaluation.finalScore,
        penalties: evaluation.penalties,
        isDisqualified: evaluation.isDisqualified,
    };
}

/**
 * Evalúa todos los candidatos y determina la mejor decisión
 */
export function evaluateMatch(
    rawProgram: string,
    candidates: ZoomMeetingCandidate[],
    options?: MatchOptions
): MatchEvaluation {
    if (candidates.length === 0) {
        return {
            bestMatch: null,
            allResults: [],
            decision: 'not_found',
            confidence: 'none',
            reason: 'No hay candidatos disponibles',
        };
    }

    // Calcular score para cada candidato
    const results = candidates.map(c => scoreCandidate(rawProgram, c, candidates, options));

    // Ordenar por score descendente
    results.sort((a, b) => b.finalScore - a.finalScore);

    // Filtrar candidatos no descalificados
    const validResults = results.filter(r => !r.isDisqualified && r.finalScore >= THRESHOLDS.MINIMUM);

    if (validResults.length === 0) {
        // Buscar el mejor candidato descalificado para dar una razón
        const bestRejected = results[0];
        const mainPenalty = bestRejected?.penalties[0];

        // Si hay candidatos rechazados, verificar si son rechazos "duros" (no ambiguos)
        if (results.length > 0) {
            const hardRejectPenalties = ['COMPANY_CONFLICT', 'CRITICAL_TOKEN_MISMATCH'];
            const isHardReject = bestRejected.penalties.some(p => hardRejectPenalties.includes(p.name));

            // WEAK_MATCH con cobertura 0% es hard reject, pero cobertura > 0% es ambiguous
            const weakMatchPenalty = bestRejected.penalties.find(p => p.name === 'WEAK_MATCH');

            // Usamos metadatos estructurados
            const isZeroCoverageWeakMatch = weakMatchPenalty?.metadata?.coverage === 0;

            if (isHardReject || isZeroCoverageWeakMatch) {
                return {
                    bestMatch: null, // Hard reject -> No match
                    allResults: results,
                    decision: 'not_found',
                    confidence: 'none',
                    reason: mainPenalty ? getShortReason(mainPenalty) : 'No valid matches',
                    detailedReason: mainPenalty
                        ? getDetailedReason(mainPenalty, bestRejected?.penalties || [])
                        : 'Match rejected due to critical conflict.',
                };
            }

            return {
                bestMatch: bestRejected || null,
                allResults: results,
                decision: 'ambiguous',
                confidence: 'low',
                reason: mainPenalty ? getShortReason(mainPenalty) : 'No valid matches',
                detailedReason: mainPenalty
                    ? getDetailedReason(mainPenalty, bestRejected?.penalties || [])
                    : 'Candidates found but rejected. Review and select manually if appropriate.',
                ambiguousCandidates: results.slice(0, 5).map(r => r.candidate),
            };
        }

        return {
            bestMatch: null,
            allResults: results,
            decision: 'not_found',
            confidence: 'none',
            reason: 'No match found',
            detailedReason: 'No meetings found for this schedule.',
        };
    }

    const best = validResults[0];
    const second = validResults[1];

    // Verificar ambigüedad por score similar
    if (second) {
        const scoreDiff = best.finalScore - second.finalScore;
        if (scoreDiff < THRESHOLDS.AMBIGUITY_DIFF) {
            const detailedReason = 'Multiple matches found. Please review the list and manually select the best match.';
            return {
                decision: 'ambiguous',
                reason: 'Multiple matches found',
                detailedReason,
                bestMatch: best,
                allResults: results,
                confidence: 'low',
                ambiguousCandidates: validResults.map(r => r.candidate)
            };
        }
    }

    // Verificar penalizaciones de ambigüedad (orphan numbers/levels)
    const ambiguityPenalties = best.penalties.filter(p =>
        p.name === 'ORPHAN_NUMBER_WITH_SIBLINGS' ||
        p.name === 'ORPHAN_LEVEL_WITH_SIBLINGS'
    );

    if (ambiguityPenalties.length > 0 && best.finalScore < THRESHOLDS.HIGH_CONFIDENCE) {
        const detailedReason = getDetailedReason(ambiguityPenalties[0], best.penalties);
        return {
            bestMatch: best,
            allResults: results,
            decision: 'ambiguous',
            confidence: 'low',
            reason: getShortReason(ambiguityPenalties[0]) || 'Incomplete specification',
            detailedReason,
            ambiguousCandidates: validResults.slice(0, 5).map(r => r.candidate),
        };
    }

    // Determinar nivel de confianza
    let confidence: 'high' | 'medium' | 'low';
    if (best.finalScore >= THRESHOLDS.HIGH_CONFIDENCE) {
        confidence = 'high';
    } else if (best.finalScore >= THRESHOLDS.MEDIUM_CONFIDENCE) {
        confidence = 'medium';
    } else {
        confidence = 'low';
    }

    // Para confianza baja, marcar como ambiguo (pero con bestMatch)
    if (confidence === 'low') {
        const detailedReason = best.penalties.length > 0
            ? getDetailedReason(best.penalties[0], best.penalties)
            : `Low confidence score (${best.finalScore}) - requires verification`;
        return {
            bestMatch: best,
            allResults: results,
            decision: 'ambiguous',
            confidence: 'low',
            reason: 'Low confidence match',
            detailedReason,
            ambiguousCandidates: validResults.slice(0, 5).map(r => r.candidate),
        };
    }

    const detailedReason = best.penalties.length > 0
        ? getDetailedReason(best.penalties[0], best.penalties)
        : undefined;

    return {
        bestMatch: best,
        allResults: results,
        decision: 'assigned',
        confidence,
        reason: confidence === 'high' ? '-' : `Medium confidence (score: ${best.finalScore})`,
        detailedReason,
    };
}
