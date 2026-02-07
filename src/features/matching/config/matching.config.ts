/**
 * Configuración del Sistema de Matching
 * 
 * Lee la configuración desde 'matching.config.json' que actúa como
 * fuente única de verdad para el sistema.
 */

import config from './matching.config.json';

// ============================================================================
// TYPES
// ============================================================================

export type MatchingConfig = typeof config;
export type Penalties = typeof config.scoring.penalties;
export type Thresholds = typeof config.scoring.thresholds;

// ============================================================================
// EXPORTS DIRECTOS DEL JSON
// ============================================================================

export const PENALTIES = config.scoring.penalties;
export const THRESHOLDS = config.scoring.thresholds;
export const BASE_SCORE = config.scoring.baseScore;

export const SYNONYM_GROUPS = config.tokens.synonyms;

export const STRUCTURAL_TOKENS = new Set(config.tokens.structural);
export const PROGRAM_TYPES = new Set(config.tokens.programTypes);
export const PROGRAM_TYPE_GROUPS = config.tokens.programTypeGroups;
export const LEVENSHTEIN_CONFIG = config.fuzzyMatching.levenshtein;

// ============================================================================
// PATRONES REGEX
// ============================================================================

/**
 * Patrón para detectar indicadores de nivel (L3, N4, Level 5, Nivel 3)
 */
export const LEVEL_PATTERN = /\b(?:l|n|level|nivel)\s*(\d+)\b/gi;

/**
 * Patrón para detectar formato de persona, cargado desde config
 */
export const PERSON_FORMAT_PATTERNS = config.personDetection.patterns.map(p => new RegExp(p, 'i'));

/**
 * Helper para obtener todas las palabras irrelevantes como un Set plano
 * Útil para penalties.ts y normalizer.ts
 */
export const getAllIrrelevantWords = (): Set<string> => {
    // Filtrar patterns de la lista plana de palabras
    const { patterns, ...wordsOnly } = config.irrelevantWords;
    const allWords = Object.values(wordsOnly).flat();
    return new Set(allWords);
};

export const CONFIG = config;
