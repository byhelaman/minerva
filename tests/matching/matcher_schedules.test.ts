import { describe, it, expect, beforeEach } from 'vitest';
import { MatchingService, ZoomMeetingCandidate, ZoomUserCandidate } from '../../src/features/matching/services/matcher';

const mockUsers: ZoomUserCandidate[] = [
    { id: 'u1', email: 'u1@test.com', first_name: 'Steve', last_name: 'Miller', display_name: 'Steve Miller' },
    { id: 'u2', email: 'u2@test.com', first_name: 'Diana', last_name: 'Cooper', display_name: 'Diana Cooper' },
];

const mockMeetings: ZoomMeetingCandidate[] = [
    // Rivera (m1) -> Steve (u1)
    { meeting_id: 'm1', topic: 'BVP - JUAN ALBERTO RIVERA - L9 (ONLINE)', host_id: 'u1', start_time: '2023-01-01' },
    // Martinez (m2) -> Steve (u1)
    { meeting_id: 'm2', topic: 'BVP - ANA MARTINEZ GOMEZ - L7 (ONLINE)', host_id: 'u1', start_time: '2023-01-01' },
    // Sanchez (m3) -> Diana (u2)
    { meeting_id: 'm3', topic: 'BVP - DANIEL SANCHEZ TORRES - TRUE BEGINNER (ONLINE)', host_id: 'u2', start_time: '2023-01-01' },
    // Lopez (m4) -> Diana (u2)
    { meeting_id: 'm4', topic: 'VANESSA LOPEZ DE LOS RIOS - L5 (ONLINE)', host_id: 'u2', start_time: '2023-01-01' },
];

describe('MatchingService - Schedules (Integration)', () => {
    let matcher: MatchingService;

    beforeEach(() => {
        matcher = new MatchingService(mockMeetings, mockUsers);
    });

    it('should assign Schedule: Rivera Iriarte', () => {
        const schedule = {
            program: 'Rivera Iriarte (Per)(ONLINE), Juan Alberto',
            instructor: 'Steve Miller'
        } as any;
        const result = matcher.findMatch(schedule);

        expect(result.meeting_id).toBe('m1');
        expect(result.found_instructor?.id).toBe('u1');
        expect(result.status).toBe('assigned');
    });

    it('should assign Schedule: Martinez Gomez', () => {
        const schedule = {
            program: 'Martinez Gomez (Per)(ONLINE), Ana Gabriela',
            instructor: 'Steve Miller'
        } as any;
        const result = matcher.findMatch(schedule);

        expect(result.meeting_id).toBe('m2');
        expect(result.found_instructor?.id).toBe('u1');
        expect(result.status).toBe('assigned');
    });

    it('should assign Schedule: Sanchez Torres', () => {
        const schedule = {
            program: 'Sanchez Torres (PER)(ONLINE), Daniel Alcides',
            instructor: 'Diana Cooper'
        } as any;
        const result = matcher.findMatch(schedule);

        expect(result.meeting_id).toBe('m3');
        expect(result.found_instructor?.id).toBe('u2');
        expect(result.status).toBe('assigned');
    });

    it('should assign Schedule: López de los Rios', () => {
        const schedule = {
            program: 'López de los Rios (PER) (ONLINE), Vanessa Ofelia',
            instructor: 'Diana Cooper'
        } as any;
        const result = matcher.findMatch(schedule);

        expect(result.meeting_id).toBe('m4');
        expect(result.found_instructor?.id).toBe('u2');
        expect(result.status).toBe('assigned');
    });
});
