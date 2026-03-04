import { describe, expect, it } from "vitest";
import type { PoolRule, Schedule } from "../../src/features/schedules/types";
import { evaluatePoolIssues, programMatchesPoolRule } from "../../src/features/schedules/utils/pool-validation";

function makeSchedule(overrides: Partial<Schedule>): Schedule {
    return {
        date: "2026-03-03",
        shift: "morning",
        branch: "online",
        start_time: "08:00",
        end_time: "10:00",
        code: "C-001",
        instructor: "Nora Velez",
        program: "PIA ENGLISH 4 2018",
        minutes: "120",
        units: "2",
        ...overrides,
    };
}

function makeRule(overrides: Partial<PoolRule>): PoolRule {
    return {
        id: "rule-1",
        owner_id: "owner-1",
        program_query: "PIA ENGLISH 4",
        allowed_instructors: ["Nora Velez", "Iker Salas"],
        blocked_instructors: [],
        hard_lock: false,
        is_active: true,
        notes: null,
        created_at: "2026-03-03T00:00:00.000Z",
        updated_at: "2026-03-03T00:00:00.000Z",
        ...overrides,
    };
}

describe("programMatchesPoolRule", () => {
    it("matches by normalized containment", () => {
        expect(programMatchesPoolRule("PIA ENGLISH 4 2018", "PIA ENGLISH 4")).toBe(true);
    });

    it("matches with token overlap", () => {
        expect(programMatchesPoolRule("KAPPA NOVA L4 ONLINE", "KAPPA NOVA ONLINE")).toBe(true);
    });

    it("returns false for unrelated programs", () => {
        expect(programMatchesPoolRule("PCA FRENCH 1", "PIA ENGLISH 4")).toBe(false);
    });

    it("matches reordered person-style program names with minor typo", () => {
        expect(
            programMatchesPoolRule(
                "Rivas Solano (ACME)(ONLINE), Tadeo Enrrique",
                "TADEO ENRIQUE RIVAS SOLANO (ACME)(ONLINE)",
            ),
        ).toBe(true);
    });
});

describe("evaluatePoolIssues", () => {
    it("flags instructor outside positive pool", () => {
        const schedule = makeSchedule({ instructor: "Bruno Paredes" });
        const rules = [makeRule({ allowed_instructors: ["Nora Velez"] })];

        const result = evaluatePoolIssues([schedule], rules);
        expect(result.violationCount).toBe(1);
    });

    it("flags instructor in negative pool", () => {
        const schedule = makeSchedule({ instructor: "Bruno Paredes" });
        const rules = [makeRule({ blocked_instructors: ["Bruno Paredes"] })];

        const result = evaluatePoolIssues([schedule], rules);
        expect(result.violationCount).toBe(1);
        const reason = [...result.reasonsByRowKey.values()][0];
        expect(reason).toContain("Pool negativo");
    });

    it("does not flag when rule does not match program", () => {
        const schedule = makeSchedule({ program: "PCA FRENCH 2" });
        const rules = [makeRule({ program_query: "PIA ENGLISH 4" })];

        const result = evaluatePoolIssues([schedule], rules);
        expect(result.violationCount).toBe(0);
    });

    it("ignores inactive rules", () => {
        const schedule = makeSchedule({ instructor: "Bruno Paredes" });
        const rules = [makeRule({ is_active: false, blocked_instructors: ["Bruno Paredes"] })];

        const result = evaluatePoolIssues([schedule], rules);
        expect(result.violationCount).toBe(0);
    });

    it("adds strict lock message when hard_lock is active", () => {
        const schedule = makeSchedule({ instructor: "Bruno Paredes" });
        const rules = [makeRule({ hard_lock: true, allowed_instructors: ["Nora Velez"] })];

        const result = evaluatePoolIssues([schedule], rules);
        const reason = [...result.reasonsByRowKey.values()][0];
        expect(reason).toContain("Regla estricta");
    });

    it("matches instructor names in positive pool with randomized names", () => {
        const schedule = makeSchedule({ instructor: "Zaira Montiel" });
        const rules = [
            makeRule({
                allowed_instructors: ["Zaira Montiel"],
                blocked_instructors: [],
            }),
        ];

        const result = evaluatePoolIssues([schedule], rules);
        expect(result.violationCount).toBe(0);
    });

    it("matches instructor names in negative pool with randomized names", () => {
        const schedule = makeSchedule({ instructor: "Dario Quintana" });
        const rules = [
            makeRule({
                allowed_instructors: [],
                blocked_instructors: ["Dario Quintana"],
            }),
        ];

        const result = evaluatePoolIssues([schedule], rules);
        expect(result.violationCount).toBe(1);
        const reason = [...result.reasonsByRowKey.values()][0];
        expect(reason).toContain("Pool negativo");
    });
});
