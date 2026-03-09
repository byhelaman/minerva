import { describe, expect, it } from "vitest";
import {
    getIsoWeekdayFromDateString,
    normalizeDayInstructorPools,
    formatDayInstructorPools,
    parseDayInstructorPoolsCell,
} from "../../src/features/schedules/utils/weekdays";

describe("getIsoWeekdayFromDateString", () => {
    it("returns correct ISO weekday (Mon=1, Sun=7)", () => {
        // 2026-03-02 is a Monday
        expect(getIsoWeekdayFromDateString("2026-03-02")).toBe(1);
        // 2026-03-04 is a Wednesday
        expect(getIsoWeekdayFromDateString("2026-03-04")).toBe(3);
        // 2026-03-08 is a Sunday
        expect(getIsoWeekdayFromDateString("2026-03-08")).toBe(7);
    });

    it("returns null for invalid date format", () => {
        expect(getIsoWeekdayFromDateString("03-02-2026")).toBeNull();
        expect(getIsoWeekdayFromDateString("not-a-date")).toBeNull();
        expect(getIsoWeekdayFromDateString("")).toBeNull();
    });

    it("handles month overflow (JS Date wraps silently)", () => {
        // 2026-13-01 wraps to 2027-01-01 in JS, which is a Thursday (4)
        expect(getIsoWeekdayFromDateString("2026-13-01")).toBe(5);
    });
});

describe("normalizeDayInstructorPools", () => {
    it("normalizes valid day-keyed pools", () => {
        const result = normalizeDayInstructorPools({
            "1": ["Alice", "Bob"],
            "3": ["Charlie"],
        });
        expect(result).toEqual({
            1: ["Alice", "Bob"],
            3: ["Charlie"],
        });
    });

    it("filters out invalid day keys", () => {
        const result = normalizeDayInstructorPools({
            "0": ["X"],
            "8": ["Y"],
            "5": ["Valid"],
        });
        expect(result).toEqual({ 5: ["Valid"] });
    });

    it("omits days with empty instructor lists", () => {
        const result = normalizeDayInstructorPools({
            "1": [],
            "2": ["Alice"],
        });
        expect(result).toEqual({ 2: ["Alice"] });
    });

    it("returns empty for null/non-object", () => {
        expect(normalizeDayInstructorPools(null)).toEqual({});
        expect(normalizeDayInstructorPools("string")).toEqual({});
        expect(normalizeDayInstructorPools(42)).toEqual({});
    });
});

describe("formatDayInstructorPools", () => {
    it("formats day pools with labels", () => {
        const result = formatDayInstructorPools({
            1: ["Alice", "Bob"],
            3: ["Charlie"],
        });
        expect(result).toBe("Mon: Alice, Bob | Wed: Charlie");
    });

    it("returns dash for empty pools", () => {
        expect(formatDayInstructorPools({})).toBe("—");
        expect(formatDayInstructorPools(null)).toBe("—");
    });
});

describe("parseDayInstructorPoolsCell", () => {
    it("parses object input", () => {
        const result = parseDayInstructorPoolsCell({
            "1": ["Alice"],
            "5": ["Bob"],
        });
        expect(result).toEqual({ 1: ["Alice"], 5: ["Bob"] });
    });

    it("parses JSON string", () => {
        const result = parseDayInstructorPoolsCell('{"2": ["Jane", "John"]}');
        expect(result).toEqual({ 2: ["Jane", "John"] });
    });

    it("parses pipe-separated text format", () => {
        const result = parseDayInstructorPoolsCell("Mon: Alice, Bob | Fri: Charlie");
        expect(result).toEqual({ 1: ["Alice", "Bob"], 5: ["Charlie"] });
    });

    it("returns empty for blank string", () => {
        expect(parseDayInstructorPoolsCell("")).toEqual({});
    });

    it("handles semicolon-separated instructor lists", () => {
        const result = parseDayInstructorPoolsCell("Wed: Alice; Bob");
        expect(result).toEqual({ 3: ["Alice", "Bob"] });
    });
});
