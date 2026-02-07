import Fuse, { IFuseOptions } from 'fuse.js';
import type { Schedule } from '@/features/schedules/types';
import { normalizeString } from '../utils/normalizer';
import { evaluateMatch } from '../scoring/scorer';
import { clearLevenshteinCache } from '../scoring/penalties';
import { THRESHOLDS } from '../config/matching.config';
import type { MatchOptions } from '../scoring/types';
import type { ZoomMeetingCandidate, ZoomUserCandidate, MatchResult } from '../types';

// Re-exportar tipos para mantener compatibilidad con imports existentes
export type { ZoomMeetingCandidate, ZoomUserCandidate, MatchResult } from '../types';

/**
 * Servicio para emparejar Horarios con Reuniones de Zoom y Validar Anfitriones.
 * 
 * ARQUITECTURA v2 - Sistema de Scoring
 * =====================================
 * Flujo:
 * 1. Obtener candidatos (Exact Match, Fuse.js, o Token Set Match)
 * 2. Calcular score para cada candidato aplicando penalizaciones
 * 3. Decidir resultado basándose en umbrales de score
 */
export class MatchingService {
    private fuseMeetings: Fuse<ZoomMeetingCandidate>;
    private fuseUsers: Fuse<ZoomUserCandidate>;
    private meetingsDict: Record<string, ZoomMeetingCandidate[]> = {};
    private usersDict: Record<string, ZoomUserCandidate> = {};
    private usersDictDisplay: Record<string, ZoomUserCandidate> = {};
    private users: ZoomUserCandidate[] = [];
    private meetings: ZoomMeetingCandidate[] = [];

    constructor(meetings: ZoomMeetingCandidate[], users: ZoomUserCandidate[] = []) {
        this.users = users;
        this.meetings = meetings;

        // 1. Preparar Diccionarios para Búsqueda Exacta (Normalizada)
        // Usando arrays para manejar colisiones cuando múltiples meetings normalizan al mismo key
        meetings.forEach(m => {
            const key = normalizeString(m.topic);
            if (key) {
                if (!this.meetingsDict[key]) this.meetingsDict[key] = [];
                this.meetingsDict[key].push(m);
            }
        });

        users.forEach(u => {
            const fullName = `${u.first_name || ''} ${u.last_name || ''}`.trim();
            if (fullName) {
                this.usersDict[normalizeString(fullName)] = u;
            }
            if (u.display_name) {
                this.usersDictDisplay[normalizeString(u.display_name)] = u;
            }
        });

        // 2. Configurar Fuse.js para Búsquedas Difusas (Meetings)
        const meetingsOptions: IFuseOptions<ZoomMeetingCandidate> = {
            includeScore: true,
            keys: ['topic'],
            threshold: THRESHOLDS.FUSE_MAX_SCORE,
            ignoreLocation: true,
            useExtendedSearch: false, // Match difuso estándar es más robusto para ruido
        };
        const normalizedMeetings = meetings.map(m => ({
            ...m,
            normalized_topic: normalizeString(m.topic)
        }));
        this.fuseMeetings = new Fuse(normalizedMeetings, {
            ...meetingsOptions,
            keys: ['normalized_topic']
        });

        // 3. Configurar Fuse.js para Búsquedas Difusas (Users)
        const usersOptions: IFuseOptions<ZoomUserCandidate> = {
            includeScore: true,
            threshold: 0.45,
            ignoreLocation: true,
            ignoreFieldNorm: true,
            keys: ['normalized_name', 'normalized_display']
        };
        const normalizedUsers = users.map(u => ({
            ...u,
            normalized_name: normalizeString(`${u.first_name} ${u.last_name}`),
            normalized_display: normalizeString(u.display_name)
        }));
        this.fuseUsers = new Fuse(normalizedUsers, usersOptions);
    }

    // =========================================================================
    // MÉTODOS PRIVADOS DE BÚSQUEDA
    // =========================================================================

    /**
     * Busca candidatos de meeting usando estrategia escalonada:
     * 1. Búsqueda exacta en diccionario normalizado
     * 2. Búsqueda fuzzy con Fuse.js
     * 3. Token set matching como fallback
     * 
     * @param programNormalized - El programa ya normalizado
     * @returns Array de candidatos encontrados
     */
    private findMeetingCandidates(programNormalized: string): ZoomMeetingCandidate[] {
        // 1. Búsqueda Exacta (devuelve array para manejar colisiones)
        if (this.meetingsDict[programNormalized]) {
            return this.meetingsDict[programNormalized];
        }

        // 2. Búsqueda Fuzzy con Fuse.js
        const searchResults = this.fuseMeetings.search(programNormalized);
        const fuzzyMatches = searchResults
            .filter(r => r.score !== undefined && r.score <= THRESHOLDS.FUSE_MAX_SCORE)
            .map(r => r.item);

        if (fuzzyMatches.length > 0) {
            return fuzzyMatches;
        }

        // 3. Coincidencia por Conjunto de Tokens (alternativa)
        const queryTokens = new Set(programNormalized.split(" ").filter(t => t.length >= 2));

        return this.meetings.filter(m => {
            const topicTokens = normalizeString(m.topic).split(" ");
            const intersection = topicTokens.filter(t => queryTokens.has(t));
            const hasMeaningfulMatch = intersection.some(t => isNaN(Number(t)) && t.length > 2);
            const overlapRatio = intersection.length / queryTokens.size;

            return hasMeaningfulMatch &&
                intersection.length >= THRESHOLDS.MIN_MATCHING_TOKENS &&
                overlapRatio >= THRESHOLDS.TOKEN_OVERLAP_MIN;
        });
    }

    /**
     * Encontrar mejores coincidencias para un solo horario usando Sistema de Scoring
     * (HMR Trigger: v2)
     */
    public findMatch(schedule: Schedule, options?: MatchOptions): MatchResult {
        const result: MatchResult = {
            schedule,
            status: 'not_found',
            reason: '',
            candidates: []
        };

        const programNormalized = normalizeString(schedule.program);
        const instructorNormalized = normalizeString(schedule.instructor);

        // ---------------------------------------------------------------------
        // PASO 1: Encontrar Instructor (ANTES de evaluar meetings)
        // Esto permite que found_instructor esté disponible para todos los status
        // ---------------------------------------------------------------------
        let instructor: ZoomUserCandidate | undefined;

        if (this.users.length > 0) {
            // 1.a. Búsqueda Exacta por nombre
            if (this.usersDict[instructorNormalized]) {
                instructor = this.usersDict[instructorNormalized];
            } else if (this.usersDictDisplay[instructorNormalized]) {
                instructor = this.usersDictDisplay[instructorNormalized];
            } else {
                // 1.b. Coincidencia de Subconjunto de Tokens
                const queryTokens = new Set(instructorNormalized.split(" "));
                const tokenMatches = this.users.filter(u => {
                    const uNameTokens = normalizeString(`${u.first_name} ${u.last_name}`).split(" ");
                    const uDisplayTokens = normalizeString(u.display_name).split(" ");
                    return uNameTokens.every(t => queryTokens.has(t)) ||
                        uDisplayTokens.every(t => queryTokens.has(t));
                });

                if (tokenMatches.length > 0) {
                    instructor = tokenMatches.reduce((prev, current) => {
                        const prevLen = Math.max(
                            normalizeString(`${prev.first_name} ${prev.last_name}`).split(" ").length,
                            normalizeString(prev.display_name).split(" ").length
                        );
                        const currLen = Math.max(
                            normalizeString(`${current.first_name} ${current.last_name}`).split(" ").length,
                            normalizeString(current.display_name).split(" ").length
                        );
                        return currLen > prevLen ? current : prev;
                    });
                } else {
                    // 1.c. Coincidencia Difusa con Fuse.js (con validación adicional)
                    const userResults = this.fuseUsers.search(instructorNormalized);
                    if (userResults.length > 0 && userResults[0].score !== undefined && userResults[0].score <= 0.45) {
                        const candidate = userResults[0].item;

                        // Validación adicional: evitar falsos positivos por apellido común
                        // Requiere que al menos 2 tokens coincidan, o si ambos tienen ≤2 tokens, todos deben coincidir
                        const candidateTokens = new Set([
                            ...normalizeString(`${candidate.first_name} ${candidate.last_name}`).split(" "),
                            ...normalizeString(candidate.display_name).split(" ")
                        ]);
                        const queryTokensArr = instructorNormalized.split(" ");
                        const matchingTokens = queryTokensArr.filter(t => candidateTokens.has(t));

                        const queryTokenCount = queryTokensArr.length;
                        const minRequiredMatches = queryTokenCount <= 2 ? queryTokenCount : 2;

                        if (matchingTokens.length >= minRequiredMatches) {
                            instructor = candidate;
                        }
                    }
                }
            }

            // Setear found_instructor si se encontró
            if (instructor) {
                result.found_instructor = {
                    id: instructor.id,
                    email: instructor.email,
                    display_name: instructor.display_name
                };
            }
        }

        // ---------------------------------------------------------------------
        // PASO 2: Obtener Candidatos de Meeting (usando método compartido)
        // ---------------------------------------------------------------------
        const candidates = this.findMeetingCandidates(programNormalized);

        // ---------------------------------------------------------------------
        // PASO 3: Evaluar Candidatos con Sistema de Scoring
        // ---------------------------------------------------------------------
        if (candidates.length === 0) {
            result.status = 'not_found';
            result.reason = 'Meeting not found';
            return result;
        }

        const evaluation = evaluateMatch(schedule.program, candidates, options);

        if (evaluation.decision === 'not_found') {
            result.status = 'not_found';
            result.reason = evaluation.reason;
            result.detailedReason = evaluation.detailedReason;
            if (evaluation.bestMatch) {
                result.bestMatch = evaluation.bestMatch.candidate;
            }
            return result;
        }

        if (evaluation.decision === 'ambiguous') {
            result.status = 'ambiguous';
            result.reason = evaluation.reason;
            result.detailedReason = evaluation.detailedReason;
            result.ambiguousCandidates = evaluation.ambiguousCandidates;
            if (evaluation.bestMatch) {
                result.bestMatch = evaluation.bestMatch.candidate;
                result.score = evaluation.bestMatch.finalScore;
            }
            return result;
        }

        // Match encontrado
        const meeting = evaluation.bestMatch!.candidate;
        result.meeting_id = meeting.meeting_id;
        result.matchedCandidate = meeting;
        result.bestMatch = meeting;
        result.score = evaluation.bestMatch!.finalScore;

        // ---------------------------------------------------------------------
        // PASO 4: Validar Anfitrión
        // ---------------------------------------------------------------------

        // Bypass para tests de meetings sin usuarios cargados
        if (this.users.length === 0) {
            result.status = 'assigned';
            result.reason = `Score: ${result.score} (No instructor validation)`;
            return result;
        }

        if (!instructor) {
            result.status = 'not_found';
            result.reason = 'Instructor not found';
            return result;
        }

        if (meeting.host_id === instructor.id) {
            result.status = 'assigned';
            result.reason = evaluation.confidence === 'high' ? '-' : `Score: ${result.score}`;
        } else {
            result.status = 'to_update';
            result.reason = evaluation.confidence === 'high' ? '-' : `Score: ${result.score}`;
        }

        return result;
    }

    /**
     * Buscar coincidencia solo por tema (sin validación de instructor).
     * Usado para CreateLinkModal donde solo queremos verificar si existe una reunión.
     */
    public findMatchByTopic(topic: string, options?: MatchOptions): MatchResult {
        // Crear un horario falso con solo el programa
        const fakeSchedule = { program: topic, instructor: '' } as any;

        const result: MatchResult = {
            schedule: fakeSchedule,
            status: 'not_found',
            reason: '',
            candidates: []
        };

        const programNormalized = normalizeString(topic);

        // Obtener candidatos usando método compartido
        const candidates = this.findMeetingCandidates(programNormalized);

        result.candidates = candidates;

        if (candidates.length === 0) {
            result.reason = 'Not found';
            return result;
        }

        // Evaluar candidatos - evaluateMatch espera string rawProgram
        const evaluation = evaluateMatch(topic, candidates, options);

        if (evaluation.decision === 'not_found') {
            result.reason = evaluation.reason;
            result.detailedReason = evaluation.detailedReason;
            if (evaluation.bestMatch) {
                result.bestMatch = evaluation.bestMatch.candidate;
                result.matchedCandidate = evaluation.bestMatch.candidate;
            }
            return result;
        }

        if (evaluation.decision === 'ambiguous') {
            result.status = 'ambiguous';
            result.reason = evaluation.reason;
            result.detailedReason = evaluation.detailedReason;
            result.ambiguousCandidates = evaluation.ambiguousCandidates;
            if (evaluation.bestMatch) {
                result.bestMatch = evaluation.bestMatch.candidate;
                result.score = evaluation.bestMatch.finalScore;
            }
            return result;
        }

        // Coincidencia encontrada - asignar sin validación de instructor
        const meeting = evaluation.bestMatch!.candidate;
        result.status = 'assigned';
        result.meeting_id = meeting.meeting_id;
        result.matchedCandidate = meeting;
        result.bestMatch = meeting;
        result.score = evaluation.bestMatch!.finalScore;
        result.reason = `Score: ${result.score}`;

        return result;
    }

    /**
     * Procesar todos los horarios asíncronamente en fragmentos para evitar bloquear la UI.
     * Cede el control al event loop entre lotes.
     */
    public matchAll(schedules: Schedule[]): MatchResult[] {
        clearLevenshteinCache();
        return schedules.map(s => this.findMatch(s));
    }
}
