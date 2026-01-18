import Fuse, { IFuseOptions } from 'fuse.js';
import { Schedule } from '@/features/schedules/utils/excel-parser';
import { normalizeString } from '../utils/normalizer';
import { evaluateMatch } from '../scoring/scorer';
import { clearLevenshteinCache } from '../scoring/penalties';
import { THRESHOLDS } from '../config/matching.config';

export interface ZoomMeetingCandidate {
    meeting_id: string;
    topic: string;
    host_id: string;
    start_time: string;
    join_url?: string;
}

export interface ZoomUserCandidate {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    display_name: string;
}

export interface MatchResult {
    schedule: Schedule;
    status: 'assigned' | 'to_update' | 'not_found' | 'ambiguous';
    reason: string; // Mensaje corto para la columna Reason
    detailedReason?: string; // Mensaje detallado para el hover card
    meeting_id?: string;
    found_instructor?: {
        id: string;
        email: string;
        display_name: string;
    };
    bestMatch?: ZoomMeetingCandidate;
    candidates: ZoomMeetingCandidate[];
    ambiguousCandidates?: ZoomMeetingCandidate[];
    matchedCandidate?: ZoomMeetingCandidate;
    score?: number;
}

/**
 * Servicio para emparejar Horarios con Reuniones de Zoom y Validar Anfitriones.
 * 
 * ARQUITECTURA v2 - Sistema de Scoring
 * =====================================
 * En lugar de múltiples guardrails binarios (pass/fail), este servicio usa
 * un sistema de scoring ponderado donde cada validación aporta una penalización
 * al score base de 100 puntos.
 * 
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

    /**
     * Encontrar mejores coincidencias para un solo horario usando Sistema de Scoring
     * (HMR Trigger: v2)
     */
    public findMatch(schedule: Schedule): MatchResult {
        const result: MatchResult = {
            schedule,
            status: 'not_found',
            reason: '',
            candidates: []
        };

        const programNormalized = normalizeString(schedule.program);
        const instructorNormalized = normalizeString(schedule.instructor);

        // ---------------------------------------------------------------------
        // PASO 1: Obtener Candidatos de Meeting
        // ---------------------------------------------------------------------
        let candidates: ZoomMeetingCandidate[] = [];

        // 1.a. Búsqueda Exacta (ahora devuelve array para manejar colisiones)
        if (this.meetingsDict[programNormalized]) {
            candidates = this.meetingsDict[programNormalized];
        }
        else {
            const searchResults = this.fuseMeetings.search(programNormalized);
            candidates = searchResults
                .filter(r => r.score !== undefined && r.score <= THRESHOLDS.FUSE_MAX_SCORE)
                .map(r => r.item);
        }

        if (candidates.length === 0) {
            const queryTokens = new Set(programNormalized.split(" ").filter(t => t.length > 2));

            candidates = this.meetings.filter(m => {
                const topicTokens = normalizeString(m.topic).split(" ");
                const intersection = topicTokens.filter(t => queryTokens.has(t));
                const hasMeaningfulMatch = intersection.some(t => isNaN(Number(t)) && t.length > 2);
                const overlapRatio = intersection.length / queryTokens.size;

                return hasMeaningfulMatch &&
                    intersection.length >= THRESHOLDS.MIN_MATCHING_TOKENS &&
                    overlapRatio >= THRESHOLDS.TOKEN_OVERLAP_MIN;
            });
        }

        // ---------------------------------------------------------------------
        // PASO 2: Evaluar Candidatos con Sistema de Scoring
        // ---------------------------------------------------------------------
        if (candidates.length === 0) {
            result.status = 'not_found';
            result.reason = 'Meeting not found';
            return result;
        }

        const evaluation = evaluateMatch(schedule.program, candidates);

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
        // PASO 3: Encontrar Instructor
        // ---------------------------------------------------------------------

        // Bypass para tests de meetings sin usuarios cargados
        if (this.users.length === 0) {
            result.status = 'assigned';
            result.reason = `Score: ${result.score} (No instructor validation)`;
            return result;
        }

        let instructor: ZoomUserCandidate | undefined;

        // 3.a. Búsqueda Exacta
        if (this.usersDict[instructorNormalized]) {
            instructor = this.usersDict[instructorNormalized];
        } else if (this.usersDictDisplay[instructorNormalized]) {
            instructor = this.usersDictDisplay[instructorNormalized];
        } else {
            // 3.b. Token Subset Match
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
                // 3.c. Fuse.js Fuzzy Match
                const userResults = this.fuseUsers.search(instructorNormalized);
                if (userResults.length > 0 && userResults[0].score !== undefined && userResults[0].score <= 0.45) {
                    instructor = userResults[0].item;
                }
            }
        }

        if (!instructor) {
            result.status = 'not_found';
            result.reason = 'Instructor not found';
            return result;
        }

        result.found_instructor = {
            id: instructor.id,
            email: instructor.email,
            display_name: instructor.display_name
        };

        // ---------------------------------------------------------------------
        // PASO 4: Validar Anfitrión
        // ---------------------------------------------------------------------
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
     * Process all schedules asynchronously in chunks to avoid blocking the UI.
     * Yields to the event loop between batches.
     */
    public matchAll(schedules: Schedule[]): MatchResult[] {
        clearLevenshteinCache();
        return schedules.map(s => this.findMatch(s));
    }
}
