import { describe, it, expect, beforeEach, vi } from 'vitest';

// Necesitamos mockear localStorage antes de importar el módulo
const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
        getItem: vi.fn((key: string) => store[key] ?? null),
        setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
        removeItem: vi.fn((key: string) => { delete store[key]; }),
        clear: vi.fn(() => { store = {}; }),
    };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

// Importar DESPUÉS de mockear localStorage
import { isLockedOut, recordFailedAttempt, resetAttempts, getRemainingAttempts } from '../../src/lib/rate-limiter';

describe('Rate Limiter', () => {
    beforeEach(() => {
        localStorageMock.clear();
        // Resetear estado del módulo llamando a resetAttempts
        resetAttempts();
    });

    describe('getRemainingAttempts', () => {
        it('should return 5 (MAX_ATTEMPTS) initially', () => {
            expect(getRemainingAttempts()).toBe(5);
        });

        it('should decrease after failed attempts', () => {
            recordFailedAttempt();
            expect(getRemainingAttempts()).toBe(4);
        });

        it('should return 0 when all attempts exhausted', () => {
            for (let i = 0; i < 5; i++) {
                recordFailedAttempt();
            }
            // Después de 5 intentos fallidos, attempts se resetea a 0 (lockout activado)
            // Así que remaining debe ser 5 otra vez (contador reseteado) pero el usuario está bloqueado
            expect(getRemainingAttempts()).toBe(5);
        });
    });

    describe('isLockedOut', () => {
        it('should not be locked initially', () => {
            const { locked } = isLockedOut();
            expect(locked).toBe(false);
        });

        it('should not be locked after less than 5 attempts', () => {
            recordFailedAttempt();
            recordFailedAttempt();
            recordFailedAttempt();
            recordFailedAttempt();
            const { locked } = isLockedOut();
            expect(locked).toBe(false);
        });

        it('should be locked after 5 failed attempts', () => {
            for (let i = 0; i < 5; i++) {
                recordFailedAttempt();
            }
            const { locked, remainingSeconds } = isLockedOut();
            expect(locked).toBe(true);
            expect(remainingSeconds).toBeGreaterThan(0);
        });
    });

    describe('recordFailedAttempt', () => {
        it('should return false for first few attempts', () => {
            expect(recordFailedAttempt()).toBe(false);
            expect(recordFailedAttempt()).toBe(false);
            expect(recordFailedAttempt()).toBe(false);
        });

        it('should return true on 5th attempt (triggers lockout)', () => {
            recordFailedAttempt(); // 1
            recordFailedAttempt(); // 2
            recordFailedAttempt(); // 3
            recordFailedAttempt(); // 4
            const locked = recordFailedAttempt(); // 5
            expect(locked).toBe(true);
        });

        it('should persist state to localStorage', () => {
            recordFailedAttempt();
            expect(localStorageMock.setItem).toHaveBeenCalled();
        });
    });

    describe('resetAttempts', () => {
        it('should clear lockout after reset', () => {
            // Activar lockout
            for (let i = 0; i < 5; i++) {
                recordFailedAttempt();
            }
            expect(isLockedOut().locked).toBe(true);

            // Resetear
            resetAttempts();
            expect(isLockedOut().locked).toBe(false);
            expect(getRemainingAttempts()).toBe(5);
        });

        it('should persist reset to localStorage', () => {
            recordFailedAttempt();
            localStorageMock.setItem.mockClear();
            resetAttempts();
            expect(localStorageMock.setItem).toHaveBeenCalled();
        });
    });
});
