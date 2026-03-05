import type { PoolRule, Schedule } from "../types";
import { getScheduleKey } from "./overlap-utils";
import { normalizeString } from "@/features/matching/utils/normalizer";
import { evaluateMatch } from "@/features/matching/scoring/scorer";
import type { ZoomMeetingCandidate } from "@/features/matching/types";
import { MatchingService } from "@/features/matching/services/matcher";
import { getIsoWeekdayFromDateString, normalizeDayInstructorPools } from "./weekdays";

export interface PoolValidationResult {
    violatingRowKeys: Set<string>;
    reasonsByRowKey: Map<string, string>;
    violationCount: number;
}

export function programMatchesPoolRule(program: string, ruleProgramQuery: string): boolean {
    const normalizedProgram = normalizeString(program);
    const normalizedRule = normalizeString(ruleProgramQuery);

    if (!normalizedProgram || !normalizedRule) return false;
    if (normalizedProgram === normalizedRule) return true;
    if (normalizedProgram.includes(normalizedRule) || normalizedRule.includes(normalizedProgram)) {
        return true;
    }

    const ruleAsCandidate: ZoomMeetingCandidate = {
        meeting_id: "pool-rule",
        topic: ruleProgramQuery,
        host_id: "",
        start_time: "",
    };

    const evaluation = evaluateMatch(program, [ruleAsCandidate]);
    return evaluation.decision !== "not_found";
}

function createUserCandidateFromName(name: string, index: number) {
    const normalized = normalizeString(name);
    const tokens = normalized.split(" ").filter(Boolean);

    return {
        id: `pool-user-${index}`,
        email: `pool-user-${index}@pool.local`,
        first_name: tokens[0] ?? "",
        last_name: tokens.slice(1).join(" "),
        display_name: name,
    };
}

function isInstructorInPool(
    instructor: string,
    pool: string[],
    cache: Map<string, boolean>,
): boolean {
    if (pool.length === 0) return false;

    const normalizedInstructor = normalizeString(instructor);
    if (!normalizedInstructor) return false;

    const normalizedPool = pool
        .map((name) => normalizeString(name))
        .filter(Boolean);

    if (normalizedPool.includes(normalizedInstructor)) {
        return true;
    }

    const signature = [...new Set(normalizedPool)].sort().join("|");
    const cacheKey = `${normalizedInstructor}::${signature}`;
    const cached = cache.get(cacheKey);
    if (cached !== undefined) {
        return cached;
    }

    const users = pool
        .map((name) => name.trim())
        .filter(Boolean)
        .map((name, index) => createUserCandidateFromName(name, index));

    if (users.length === 0) {
        cache.set(cacheKey, false);
        return false;
    }

    const matcher = new MatchingService([], users);
    const fakeSchedule = {
        program: "POOL_INSTRUCTOR_MATCH",
        instructor,
    } as Schedule;

    const result = matcher.findMatch(fakeSchedule, { ignoreLevelMismatch: true });
    const isMatch = Boolean(result.found_instructor);
    cache.set(cacheKey, isMatch);

    return isMatch;
}

function mergeInstructorPools(primary: string[], fallback: string[]): string[] {
    const unique = new Map<string, string>();
    for (const name of [...primary, ...fallback]) {
        const trimmed = name.trim();
        if (!trimmed) continue;
        const key = normalizeString(trimmed);
        if (!key) continue;
        if (!unique.has(key)) {
            unique.set(key, trimmed);
        }
    }
    return Array.from(unique.values());
}

export function evaluatePoolIssues(schedules: Schedule[], rules: PoolRule[]): PoolValidationResult {
    const violatingRowKeys = new Set<string>();
    const reasonsByRowKey = new Map<string, string>();
    const instructorPoolMatchCache = new Map<string, boolean>();

    const activeRules = rules.filter((rule) => rule.is_active);
    if (activeRules.length === 0) {
        return { violatingRowKeys, reasonsByRowKey, violationCount: 0 };
    }

    for (const schedule of schedules) {
        const scheduleWeekday = getIsoWeekdayFromDateString(schedule.date);
        const matchingRules = activeRules.filter((rule) => programMatchesPoolRule(schedule.program, rule.program_query));
        if (matchingRules.length === 0) continue;

        const rowKey = getScheduleKey(schedule);
        const reasons: string[] = [];

        for (const rule of matchingRules) {
            const isBlocked = isInstructorInPool(schedule.instructor, rule.blocked_instructors, instructorPoolMatchCache);
            if (isBlocked) {
                reasons.push(`Pool negativo: ${schedule.instructor} está bloqueado para este programa`);
                continue;
            }

            const byDayPools = normalizeDayInstructorPools(rule.allowed_instructors_by_day);
            const daySpecificPool = scheduleWeekday ? (byDayPools[scheduleWeekday] ?? []) : [];
            const effectiveAllowedPool = daySpecificPool.length > 0
                ? (rule.hard_lock
                    ? daySpecificPool
                    : mergeInstructorPools(daySpecificPool, rule.allowed_instructors))
                : rule.allowed_instructors;

            const hasAllowedPool = effectiveAllowedPool.length > 0;
            const isAllowed = hasAllowedPool
                ? isInstructorInPool(schedule.instructor, effectiveAllowedPool, instructorPoolMatchCache)
                : true;

            if (rule.hard_lock && hasAllowedPool && !isAllowed) {
                if (daySpecificPool.length > 0) {
                    reasons.push("Regla estricta (día específico): instructor fuera del pool positivo del día");
                } else {
                    reasons.push("Regla estricta: no asignar a nadie más (instructor fuera del pool positivo)");
                }
            }
        }

        if (reasons.length > 0) {
            violatingRowKeys.add(rowKey);
            reasonsByRowKey.set(rowKey, reasons.join(" · "));
        }
    }

    return {
        violatingRowKeys,
        reasonsByRowKey,
        violationCount: violatingRowKeys.size,
    };
}
