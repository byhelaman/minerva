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
    PROGRAM_TYPE_GROUPS,
    PERSON_FORMAT_PATTERNS,
    LEVENSHTEIN_CONFIG,
    getAllIrrelevantWords,
} from '../config/matching.config';
import { normalizeString } from '../utils/normalizer';

// Construir Set de palabras irrelevantes para búsqueda rápida O(1)
const IRRELEVANT_TOKENS = getAllIrrelevantWords();
// También agregamos "group", "grupo" que son estructurales comunes
IRRELEVANT_TOKENS.add('group');
IRRELEVANT_TOKENS.add('grupo');

const IGNORED_COMPANY_TOKENS = new Set([
    ...STRUCTURAL_TOKENS,
    ...PROGRAM_TYPES,
    ...Array.from(IRRELEVANT_TOKENS)
]);

// ============================================================================
// UTILIDADES COMUNES
// ============================================================================

const tokenize = (str: string): string[] =>
    normalizeString(str).split(' ').filter(t => t.length > 0);

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

// ============================================================================
// MATRIZ DE CONFLICTOS DECLARATIVA
// ============================================================================

// PROGRAM_TYPE_GROUPS importado desde matching.config.ts (fuente de verdad: matching.config.json)

/**
 * Detecta qué tipo de programa está presente en un conjunto de tokens.
 * Retorna el ID del tipo o null si no hay ninguno.
 */
function detectProgramType(tokens: Set<string>): string | null {
    for (const group of PROGRAM_TYPE_GROUPS) {
        if (group.tokens.some(t => tokens.has(t))) {
            return group.id;
        }
    }
    return null;
}

/**
 * CH vs TRIO vs DUO - tokens mutuamente excluyentes
 * Usa matriz declarativa para detectar conflictos de forma escalable.
 */
export const criticalTokenMismatch: PenaltyFunction = (ctx) => {
    const qTokens = new Set(tokenize(ctx.rawProgram));
    const tTokens = new Set(tokenize(ctx.rawTopic));

    // Verificar grupos de sinónimos primero (DUO/BVD son equivalentes)
    for (const group of SYNONYM_GROUPS) {
        const queryHas = group.filter(t => qTokens.has(t));
        const topicHas = group.filter(t => tTokens.has(t));

        if (queryHas.length > 0 && topicHas.length > 0) {
            // Ambos tienen tokens del mismo grupo de sinónimos - OK
            continue;
        }
    }

    // Detectar tipo de programa en query y topic
    const queryType = detectProgramType(qTokens);
    const topicType = detectProgramType(tTokens);

    // Si ambos tienen un tipo y son diferentes, es conflicto crítico
    if (queryType && topicType && queryType !== topicType) {
        return {
            name: 'CRITICAL_TOKEN_MISMATCH',
            points: PENALTIES.CRITICAL_TOKEN_MISMATCH,
            reason: `${queryType} vs ${topicType}`
        };
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
            // Verificar si debemos ignorar conflictos de nivel (para detección de duplicados)
            if (ctx.options?.ignoreLevelMismatch) {
                return {
                    name: 'LEVEL_MISMATCH_IGNORED',
                    points: PENALTIES.LEVEL_MISMATCH_IGNORED,
                    reason: `Ignorado: L${[...qLevels].join('/')} vs L${[...tLevels].join('/')}`
                };
            }

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
 * 
 * NOTA: No penalizamos si la query tiene prefijo BV* (BVP/BVD/BVS) ya que estos
 * prefijos a menudo están en los schedules pero NO en los topics de Zoom.
 * En ese caso, la persona en el topic ES el match correcto.
 */
export const programVsPerson: PenaltyFunction = (ctx) => {
    const qTokens = new Set(tokenize(ctx.rawProgram));
    const tTokens = new Set(tokenize(ctx.rawTopic));
    const queryIsProgram = [...PROGRAM_TYPES].some(t => qTokens.has(t));

    if (queryIsProgram) {
        const isPersonFormat = PERSON_FORMAT_PATTERNS.some(p => p.test(ctx.rawTopic));
        if (isPersonFormat) {
            // Excepción 1: Si el topic TAMBIÉN tiene tokens de programa (TRIO, DUO, CH, etc.),
            // entonces no es una persona, es un programa con formato similar.
            // Ej: "TRIO GRUPO A - L3" matchea regex de persona pero es programa.
            const topicIsAlsoProgram = [...PROGRAM_TYPES].some(t => tTokens.has(t)) ||
                [...STRUCTURAL_TOKENS].some(t => tTokens.has(t));
            if (topicIsAlsoProgram) {
                return null; // No penalizar - ambos son programas
            }

            // Excepción 2: Si la query tiene BVP/BVS (Privado) o BVD (Duo), estos prefijos
            // denotan clases con alumnos específicos (1 a 1 o parejas), lo que implica
            // una asignación a NOMBRES DE PERSONAS en lugar de un programa genérico.
            // Por lo tanto, no debemos penalizar como conflicto "Programa vs Persona".
            const hasBvPrefix = qTokens.has('bvp') || qTokens.has('bvd') || qTokens.has('bvs');
            if (hasBvPrefix) {
                return null; // No penalizar - BV* + persona es un match válido
            }

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
    // Si estamos en modo relajado (buscando duplicados), ignoramos tokens estructurales faltantes
    // (ej: query tiene 'KIDS' pero topic no)
    if (ctx.options?.ignoreLevelMismatch) return null;

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
 * Tamaño máximo desde matching.config.json
 */
const MAX_LEVENSHTEIN_CACHE_SIZE = LEVENSHTEIN_CONFIG.maxCacheSize;
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

// ============================================================================
// FUNCIONES AUXILIARES PARA WEAK MATCH
// ============================================================================

/**
 * Filtra tokens distintivos de una lista, excluyendo estructurales y códigos numéricos.
 */
function filterDistinctiveTokens(tokens: string[]): string[] {
    return tokens.filter(t =>
        !STRUCTURAL_TOKENS.has(t) &&
        !/^[a-z]{1,3}\d+$/i.test(t) && // Filtra l7, n8, fr3, kb1
        !/^\d+$/.test(t)
    );
}

/**
 * Verifica si un token tiene coincidencia fuzzy en una lista de tokens de referencia.
 * Umbral conservador: distancia 1 para evitar falsos positivos (ej: MARIA ≠ MAYRA)
 */
function hasFuzzyMatch(token: string, referenceTokens: string[]): boolean {
    // Distancia 1 siempre - solo tolera typos menores (ej: GARCIA → GARCYA)
    // Distancia 2 causaba falsos positivos con nombres similares (MARIA ↔ MAYRA)
    const allowedDist = 1;
    return referenceTokens.some(ref => levenshtein(token, ref) <= allowedDist);
}

/**
 * Calcula la cobertura del topic por la query.
 * Retorna un objeto con métricas de cobertura.
 */
function calculateTokenCoverage(queryTokens: string[], topicTokens: string[]): {
    isFullyCovered: boolean;
    isSpecific: boolean;
    matchedCount: number;
    coverage: number;
} {
    let matchedCount = 0;

    for (const tToken of topicTokens) {
        if (queryTokens.includes(tToken) || hasFuzzyMatch(tToken, queryTokens)) {
            matchedCount++;
        }
    }

    const total = topicTokens.length;

    return {
        isFullyCovered: matchedCount >= total,
        isSpecific: total >= 1,
        matchedCount,
        coverage: total > 0 ? matchedCount / total : 0
    };
}

/**
 * Detecta si query y/o topic tienen formato de persona y si hay títulos formales.
 */
function detectPersonFormat(rawProgram: string, rawTopic: string): {
    queryIsPerson: boolean;
    topicIsPerson: boolean;
    bothArePeople: boolean;
    hasPersonTitle: boolean;
} {
    const queryIsPerson = PERSON_FORMAT_PATTERNS.some(p => p.test(rawProgram));
    const topicIsPerson = PERSON_FORMAT_PATTERNS.some(p => p.test(rawTopic));
    const hasPersonTitle = /\b(dr|mr|mrs|ms|prof)\b/.test(rawProgram.toLowerCase());

    return {
        queryIsPerson,
        topicIsPerson,
        bothArePeople: queryIsPerson && topicIsPerson,
        hasPersonTitle,
    };
}

/**
 * Encuentra tokens de la query que faltan en el topic.
 */
function findMissingTokens(queryTokens: string[], topicTokens: string[]): string[] {
    return queryTokens.filter(qToken => {
        if (topicTokens.includes(qToken)) return false;
        return !hasFuzzyMatch(qToken, topicTokens);
    });
}

/**
 * Aplica la penalización por tokens faltantes según el contexto.
 */
function applyMissingTokenPenalty(
    missingTokens: string[],
    totalQueryTokens: number,
    allowExtraInfo: boolean,
    hasPersonTitle: boolean,
    isTopicCovered: boolean,
    isRelaxedMode: boolean = false
): { name: string; points: number; reason: string; metadata?: Record<string, any> } | null {
    if (missingTokens.length === 0) return null;

    // Caso 1: Ningún token distintivo coincide → WEAK_MATCH
    if (missingTokens.length === totalQueryTokens) {
        return {
            name: 'WEAK_MATCH',
            points: PENALTIES.WEAK_MATCH,
            reason: `Ningún token distintivo coincide: ${missingTokens.join(', ')}`,
            metadata: {
                coverage: 0,
                minCoverage: 1 // Irrelevante aquí, pero para consistencia
            }
        };
    }

    // Caso 2: Penalización leve por info extra (topic cubierto)
    if (allowExtraInfo) {
        // En modo relajado, distinguimos entre "Ruido" y "Info Importante"
        let totalPoints = 0;
        const details: string[] = [];

        for (const token of missingTokens) {
            let penalty: number = PENALTIES.MISSING_TOKEN_EXTRA_INFO; // Default legacy (-10)

            if (isRelaxedMode) {
                // Si es modo relajado:
                // - Ruido (TIME, ZONE, KIDS): -2
                // - Importante (Nombres, Apellidos): -15 (Para diferenciar Diana vs Luis)
                const isNoise = IRRELEVANT_TOKENS.has(token.toLowerCase());
                penalty = isNoise ? -2 : -15;
            }

            totalPoints += penalty;
            details.push(`${token}(${penalty})`);
        }

        return {
            name: 'PARTIAL_MATCH_MISSING_TOKENS',
            points: totalPoints,
            reason: `Faltan tokens (Info Extra): ${details.join(', ')}`
        };
    }

    // Caso 3: Penalización estándar por tokens faltantes
    const mismatchReason = hasPersonTitle
        ? 'TitleDetected'
        : (!isTopicCovered ? 'NoCoverage' : 'NotSpecific');

    let totalPoints = 0;
    const missingDetails: string[] = [];

    for (const token of missingTokens) {
        const isNumeric = /^\d+$/.test(token);
        if (isNumeric) {
            totalPoints += PENALTIES.MISSING_NUMERIC_TOKEN;
            missingDetails.push(`${token} (Num)`);
        } else {
            totalPoints += PENALTIES.MISSING_TOKEN;
            missingDetails.push(token);
        }
    }

    return {
        name: 'PARTIAL_MATCH_MISSING_TOKENS',
        points: totalPoints,
        reason: `Faltan tokens (Mismatch - ${mismatchReason}): ${missingDetails.join(', ')}`
    };
}

// ============================================================================
// PENALIZACIÓN WEAK MATCH (REFACTORIZADA)
// ============================================================================

/**
 * Penaliza si faltan tokens distintivos, usando fuzzy matching.
 * Aplica "Topic Saturation": Si el topic ya está cubierto, los tokens extra penalizan menos.
 */
export const weakMatch: PenaltyFunction = (ctx) => {
    // 1. Tokenizar y filtrar
    const queryTokens = tokenizeDistinctive(ctx.rawProgram);
    const topicTokens = filterDistinctiveTokens(tokenizeDistinctive(ctx.rawTopic));
    const distinctiveQueryTokens = filterDistinctiveTokens(queryTokens);

    if (distinctiveQueryTokens.length === 0) return null;

    // 2. Calcular cobertura y detectar formatos
    const coverage = calculateTokenCoverage(queryTokens, topicTokens);
    const personFormat = detectPersonFormat(ctx.rawProgram, ctx.rawTopic);

    // 3. Determinar si se permite info extra
    // Solo relajamos cobertura si hay suficientes tokens en la query (> 1) para evitar falsos positivos
    // en queries cortas genéricas ej: "WORKSHOP" (1 token) vs "Workshop/Training" (2 tokens) -> 0.5 coverage
    const isRelaxedMode = !!ctx.options?.ignoreLevelMismatch && distinctiveQueryTokens.length > 1;
    const minCoverage = isRelaxedMode ? 0.4 : 0.66; // 0.66 hardcoded from config value usually

    const allowExtraInfo =
        (coverage.isFullyCovered && coverage.isSpecific && !personFormat.hasPersonTitle) ||
        (personFormat.bothArePeople && coverage.isFullyCovered) ||
        (isRelaxedMode && coverage.coverage >= minCoverage); // Modo relax permite basura extra si cumple mínimo

    if (coverage.coverage < minCoverage) {
        return {
            name: 'WEAK_MATCH',
            points: PENALTIES.WEAK_MATCH,
            reason: `Cobertura insuficiente (${Math.round(coverage.coverage * 100)}% < ${Math.round(minCoverage * 100)}%)`,
            metadata: {
                coverage: coverage.coverage,
                minCoverage
            }
        };
    }

    // 4. Encontrar tokens faltantes
    let missingTokens = findMissingTokens(distinctiveQueryTokens, topicTokens);

    // Si ignoramos mismatch de nivel, no penalizar si el token faltante es un nivel (L#)
    if (ctx.options?.ignoreLevelMismatch) {
        // Regex para tokens de nivel ej "l7", "l12"
        const levelTokenRegex = /^l\d+$/i;
        missingTokens = missingTokens.filter(t => !levelTokenRegex.test(t));
    }

    // 5. Aplicar penalización
    return applyMissingTokenPenalty(
        missingTokens,
        distinctiveQueryTokens.length,
        allowExtraInfo,
        personFormat.hasPersonTitle,
        coverage.isFullyCovered,
        isRelaxedMode
    );
};

/**
 * Conflicto de número de grupo (CH 1 vs CH 3)
 */
export const groupNumberConflict: PenaltyFunction = (ctx) => {
    // Si buscamos duplicados, ignorar conflicto de grupo (ej: cambio de G1 a G3)
    if (ctx.options?.ignoreLevelMismatch) return null;

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
        // Si ignoramos nivel, asumimos que los conflictos numéricos pueden derivar de ahí
        // y confiamos en la validación por nombre/topic
        if (ctx.options?.ignoreLevelMismatch) return null;

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

/**
 * Conflicto de Compañía (Scotiabank vs Hayduk)
 * Detecta si la query empieza con una compañía explícita y el topic tiene otra diferente entre paréntesis.
 */
export const companyConflict: PenaltyFunction = (ctx) => {
    // 1. Detectar posible compañía en la Query (primer token significativo en mayúsculas)
    const queryTokens = tokenize(ctx.rawProgram);
    let queryCompany: string | null = null;

    for (const token of queryTokens) {
        if (token.length > 2 && !IGNORED_COMPANY_TOKENS.has(token) && !/^\d+$/.test(token)) {
            queryCompany = token;
            break; // Tomamos solo el primero como candidato principal
        }
    }

    if (!queryCompany) return null;

    // 2. Detectar compañías en el Topic (dentro de paréntesis)
    // Buscamos contenido dentro de paréntesis: (HAYDUK), (SCOTIABANK), (ONLINE)
    const topicCompanyMatches = [...ctx.rawTopic.matchAll(/\(([^)]+)\)/g)];
    const topicCompanies: string[] = [];

    for (const match of topicCompanyMatches) {
        const content = match[1]; // contenido sin paréntesis
        const tokens = tokenize(content);
        // Filtrar tokens ignorados (ONLINE, HIBRIDO, etc.)
        const validTokens = tokens.filter(t =>
            t.length > 2 &&
            !IGNORED_COMPANY_TOKENS.has(t) &&
            !/^\d+$/.test(t)
        );
        topicCompanies.push(...validTokens);
    }

    if (topicCompanies.length === 0) return null;

    // 3. Verificar si hay conflicto
    // Si la compañía de la query NO está en las compañías del topic
    const hasMatch = topicCompanies.some(tc => {
        // Coincidencia exacta o fuzzy cercano
        return tc === queryCompany || levenshtein(tc, queryCompany!) <= 2;
    });

    if (!hasMatch) {
        // SAFETY CHECK: Validar si la "compañía" detectada en la query es en realidad parte del NOMBRE de la persona
        // Ej: Query "ESPINOZA" vs Topic "JUAN ESPINOZA (REPSOL)"
        // "ESPINOZA" != "REPSOL", pero "ESPINOZA" está en "JUAN ESPINOZA".

        // Remover contenido entre paréntesis para aislar el nombre
        const topicNamePart = ctx.rawTopic.replace(/\([^)]+\)/g, '');
        const topicNameTokens = tokenize(topicNamePart);

        // Verificar si el candidato a compañía está en el nombre
        const isPartOfName = topicNameTokens.some(t =>
            t === queryCompany || (t.length > 3 && levenshtein(t, queryCompany!) <= 1)
        );

        if (isPartOfName) {
            return null; // Es un nombre, no un conflicto de compañía
        }

        // Verificar excepciones:
        // Si la query es SOLO la compañía (ej: "SCOTIABANK"), el mismatch es crítico.
        // Si la query tiene más cosas, asegurarnos que queryCompany no sea parte del nombre de la persona (riesgo de falso positivo)
        // Pero asumimos que las compañías en Topic están en paréntesis y nombres no.

        return {
            name: 'COMPANY_CONFLICT',
            points: PENALTIES.COMPANY_CONFLICT,
            reason: `Compañía query '${queryCompany?.toUpperCase()}' vs topic '${topicCompanies.join(', ').toUpperCase()}'`
        };
    }

    return null;
};

// ============================================================================
// REGISTRO DE TODAS LAS PENALIZACIONES (en orden de evaluación)
// ============================================================================

export const ALL_PENALTIES: PenaltyFunction[] = [
    criticalTokenMismatch,
    levelConflict,
    companyConflict,
    programVsPerson,
    structuralTokenMissing,
    weakMatch,
    groupNumberConflict,
    numericConflict,
    orphanNumberWithSiblings,
    orphanLevelWithSiblings,
];
