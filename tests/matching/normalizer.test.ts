import { describe, it, expect } from 'vitest';
import { normalizeString, removeIrrelevant, canonical } from '../../src/features/matching/utils/normalizer';

// =============================================================================
// removeIrrelevant
// =============================================================================

describe('removeIrrelevant', () => {
    it('should remove common irrelevant words (ONLINE, PER)', () => {
        const result = removeIrrelevant('GARCIA (PER)(ONLINE), Juan');
        expect(result).not.toContain('ONLINE');
        expect(result).not.toContain('PER');
    });

    it('should return empty string for empty input', () => {
        expect(removeIrrelevant('')).toBe('');
    });

    it('should return empty string for null-ish input', () => {
        expect(removeIrrelevant(null as any)).toBe('');
    });

    it('should trim extra spaces after removal', () => {
        const result = removeIrrelevant('Something ONLINE Here');
        expect(result).not.toMatch(/\s{2,}/); // Sin espacios dobles
    });

    it('should keep BVP (not in irrelevant words list)', () => {
        const result = removeIrrelevant('BVP - JUAN GARCIA');
        // BVP NO se elimina — es un token significativo para el matching
        expect(result).toContain('BVP');
    });
});

// =============================================================================
// normalizeString
// =============================================================================

describe('normalizeString', () => {
    it('should convert to lowercase', () => {
        expect(normalizeString('HELLO WORLD')).toBe('hello world');
    });

    it('should remove diacritics/accents', () => {
        const result = normalizeString('García López');
        expect(result).not.toContain('í');
        expect(result).not.toContain('ó');
        expect(result).toContain('garcia');
        expect(result).toContain('lopez');
    });

    it('should convert underscores to spaces (pre-clean)', () => {
        const result = normalizeString('F2F_PER');
        // "F2F" y "PER" son palabras irrelevantes → eliminadas
        // Pero el guion bajo debe convertirse en espacio primero
        expect(result).not.toContain('_');
    });

    it('should convert dashes to spaces (pre-clean)', () => {
        const result = normalizeString('BVP - JUAN');
        // BVP es irrelevante, eliminado
        expect(result).toContain('juan');
        expect(result).not.toContain('-');
    });

    it('should normalize and collapse whitespace', () => {
        const result = normalizeString('  HELLO   WORLD  ');
        expect(result).toBe('hello world');
    });

    it('should return empty string for empty input', () => {
        expect(normalizeString('')).toBe('');
    });

    it('should return empty string for null-ish input', () => {
        expect(normalizeString(null as any)).toBe('');
        expect(normalizeString(undefined as any)).toBe('');
    });

    it('should handle complex real-world schedule program', () => {
        const result = normalizeString('García López (PER)(ONLINE), María Fernanda');
        // Debe ser minúscula, sin acentos, sin palabras irrelevantes
        expect(result).toContain('garcia');
        expect(result).toContain('lopez');
        expect(result).toContain('maria');
        expect(result).toContain('fernanda');
        expect(result).not.toMatch(/\bper\b/);
        expect(result).not.toMatch(/\bonline\b/);
    });

    it('should handle topic format with BVP prefix', () => {
        const result = normalizeString('BVP - JUAN ALBERTO RIVERA - L9 (ONLINE)');
        expect(result).toContain('juan');
        expect(result).toContain('alberto');
        expect(result).toContain('rivera');
        // BVP se mantiene (token significativo), ONLINE se elimina
        expect(result).toContain('bvp');
        expect(result).not.toMatch(/\bonline\b/);
    });
});

// =============================================================================
// canonical
// =============================================================================

describe('canonical', () => {
    it('should remove all non-alphanumeric characters', () => {
        const result = canonical('Hello World!');
        expect(result).toBe('helloworld');
    });

    it('should produce a clean identifier from complex input', () => {
        const result = canonical('García López (PER)');
        // Sin acentos, sin paréntesis, sin espacios
        expect(result).toMatch(/^[a-z0-9]+$/);
        expect(result).toContain('garcia');
        expect(result).toContain('lopez');
    });

    it('should return empty string for empty input', () => {
        expect(canonical('')).toBe('');
    });

    it('should return same result for equivalent inputs', () => {
        // Estos deben normalizar a la misma forma canónica
        const a = canonical('García López');
        const b = canonical('garcia lopez');
        expect(a).toBe(b);
    });
});
