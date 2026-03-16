import { describe, expect, it } from "vitest";
import type { PoolRule, Schedule } from "../../src/features/schedules/types";
import { evaluatePoolIssues, evaluatePoolRotationIssues, programMatchesPoolRule } from "../../src/features/schedules/utils/pool-validation";

function makeSchedule(overrides: Partial<Schedule>): Schedule {
    return {
        date: "2026-03-03",
        shift: "morning",
        branch: "HUB",
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
        branch: "HUB",
        program_query: "PIA ENGLISH 4",
        allowed_instructors_by_day: {},
        allowed_instructors: ["Nora Velez", "Iker Salas"],
        blocked_instructors: [],
        hard_lock: false,
        is_active: true,
        has_rotation_limit: false,
        comments: null,
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
    it("does not flag instructor outside positive pool when rule is not strict", () => {
        const schedule = makeSchedule({ instructor: "Bruno Paredes" });
        const rules = [makeRule({ allowed_instructors: ["Nora Velez"] })];

        const result = evaluatePoolIssues([schedule], rules);
        expect(result.violationCount).toBe(0);
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
        expect(reason).toContain("Regla estricta: no asignar a nadie más");
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

    it("uses day-specific positive pool and still accepts general pool on that day when not strict", () => {
        const mondaySchedule = makeSchedule({ date: "2026-03-02", instructor: "Pepito Perez" });
        const wednesdayPepito = makeSchedule({ date: "2026-03-04", instructor: "Pepito Perez" });
        const wednesdayJuan = makeSchedule({ date: "2026-03-04", instructor: "Juan Gomez" });
        const rules = [
            makeRule({
                allowed_instructors: ["Pepito Perez"],
                allowed_instructors_by_day: {
                    3: ["Juan Gomez"],
                },
            }),
        ];

        const mondayResult = evaluatePoolIssues([mondaySchedule], rules);
        expect(mondayResult.violationCount).toBe(0);

        const wednesdayPepitoResult = evaluatePoolIssues([wednesdayPepito], rules);
        expect(wednesdayPepitoResult.violationCount).toBe(0);

        const wednesdayJuanResult = evaluatePoolIssues([wednesdayJuan], rules);
        expect(wednesdayJuanResult.violationCount).toBe(0);
    });

    it("enforces day-specific positive pool when strict lock is enabled", () => {
        const wednesdayPepito = makeSchedule({ date: "2026-03-04", instructor: "Pepito Perez" });
        const rules = [
            makeRule({
                hard_lock: true,
                allowed_instructors: ["Pepito Perez"],
                allowed_instructors_by_day: {
                    3: ["Juan Gomez"],
                },
            }),
        ];

        const result = evaluatePoolIssues([wednesdayPepito], rules);
        expect(result.violationCount).toBe(1);
        const reason = [...result.reasonsByRowKey.values()][0];
        expect(reason).toContain("Regla estricta (día específico)");
    });

    it("allows any instructor on days without day-specific pool while strict, but restricts configured day", () => {
        const mondayJuansito = makeSchedule({ date: "2026-03-02", instructor: "Juansito" });
        const mondayPepito = makeSchedule({ date: "2026-03-02", instructor: "Pepito Perez" });
        const wednesdayPepito = makeSchedule({ date: "2026-03-04", instructor: "Pepito Perez" });

        const rules = [
            makeRule({
                hard_lock: true,
                allowed_instructors: [],
                allowed_instructors_by_day: {
                    1: ["Juansito"],
                },
            }),
        ];

        expect(evaluatePoolIssues([mondayJuansito], rules).violationCount).toBe(0);
        expect(evaluatePoolIssues([mondayPepito], rules).violationCount).toBe(1);
        expect(evaluatePoolIssues([wednesdayPepito], rules).violationCount).toBe(0);
    });
});

describe("evaluatePoolRotationIssues", () => {
    it("does not flag if consecutive classes are within the rotation limit", () => {
        const historical = [
            makeSchedule({ date: "2026-03-01", instructor: "Nora Velez" }),
            makeSchedule({ date: "2026-03-02", instructor: "Nora Velez" }),
        ];
        const current = [
            makeSchedule({ date: "2026-03-03", instructor: "Nora Velez" }),
        ];
        const rules = [makeRule({ has_rotation_limit: true })];

        const result = evaluatePoolRotationIssues(current, rules, { historicalSchedules: historical });
        expect(result.violationCount).toBe(0);
    });

    it("flags when consecutive classes exceed the rotation limit on the current data", () => {
        const historical = [
            makeSchedule({ date: "2026-03-01", instructor: "Nora Velez" }),
            makeSchedule({ date: "2026-03-02", instructor: "Nora Velez" }),
            makeSchedule({ date: "2026-03-03", instructor: "Nora Velez" }),
        ];
        const current = [
            makeSchedule({ date: "2026-03-04", instructor: "Nora Velez" }), // 4th consecutive
        ];
        const rules = [makeRule({ has_rotation_limit: true })];

        const result = evaluatePoolRotationIssues(current, rules, { historicalSchedules: historical });
        expect(result.violationCount).toBe(1);
        const reason = [...result.reasonsByRowKey.values()][0];
        expect(reason).toContain("excedió el límite de 3 clases consecutivas");
    });

    it("ignores limit violations that only occurred in the historical data, but flags new ones", () => {
        const historical = [
            makeSchedule({ date: "2026-03-01", instructor: "Nora Velez" }),
            makeSchedule({ date: "2026-03-02", instructor: "Nora Velez" }),
            makeSchedule({ date: "2026-03-03", instructor: "Nora Velez" }),
            // Historical already exceeded limit, but we don't flag historicals
            makeSchedule({ date: "2026-03-04", instructor: "Iker Salas" }), // Reset!
            makeSchedule({ date: "2026-03-05", instructor: "Iker Salas" }),
        ];
        const current = [
            makeSchedule({ date: "2026-03-06", instructor: "Iker Salas" }), 
        ];
        const rules = [makeRule({ has_rotation_limit: true })];

        const result = evaluatePoolRotationIssues(current, rules, { historicalSchedules: historical });
        expect(result.violationCount).toBe(0); // Iker played 3 times -> fine.
    });

    it("resets consecutive count when a different instructor teaches", () => {
        const historical = [
            makeSchedule({ date: "2026-03-01", instructor: "Nora Velez" }),
            makeSchedule({ date: "2026-03-02", instructor: "Nora Velez" }),
            makeSchedule({ date: "2026-03-03", instructor: "Iker Salas" }), // Diff instructor
            makeSchedule({ date: "2026-03-04", instructor: "Nora Velez" }), // Reset counting for Nora
            makeSchedule({ date: "2026-03-05", instructor: "Nora Velez" }),
        ];
        const current = [
            makeSchedule({ date: "2026-03-06", instructor: "Nora Velez" }), 
        ];
        const rules = [makeRule({ has_rotation_limit: true })];

        const result = evaluatePoolRotationIssues(current, rules, { historicalSchedules: historical });
        expect(result.violationCount).toBe(0);
    });

    it("sorts by start time if dates are the same", () => {
        const historical: Schedule[] = [];
        const current = [
            makeSchedule({ date: "2026-03-01", start_time: "10:00", instructor: "Nora Velez" }), 
            makeSchedule({ date: "2026-03-01", start_time: "08:00", instructor: "Nora Velez" }), 
            makeSchedule({ date: "2026-03-02", start_time: "08:00", instructor: "Nora Velez" }), 
            makeSchedule({ date: "2026-03-02", start_time: "10:00", instructor: "Nora Velez" }), // the 4th consecutive class
        ];
        const rules = [makeRule({ has_rotation_limit: true })];

        const result = evaluatePoolRotationIssues(current, rules, { historicalSchedules: historical });
        expect(result.violationCount).toBe(1);
    });

    it("does not flag schedules from a different branch than the rule", () => {
        const historical = [
            makeSchedule({ date: "2026-03-01", branch: "CORPORATE", instructor: "Nora Velez" }),
            makeSchedule({ date: "2026-03-02", branch: "CORPORATE", instructor: "Nora Velez" }),
            makeSchedule({ date: "2026-03-03", branch: "CORPORATE", instructor: "Nora Velez" }),
        ];
        const current = [
            makeSchedule({ date: "2026-03-04", branch: "CORPORATE", instructor: "Nora Velez" }), // 4th consecutive but different branch
        ];
        // Rule is for HUB, not CORPORATE
        const rules = [makeRule({ has_rotation_limit: true, branch: "HUB" })];

        const result = evaluatePoolRotationIssues(current, rules, { historicalSchedules: historical });
        expect(result.violationCount).toBe(0);
    });
});
