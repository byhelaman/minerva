/**
 * Funciones de penalización individuales
 * Cada función evalúa una condición específica y retorna la penalización si aplica
 */

import type { PenaltyFunction } from './types';
import {
    PENALTIES,
    SYNONYM_GROUPS,
    STRUCTURAL_TOKENS,
    PROGRAM_TYPES,
    PERSON_FORMAT_PATTERNS,
} from '../config/matching.config';
import { normalizeString } from '../utils/normalizer';

// ============================================================================
// UTILIDADES COMUNES
// ============================================================================

const tokenize = (str: string): string[] =>
    (str || '').toLowerCase().split(/\W+/).filter(t => t.length > 0);

const tokenizeDistinctive = (str: string): string[] => {
    // Usar normalizeString para eliminar acentos y caracteres especiales consistentes con el resto del sistema
    const normalized = normalizeString(str);
    return normalized
        .split(' ') // normalizeString ya maneja espacios
        .filter(t => t.length > 2 && !/^\d+$/.test(t));
};

const extractLevels = (str: string): string[] => {
    const levels: string[] = [];
    const pattern = /\b(?:l|n|level|nivel)\s*(\d+)\b/gi;
    const matches = (str || '').matchAll(pattern);
    for (const match of matches) {
        levels.push(match[1]);
    }
    return levels;
};

const extractNonLevelNumbers = (str: string): string[] => {
    const levelPattern = /\b(?:l|n|level|nivel)\s*(\d+)\b/gi;
    const withoutLevels = str.replace(levelPattern, '');
    return (withoutLevels.match(/\d+/g) || []);
};

// ============================================================================
// PENALIZACIONES
// ============================================================================

/**
 * CH vs TRIO vs DUO - tokens mutuamente excluyentes
 */
export const criticalTokenMismatch: PenaltyFunction = (ctx) => {
    const qTokens = new Set(tokenize(ctx.rawProgram));
    const tTokens = new Set(tokenize(ctx.rawTopic));

    // Verificar cada grupo de sinónimos
    for (const group of SYNONYM_GROUPS) {
        const queryHas = group.filter(t => qTokens.has(t));
        const topicHas = group.filter(t => tTokens.has(t));

        if (queryHas.length > 0 && topicHas.length > 0) {
            // Ambos tienen tokens del grupo.
            // Si es un grupo de sinónimos (como DUO/BVD), no requerimos coincidencia exacta del token.
            // Simplemente estar en el mismo grupo es suficiente.
            // Por lo tanto, NO retornamos penalización aquí.
            continue;
        }
    }

    // Verificar conflictos entre grupos mutuamente excluyentes
    // CH, TRIO, DUO/BVD, PRIVADO/BVP, y BVS son todos tipos diferentes que no deben cruzarse
    const qCh = qTokens.has('ch');
    const qTrio = qTokens.has('trio');
    const qDuo = qTokens.has('duo') || qTokens.has('bvd');  // DUO = duo, bvd
    const qPrivado = qTokens.has('privado') || qTokens.has('bvp');  // PRIVADO = privado, bvp
    const qBvs = qTokens.has('bvs');  // BVS es tipo separado

    const tCh = tTokens.has('ch');
    const tTrio = tTokens.has('trio');
    const tDuo = tTokens.has('duo') || tTokens.has('bvd');
    const tPrivado = tTokens.has('privado') || tTokens.has('bvp');
    const tBvs = tTokens.has('bvs');

    // CH vs otros
    if ((qCh && tTrio) || (qTrio && tCh)) {
        return { name: 'CRITICAL_TOKEN_MISMATCH', points: PENALTIES.CRITICAL_TOKEN_MISMATCH, reason: 'CH vs TRIO' };
    }
    if ((qCh && tDuo) || (qDuo && tCh)) {
        return { name: 'CRITICAL_TOKEN_MISMATCH', points: PENALTIES.CRITICAL_TOKEN_MISMATCH, reason: 'CH vs DUO' };
    }
    if ((qCh && tPrivado) || (qPrivado && tCh)) {
        return { name: 'CRITICAL_TOKEN_MISMATCH', points: PENALTIES.CRITICAL_TOKEN_MISMATCH, reason: 'CH vs PRIVADO' };
    }
    if ((qCh && tBvs) || (qBvs && tCh)) {
        return { name: 'CRITICAL_TOKEN_MISMATCH', points: PENALTIES.CRITICAL_TOKEN_MISMATCH, reason: 'CH vs BVS' };
    }

    // TRIO vs otros
    if ((qTrio && tDuo) || (qDuo && tTrio)) {
        return { name: 'CRITICAL_TOKEN_MISMATCH', points: PENALTIES.CRITICAL_TOKEN_MISMATCH, reason: 'TRIO vs DUO' };
    }
    if ((qTrio && tPrivado) || (qPrivado && tTrio)) {
        return { name: 'CRITICAL_TOKEN_MISMATCH', points: PENALTIES.CRITICAL_TOKEN_MISMATCH, reason: 'TRIO vs PRIVADO' };
    }
    if ((qTrio && tBvs) || (qBvs && tTrio)) {
        return { name: 'CRITICAL_TOKEN_MISMATCH', points: PENALTIES.CRITICAL_TOKEN_MISMATCH, reason: 'TRIO vs BVS' };
    }

    // DUO vs otros
    if ((qDuo && tPrivado) || (qPrivado && tDuo)) {
        return { name: 'CRITICAL_TOKEN_MISMATCH', points: PENALTIES.CRITICAL_TOKEN_MISMATCH, reason: 'DUO vs PRIVADO' };
    }
    if ((qDuo && tBvs) || (qBvs && tDuo)) {
        return { name: 'CRITICAL_TOKEN_MISMATCH', points: PENALTIES.CRITICAL_TOKEN_MISMATCH, reason: 'DUO vs BVS' };
    }

    // PRIVADO vs BVS
    if ((qPrivado && tBvs) || (qBvs && tPrivado)) {
        return { name: 'CRITICAL_TOKEN_MISMATCH', points: PENALTIES.CRITICAL_TOKEN_MISMATCH, reason: 'PRIVADO vs BVS' };
    }

    return null;
};

/**
 * Conflicto de nivel (L3 vs L2)
 */
export const levelConflict: PenaltyFunction = (ctx) => {
    const qLevels = new Set(extractLevels(ctx.rawProgram));
    const tLevels = new Set(extractLevels(ctx.rawTopic));

    if (qLevels.size > 0 && tLevels.size > 0) {
        const overlap = [...qLevels].some(l => tLevels.has(l));
        if (!overlap) {
            return {
                name: 'LEVEL_CONFLICT',
                points: PENALTIES.LEVEL_CONFLICT,
                reason: `L${[...qLevels].join('/')} vs L${[...tLevels].join('/')}`
            };
        }
    }

    return null;
};

/**
 * Query es programa pero topic es persona
 */
export const programVsPerson: PenaltyFunction = (ctx) => {
    const qTokens = new Set(tokenize(ctx.rawProgram));
    const queryIsProgram = [...PROGRAM_TYPES].some(t => qTokens.has(t));

    if (queryIsProgram) {
        const isPersonFormat = PERSON_FORMAT_PATTERNS.some(p => p.test(ctx.rawTopic));
        if (isPersonFormat) {
            return {
                name: 'PROGRAM_VS_PERSON',
                points: PENALTIES.PROGRAM_VS_PERSON,
                reason: 'Query busca programa, topic es persona'
            };
        }
    }

    return null;
};

/**
 * Token estructural (TRIO/CH/DUO) en query pero no en topic
 */
export const structuralTokenMissing: PenaltyFunction = (ctx) => {
    const qTokens = new Set(tokenize(ctx.rawProgram));
    const tTokens = new Set(tokenize(ctx.rawTopic));

    for (const group of SYNONYM_GROUPS) {
        const queryHasGroup = group.some(t => qTokens.has(t));
        const topicHasGroup = group.some(t => tTokens.has(t));

        if (queryHasGroup && !topicHasGroup) {
            const missingToken = group.find(t => qTokens.has(t));
            return {
                name: 'STRUCTURAL_TOKEN_MISSING',
                points: PENALTIES.STRUCTURAL_TOKEN_MISSING,
                reason: `"${missingToken?.toUpperCase()}" no está en topic`
            };
        }
    }

    return null;
};

/**
 * LRU Cache para Levenshtein - evita cálculos redundantes y limita uso de memoria
 * Tamaño máximo configurable para prevenir crecimiento indefinido en sesiones largas
 */
const MAX_LEVENSHTEIN_CACHE_SIZE = 5000;
const levenshteinCache = new Map<string, number>();

/**
 * Limpiar cache de Levenshtein (llamar entre batches de matching)
 */
export function clearLevenshteinCache(): void {
    levenshteinCache.clear();
}

/**
 * Calcula la distancia de Levenshtein entre dos strings (con memoización LRU)
 * Optimizado: usa solo 2 filas en lugar de matriz completa O(n×m) -> O(min(n,m))
 */
const levenshtein = (a: string, b: string): number => {
    // Cache key simétrico (a,b) = (b,a)
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;

    // Check cache con LRU refresh
    if (levenshteinCache.has(key)) {
        const value = levenshteinCache.get(key)!;
        // Move to end (most recently used) for LRU ordering
        levenshteinCache.delete(key);
        levenshteinCache.set(key, value);
        return value;
    }

    // Casos base
    if (a.length === 0) {
        setCacheWithLimit(key, b.length);
        return b.length;
    }
    if (b.length === 0) {
        setCacheWithLimit(key, a.length);
        return a.length;
    }

    // Optimización: a siempre es el más corto para minimizar memoria
    if (a.length > b.length) [a, b] = [b, a];

    // Solo necesitamos 2 filas en lugar de matriz completa
    let prev = Array.from({ length: a.length + 1 }, (_, i) => i);
    let curr = new Array<number>(a.length + 1);

    for (let i = 1; i <= b.length; i++) {
        curr[0] = i;
        for (let j = 1; j <= a.length; j++) {
            curr[j] = b.charAt(i - 1) === a.charAt(j - 1)
                ? prev[j - 1]
                : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
        }
        [prev, curr] = [curr, prev]; // Intercambiar referencias
    }

    const result = prev[a.length];
    setCacheWithLimit(key, result);
    return result;
};

/**
 * Helper para insertar en cache respetando el límite LRU
 */
function setCacheWithLimit(key: string, value: number): void {
    // Si alcanzamos el límite, eliminar la entrada más antigua (primera en el Map)
    if (levenshteinCache.size >= MAX_LEVENSHTEIN_CACHE_SIZE) {
        const oldestKey = levenshteinCache.keys().next().value;
        if (oldestKey !== undefined) {
            levenshteinCache.delete(oldestKey);
        }
    }
    levenshteinCache.set(key, value);
}

/**
 * Penaliza si faltan tokens distintivos, usando fuzzy matching
 * Y aplica "Topic Saturation": Si el topic ya está cubierto, los tokens extra penalizan menos.
 */
export const weakMatch: PenaltyFunction = (ctx) => {
    const queryTokens = tokenizeDistinctive(ctx.rawProgram);
    const rawTopicTokens = tokenizeDistinctive(ctx.rawTopic);

    // Filtrar tokens no distintivos del topic también
    // Se expande el regex para filtrar códigos como FR3, KB2, L7, N8
    const topicTokensList = rawTopicTokens.filter(t =>
        !STRUCTURAL_TOKENS.has(t) &&
        !/^[a-z]{1,3}\d+$/i.test(t) && // Filtra l7, n8, fr3, kb1
        !/^\d+$/.test(t)
    );

    // Calcular cobertura del Topic
    let matchedTopicTokens = 0;

    for (const tToken of topicTokensList) {
        // Exact
        if (queryTokens.includes(tToken)) {
            matchedTopicTokens++;
            continue;
        }
        // Fuzzy
        const hasFuzzy = queryTokens.some(qToken => {
            const allowedDist = qToken.length < 5 ? 1 : 2;
            return levenshtein(qToken, tToken) <= allowedDist;
        });
        if (hasFuzzy) {
            matchedTopicTokens++;
        }
    }

    const isTopicFullyCovered = matchedTopicTokens >= topicTokensList.length;
    // Permitir saturación incluso si el topic tiene solo 1 token distintivo (e.g. "Pacora")
    // La seguridad está garantizada por hasPersonTitle (si hay Dr/Mr, se fuerza estrictez)
    const isTopicSpecific = topicTokensList.length >= 1;

    // Title Check (Dr, Mr...)
    const rawQueryLower = ctx.rawProgram.toLowerCase();
    const hasPersonTitle = /\b(dr|mr|mrs|ms|prof)\b/.test(rawQueryLower);

    // Person Format Check: Si AMBOS query y topic son formatos de persona,
    // los tokens extra (segundos nombres, sufijos) penalizan menos
    const queryLooksLikePerson = PERSON_FORMAT_PATTERNS.some(p => p.test(ctx.rawProgram));
    const topicLooksLikePerson = PERSON_FORMAT_PATTERNS.some(p => p.test(ctx.rawTopic));
    const bothArePeople = queryLooksLikePerson && topicLooksLikePerson;

    // Permitir info extra si:
    // 1. El topic está completamente cubierto por la query, Y
    // 2. El topic es específico (tiene al menos 1 token), Y
    // 3. No hay títulos formales (Dr, Mr...), Y
    // 4. (NUEVO) Si ambos son personas, ser más permisivo con tokens extra
    const allowExtraInfo = (isTopicFullyCovered && isTopicSpecific && !hasPersonTitle) || (bothArePeople && isTopicFullyCovered);

    const distinctiveQueryTokens = queryTokens.filter(t =>
        !STRUCTURAL_TOKENS.has(t) &&
        !/^[ln]\d+$/i.test(t) &&
        !/^\d+$/.test(t)
    );

    if (distinctiveQueryTokens.length > 0) {
        // Encontrar tokens que faltan (Query tokens NOT in Topic)
        const missingTokens = distinctiveQueryTokens.filter(qToken => {
            if (topicTokensList.includes(qToken)) return false;
            const hasFuzzy = topicTokensList.some(tToken => {
                const allowedDist = qToken.length < 5 ? 1 : 2;
                return levenshtein(qToken, tToken) <= allowedDist;
            });
            return !hasFuzzy;
        });

        if (missingTokens.length > 0) {
            if (missingTokens.length === distinctiveQueryTokens.length) {
                return {
                    name: 'WEAK_MATCH',
                    points: PENALTIES.WEAK_MATCH,
                    reason: `Ningún token distintivo coincide: ${missingTokens.join(', ')}`
                };
            } else {
                if (allowExtraInfo) {
                    return {
                        name: 'PARTIAL_MATCH_MISSING_TOKENS',
                        points: PENALTIES.MISSING_TOKEN_EXTRA_INFO * missingTokens.length,
                        reason: `Faltan tokens (Info Extra): ${missingTokens.join(', ')}`
                    };
                } else {
                    // Diagnóstico integrado
                    const mismatchReason = hasPersonTitle ? 'TitleDetected' : (!isTopicFullyCovered ? 'NoCoverage' : 'NotSpecific');
                    return {
                        name: 'PARTIAL_MATCH_MISSING_TOKENS',
                        points: PENALTIES.MISSING_TOKEN * missingTokens.length,
                        reason: `Faltan tokens (Mismatch - ${mismatchReason}): ${missingTokens.join(', ')}`
                    };
                }
            }
        }
    }

    return null;
};

/**
 * Conflicto de número de grupo (CH 1 vs CH 3)
 */
export const groupNumberConflict: PenaltyFunction = (ctx) => {
    const qGroupNums = extractNonLevelNumbers(ctx.rawProgram);
    const tGroupNums = extractNonLevelNumbers(ctx.rawTopic);

    if (qGroupNums.length > 0 && tGroupNums.length > 0) {
        const qSet = new Set(qGroupNums);
        const tSet = new Set(tGroupNums);
        const hasCommon = [...qSet].some(n => tSet.has(n));
        if (!hasCommon) {
            return {
                name: 'GROUP_NUMBER_CONFLICT',
                points: PENALTIES.GROUP_NUMBER_CONFLICT,
                reason: `Grupo ${qGroupNums.join('/')} vs ${tGroupNums.join('/')}`
            };
        }
    }

    return null;
};

/**
 * Conflicto numérico general
 */
export const numericConflict: PenaltyFunction = (ctx) => {
    const extractNumbers = (str: string) => (str || '').match(/\d+/g) || [];

    const qNums = new Set(extractNumbers(ctx.rawProgram));
    const tNums = new Set(extractNumbers(ctx.rawTopic));

    if (qNums.size > 0 && tNums.size > 0) {
        const overlap = [...qNums].some(n => tNums.has(n));
        if (!overlap) {
            return {
                name: 'NUMERIC_CONFLICT',
                points: PENALTIES.NUMERIC_CONFLICT,
                reason: `Números no coinciden`
            };
        }
    }

    return null;
};

/**
 * Número huérfano en topic con candidatos hermanos
 */
export const orphanNumberWithSiblings: PenaltyFunction = (ctx) => {
    const qNums = new Set(extractNonLevelNumbers(ctx.rawProgram));
    const tNums = extractNonLevelNumbers(ctx.rawTopic);

    // Encontrar números en topic que no están en query
    const orphans = tNums.filter(n => !qNums.has(n));

    if (orphans.length > 0) {
        // Verificar si hay hermanos con diferentes números
        // const levelPattern = /\b(?:l|n)(\d+)\b/gi;
        const basePattern = ctx.normalizedTopic.replace(/\d+/g, '').trim();

        const siblings = ctx.allCandidates.filter(m => {
            if (m.meeting_id === ctx.candidate.meeting_id) return false;
            // FIX: Usar m.topic en lugar de ctx.normalizedTopic para verificar al hermano
            const candidateBase = normalizeString(m.topic).replace(/\d+/g, '').trim();
            return candidateBase === basePattern;
        });

        if (siblings.length > 0) {
            return {
                name: 'ORPHAN_NUMBER_WITH_SIBLINGS',
                points: PENALTIES.ORPHAN_NUMBER_WITH_SIBLINGS,
                reason: `Número "${orphans[0]}" no solicitado, hay otras versiones`
            };
        }
    }

    return null;
};

/**
 * Nivel huérfano en topic con candidatos hermanos
 */
export const orphanLevelWithSiblings: PenaltyFunction = (ctx) => {
    const qLevels = new Set(extractLevels(ctx.rawProgram));
    const tLevels = extractLevels(ctx.rawTopic);

    // Si query no tiene nivel pero topic sí
    if (qLevels.size === 0 && tLevels.length > 0) {
        const orphanLevel = tLevels[0];

        // Verificar si hay hermanos con diferentes niveles
        const levelPattern = /\b(?:l|n)(\d+)\b/gi;
        const basePattern = ctx.normalizedTopic.replace(levelPattern, '').trim();

        const siblings = ctx.allCandidates.filter(m => {
            if (m.meeting_id === ctx.candidate.meeting_id) return false;
            const candidateBase = m.topic.toLowerCase().replace(levelPattern, '').trim();
            return candidateBase === basePattern;
        });

        if (siblings.length > 0) {
            return {
                name: 'ORPHAN_LEVEL_WITH_SIBLINGS',
                points: PENALTIES.ORPHAN_LEVEL_WITH_SIBLINGS,
                reason: `Nivel "L${orphanLevel}" no solicitado, hay otros niveles`
            };
        }
    }

    return null;
};

// ============================================================================
// REGISTRO DE TODAS LAS PENALIZACIONES (en orden de evaluación)
// ============================================================================

export const ALL_PENALTIES: PenaltyFunction[] = [
    criticalTokenMismatch,
    levelConflict,
    programVsPerson,
    structuralTokenMissing,
    weakMatch,
    groupNumberConflict,
    numericConflict,
    orphanNumberWithSiblings,
    orphanLevelWithSiblings,
];
