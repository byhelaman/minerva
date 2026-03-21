import { describe, expect, it } from "vitest";
import type { PoolRule, PoolRuleInput } from "../../src/features/schedules/types";
import { buildPoolImportPreview, type PoolImportDraft } from "../../src/features/schedules/components/pools/pools-import-utils";
import { sanitizeInstructorList, countWords, parseInstructorCell } from "../../src/features/schedules/utils/pool-utils";

// ─── sanitizeInstructorList ─────────────────────────────────────

describe("sanitizeInstructorList", () => {
    it("trims whitespace and deduplicates case-insensitively", () => {
        expect(sanitizeInstructorList(["  Alice ", "alice", "Bob"])).toEqual(["Alice", "Bob"]);
    });

    it("filters empty strings", () => {
        expect(sanitizeInstructorList(["", " ", "Carlos"])).toEqual(["Carlos"]);
    });

    it("keeps first occurrence on case collision", () => {
        expect(sanitizeInstructorList(["María Gómez", "MARÍA GÓMEZ"])).toEqual(["María Gómez"]);
    });

    it("treats accent differences as distinct entries", () => {
        // 'María' vs 'maria' differ by accent, not just case
        expect(sanitizeInstructorList(["María Gómez", "maria gómez"])).toEqual(["María Gómez", "maria gómez"]);
    });

    it("returns empty for all-empty input", () => {
        expect(sanitizeInstructorList(["", "  "])).toEqual([]);
    });
});

// ─── countWords ─────────────────────────────────────────────────

describe("countWords", () => {
    it("counts basic words", () => {
        expect(countWords("hello world")).toBe(2);
    });

    it("handles extra whitespace", () => {
        expect(countWords("  one   two   three  ")).toBe(3);
    });

    it("returns 0 for empty/whitespace", () => {
        expect(countWords("")).toBe(0);
        expect(countWords("   ")).toBe(0);
    });
});

// ─── parseInstructorCell ────────────────────────────────────────

describe("parseInstructorCell", () => {
    it("parses comma-separated string", () => {
        expect(parseInstructorCell("Alice, Bob, Charlie")).toEqual(["Alice", "Bob", "Charlie"]);
    });

    it("parses newline-separated string", () => {
        expect(parseInstructorCell("Alice\nBob\nCharlie")).toEqual(["Alice", "Bob", "Charlie"]);
    });

    it("parses pipe-separated string", () => {
        expect(parseInstructorCell("Alice|Bob")).toEqual(["Alice", "Bob"]);
    });

    it("parses semicolon-separated string", () => {
        expect(parseInstructorCell("Alice; Bob")).toEqual(["Alice", "Bob"]);
    });

    it("parses array input", () => {
        expect(parseInstructorCell(["Alice", "Bob"])).toEqual(["Alice", "Bob"]);
    });

    it("returns empty for null/undefined/blank", () => {
        expect(parseInstructorCell(null)).toEqual([]);
        expect(parseInstructorCell(undefined)).toEqual([]);
        expect(parseInstructorCell("")).toEqual([]);
    });

    it("deduplicates case-insensitively", () => {
        expect(parseInstructorCell("Alice, alice, ALICE")).toEqual(["Alice"]);
    });
});

// ─── buildPoolImportPreview ─────────────────────────────────────

function makeDraft(overrides: Partial<PoolRuleInput> & { id?: string }): PoolImportDraft {
    const { id, ...payloadOverrides } = overrides;
    return {
        id: id ?? "draft-1",
        payload: {
            branch: "CORPORATE",
            program_name: "PIA ENGLISH 4",
            allowed_instructors: ["Nora Velez"],
            day_overrides: [],
            blocked_instructors: [],
            hard_lock: false,
            is_active: true,
            has_rotation_limit: false,
            comments: null,
            ...payloadOverrides,
        },
    };
}

function makeRule(overrides: Partial<PoolRule>): PoolRule {
    return {
        id: "rule-1",
        owner_id: "owner-1",
        branch: "CORPORATE",
        program_name: "PIA ENGLISH 4",
        day_overrides: [],
        allowed_instructors: ["Nora Velez"],
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

describe("buildPoolImportPreview", () => {
    it("marks new rules correctly", () => {
        const drafts = [makeDraft({})];
        const { rows, summary } = buildPoolImportPreview(drafts, []);

        expect(rows).toHaveLength(1);
        expect(rows[0].status).toBe("new");
        expect(summary.newCount).toBe(1);
    });

    it("marks invalid when program_name is empty", () => {
        const drafts = [makeDraft({ program_name: "" })];
        const { rows, summary } = buildPoolImportPreview(drafts, []);

        expect(rows[0].status).toBe("invalid");
        expect(rows[0].reason).toContain("Program");
        expect(summary.invalidCount).toBe(1);
    });

    it("marks invalid when branch is empty", () => {
        const drafts = [makeDraft({ branch: "" })];
        const { rows, summary } = buildPoolImportPreview(drafts, []);

        expect(rows[0].status).toBe("invalid");
        expect(rows[0].reason).toContain("Branch");
        expect(summary.invalidCount).toBe(1);
    });

    it("marks invalid when same branch + program appears twice in import", () => {
        const drafts = [
            makeDraft({ id: "d1", program_name: "SAME PROGRAM" }),
            makeDraft({ id: "d2", program_name: "SAME PROGRAM" }),
        ];
        const { rows, summary } = buildPoolImportPreview(drafts, []);

        expect(rows.every((r) => r.status === "invalid")).toBe(true);
        expect(rows.every((r) => r.reason?.includes("Duplicated branch + program") ?? false)).toBe(true);
        expect(summary.invalidCount).toBe(2);
    });

    it("marks identical when rule perfectly matches existing rule in database", () => {
        const drafts = [makeDraft({ program_name: "PIA ENGLISH 4" })];
        const existingRules = [makeRule({ program_name: "PIA ENGLISH 4" })];
        const { rows, summary } = buildPoolImportPreview(drafts, existingRules);

        expect(rows[0].status).toBe("identical");
        expect(rows[0].existingRuleId).toBe("rule-1");
        expect(summary.unresolvedCount).toBe(summary.invalidCount);
        expect(summary.updateCount).toBe(0);
    });

    it("marks new when rule matches identity but has different fields", () => {
        const drafts = [makeDraft({ program_name: "PIA ENGLISH 4", allowed_instructors: ["Different"] })];
        // Existing rule has ["Nora Velez"]
        const existingRules = [makeRule({ program_name: "PIA ENGLISH 4" })];
        const { rows } = buildPoolImportPreview(drafts, existingRules);

        expect(rows[0].status).toBe("update");
        expect(rows[0].existingRuleId).toBe("rule-1");
    });

    it("marks invalid when positive pool exceeds 5 instructors", () => {
        const drafts = [makeDraft({
            allowed_instructors: ["A", "B", "C", "D", "E", "F"],
        })];
        const { rows } = buildPoolImportPreview(drafts, []);

        expect(rows[0].status).toBe("invalid");
        expect(rows[0].reason).toContain("5 instructors");
    });

    it("marks invalid when instructor appears in both positive and negative pool", () => {
        const drafts = [makeDraft({
            allowed_instructors: ["Alice", "Bob"],
            blocked_instructors: ["Alice"],
        })];
        const { rows } = buildPoolImportPreview(drafts, []);

        expect(rows[0].status).toBe("invalid");
        expect(rows[0].reason).toContain("positive and negative");
    });

    it("calculates unresolvedCount from invalid rows", () => {
        const drafts = [
            makeDraft({ id: "d1", program_name: "" }),
            makeDraft({ id: "d2", program_name: "DUP" }),
            makeDraft({ id: "d3", program_name: "DUP" }),
            makeDraft({ id: "d4", program_name: "VALID NEW" }),
        ];
        const { summary } = buildPoolImportPreview(drafts, []);

        expect(summary.invalidCount).toBe(3);
        expect(summary.newCount).toBe(1);
        expect(summary.unresolvedCount).toBe(summary.invalidCount);
    });
});
