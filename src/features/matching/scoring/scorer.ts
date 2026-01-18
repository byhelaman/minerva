/**
 * Scorer - Orquestador del sistema de scoring
 * 
 * Calcula el score de cada candidato aplicando todas las penalizaciones
 * y determina la decisión final de matching.
 */

import type { ZoomMeetingCandidate } from '../services/matcher';
import type { ScoringContext, ScoringResult, MatchEvaluation, AppliedPenalty } from './types';
import { ALL_PENALTIES } from './penalties';
import { BASE_SCORE, THRESHOLDS } from '../config/matching.config';
import { normalizeString } from '../utils/normalizer';
import { logger } from '@/lib/logger';

/**
 * Convierte un nombre de penalización técnica en un mensaje corto y claro para el usuario
 */
function getShortReason(penalty: AppliedPenalty | null): string {
    if (!penalty) return 'No match found';

    switch (penalty.name) {
        case 'LEVEL_CONFLICT':
            // Extraer niveles del reason (ej: "L4 vs L3" -> "Level mismatch")
            return 'Level mismatch';
        case 'CRITICAL_TOKEN_MISMATCH':
            return 'Program type mismatch';
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
        switch (p.name) {
            case 'LEVEL_CONFLICT':
                return `Level conflict: ${p.reason || 'Levels do not match'}`;
            case 'CRITICAL_TOKEN_MISMATCH':
                return `Program type conflict: ${p.reason || 'Program types do not match'}`;
            case 'GROUP_NUMBER_CONFLICT':
                return `Group number conflict: ${p.reason || 'Group numbers do not match'}`;
            case 'NUMERIC_CONFLICT':
                return `Number conflict: ${p.reason || 'Numbers do not match'}`;
            case 'PROGRAM_VS_PERSON':
                return `Format mismatch: ${p.reason || 'Query is program format, topic is person format'}`;
            case 'STRUCTURAL_TOKEN_MISSING':
                return `Missing structural token: ${p.reason || 'Required program type not found in topic'}`;
            case 'WEAK_MATCH':
                return `Weak match: ${p.reason || 'No distinctive tokens match'}`;
            case 'PARTIAL_MATCH_MISSING_TOKENS':
                return `Missing tokens: ${p.reason || 'Some required tokens are missing'}`;
            case 'ORPHAN_NUMBER_WITH_SIBLINGS':
                return `Unspecified group: ${p.reason || 'Group number not specified but other versions exist'}`;
            case 'ORPHAN_LEVEL_WITH_SIBLINGS':
                return `Unspecified level: ${p.reason || 'Level not specified but other levels exist'}`;
            default:
                return `${p.name}: ${p.reason || 'Unknown conflict'}`;
        }
    });

    return details.join('\n');
}

/**
 * Calcula el score de un candidato aplicando todas las penalizaciones
 */
export function scoreCandidate(
    rawProgram: string,
    candidate: ZoomMeetingCandidate,
    allCandidates: ZoomMeetingCandidate[]
): ScoringResult {
    const ctx: ScoringContext = {
        rawProgram,
        rawTopic: candidate.topic,
        normalizedProgram: normalizeString(rawProgram),
        normalizedTopic: normalizeString(candidate.topic),
        candidate,
        allCandidates,
    };

    const penalties: AppliedPenalty[] = [];
    let score = BASE_SCORE;

    // Aplicar cada penalización
    for (const penaltyFn of ALL_PENALTIES) {
        const result = penaltyFn(ctx);
        if (result) {
            penalties.push(result);
            score += result.points; // Los puntos son negativos
        }
    }

    return {
        candidate,
        baseScore: BASE_SCORE,
        finalScore: Math.max(0, score), // No permitir scores negativos
        penalties,
        isDisqualified: score <= 0,
    };
}

/**
 * Evalúa todos los candidatos y determina la mejor decisión
 */
export function evaluateMatch(
    rawProgram: string,
    candidates: ZoomMeetingCandidate[]
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
    const results = candidates.map(c => scoreCandidate(rawProgram, c, candidates));

    // Ordenar por score descendente
    results.sort((a, b) => b.finalScore - a.finalScore);

    // Filtrar candidatos no descalificados
    const validResults = results.filter(r => !r.isDisqualified && r.finalScore >= THRESHOLDS.MINIMUM);

    if (validResults.length === 0) {
        // Buscar el mejor candidato descalificado para dar una razón
        const bestRejected = results[0];
        const mainPenalty = bestRejected?.penalties[0];

        return {
            bestMatch: bestRejected || null,
            allResults: results,
            decision: 'not_found',
            confidence: 'none',
            reason: mainPenalty
                ? getShortReason(mainPenalty)
                : 'No match found',
            detailedReason: mainPenalty
                ? getDetailedReason(mainPenalty, bestRejected?.penalties || [])
                : 'No candidates meet minimum requirements',
        };
    }

    const best = validResults[0];
    const second = validResults[1];

    // Verificar ambigüedad
    if (second) {
        const scoreDiff = best.finalScore - second.finalScore;
        if (scoreDiff < THRESHOLDS.AMBIGUITY_DIFF) {
            logger.debug('⚠️ Ambiguity Detected:');
            logger.debug(`   1. ${best.candidate.topic} (Score: ${best.finalScore})`);
            best.penalties.forEach(p => logger.debug(`      - ${p.name}: ${p.points} (${p.reason})`));

            logger.debug(`   2. ${second.candidate.topic} (Score: ${second.finalScore})`);
            second.penalties.forEach(p => logger.debug(`      - ${p.name}: ${p.points} (${p.reason})`));

            logger.debug(`   Diff: ${scoreDiff} < ${THRESHOLDS.AMBIGUITY_DIFF}`);

            const detailedReason = 'High ambiguity detected between top candidates. Please review the list and manually select the best match.';

            return {
                decision: 'ambiguous',
                reason: 'Multiple matches found',
                detailedReason,
                bestMatch: best,
                allResults: results, // Keep allResults for debugging/context
                confidence: 'low', // Explicitly set confidence for ambiguity
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

    // Para confianza baja, marcar como ambiguo
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
        decision: 'assigned', // El matcher determinará si es assigned o to_update según el host
        confidence,
        reason: confidence === 'high'
            ? '-'
            : `Medium confidence (score: ${best.finalScore})`,
        detailedReason,
    };
}

/**
 * Genera un log detallado del resultado del scoring (para debug)
 */
export function logScoringResult(rawProgram: string, result: ScoringResult): void {
    logger.debug(`📊 Score: ${result.finalScore}/${result.baseScore}`);
    logger.debug(`   Query: ${rawProgram}`);
    logger.debug(`   Candidato: ${result.candidate.topic}`);
    if (result.penalties.length > 0) {
        logger.debug(`   Penalizaciones:`);
        result.penalties.forEach(p => {
            logger.debug(`     - ${p.name}: ${p.points} (${p.reason || ''})`);
        });
    } else {
        logger.debug(`   ✅ Sin penalizaciones`);
    }
    if (result.isDisqualified) {
        logger.debug(`   ❌ DESCALIFICADO`);
    }
}
