import { describe, expect, it } from "vitest";
import {
    sanitizeInstructorList,
    countWords,
    parseInstructorCell,
    findPoolIntersections,
    countPositivePoolInstructors,
    normalizeProgramKey,
} from "../../src/features/schedules/utils/pool-utils";

describe("pool-utils shared functions", () => {
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
    });

    describe("countWords", () => {
        it("counts basic words", () => {
            expect(countWords("hello world")).toBe(2);
        });

        it("handles extra whitespace", () => {
            expect(countWords("  one   two   three  ")).toBe(3);
        });

        it("returns 0 for empty/whitespace", () => {
            expect(countWords("")).toBe(0);
        });
    });

    describe("parseInstructorCell", () => {
        it("parses comma-separated string", () => {
            expect(parseInstructorCell("Alice, Bob, Charlie")).toEqual(["Alice", "Bob", "Charlie"]);
        });

        it("parses newline-separated string", () => {
            expect(parseInstructorCell("Alice\nBob\nCharlie")).toEqual(["Alice", "Bob", "Charlie"]);
        });

        it("returns empty string array for blank values", () => {
            expect(parseInstructorCell("")).toEqual([]);
            expect(parseInstructorCell(null)).toEqual([]);
            expect(parseInstructorCell(undefined)).toEqual([]);
        });
    });

    describe("normalizeProgramKey", () => {
        it("lowercases and trims whitespace", () => {
            expect(normalizeProgramKey(" PIA  ENGLISH 4  ")).toBe("pia  english 4");
        });

        it("returns empty string for empty input", () => {
            expect(normalizeProgramKey("")).toBe("");
        });
    });

    describe("countPositivePoolInstructors", () => {
        it("sums general pool and day-specific unique instructors", () => {
            const rule = {
                allowed_instructors: ["Alice", "Bob"],
                day_overrides: [
                    { day_of_week: 1, allowed_instructors: ["Charlie"] },
                    { day_of_week: 2, allowed_instructors: ["Alice", "Dave"] }, // Alice overlaps with general pool
                ],
                blocked_instructors: [],
            } as any;

            expect(countPositivePoolInstructors(rule)).toBe(4); // Alice, Bob, Charlie, Dave
        });

        it("returns 0 when pools are completely empty", () => {
            const rule = {
                allowed_instructors: [],
                day_overrides: [],
                blocked_instructors: [],
            } as any;

            expect(countPositivePoolInstructors(rule)).toBe(0);
        });
    });

    describe("findPoolIntersections", () => {
        it("returns names that are in both positive and negative pools", () => {
            const rule = {
                allowed_instructors: ["Alice", "Bob"],
                day_overrides: [
                    { day_of_week: 1, allowed_instructors: ["Charlie"] },
                ],
                blocked_instructors: ["Bob", "Dave", "Charlie"],
            } as any;

            const result = findPoolIntersections(rule);
            expect(result).toHaveLength(2); // Bob and Charlie overlap
            expect(result).toContain("Bob");
            expect(result).toContain("Charlie");
        });

        it("returns empty array if no overlap", () => {
            const rule = {
                allowed_instructors: ["Alice"],
                day_overrides: [],
                blocked_instructors: ["Bob", "Dave"],
            } as any;

            const result = findPoolIntersections(rule);
            expect(result).toHaveLength(0);
        });
    });
});
