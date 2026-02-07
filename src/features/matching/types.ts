import type { Schedule } from '@/features/schedules/types';

// ── Tipos de candidatos Zoom ───────────────────────────────────────

export interface ZoomMeetingCandidate {
    meeting_id: string;
    topic: string;
    host_id: string;
    start_time: string;
    join_url?: string;
    created_at?: string;
}

export interface ZoomUserCandidate {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    display_name: string;
}

// ── Resultado de matching ──────────────────────────────────────────

export interface MatchResult {
    schedule: Schedule;
    originalState?: Omit<MatchResult, 'originalState'>;
    status: 'assigned' | 'to_update' | 'not_found' | 'ambiguous' | 'manual';
    reason: string;
    detailedReason?: string;
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
    manualMode?: boolean;
}

// ── Mensajes del Web Worker ────────────────────────────────────────

export type WorkerMessage =
    | { type: 'INIT'; meetings: ZoomMeetingCandidate[]; users: ZoomUserCandidate[] }
    | { type: 'MATCH'; schedules: Schedule[] };

export type WorkerResponse =
    | { type: 'READY' }
    | { type: 'MATCH_RESULT'; results: MatchResult[] }
    | { type: 'ERROR'; error: string };
