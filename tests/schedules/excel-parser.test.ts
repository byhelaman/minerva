import { describe, it, expect } from 'vitest';
import { utils, write } from 'xlsx';
import { parseExcelFile } from '../../src/features/schedules/utils/excel-parser';

// =============================================================================
// Helper: Create a synthetic Excel file (exported format with headers)
// =============================================================================

function createExportedExcel(rows: Record<string, unknown>[]): File {
    const ws = utils.json_to_sheet(rows);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Sheet1');
    const buf = write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    return new File([buf], 'test.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// Minimal valid row for exported format
function validRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        date: '2024-06-15',
        shift: 'P. ZUÑIGA',
        branch: 'HUB',
        start_time: '08:00',
        end_time: '10:00',
        code: 'C01',
        instructor: 'Teacher A',
        program: 'English 101',
        minutes: '60',
        units: '2',
        ...overrides,
    };
}

// =============================================================================
// Exported Format: Basic parsing
// =============================================================================

describe('parseExcelFile - exported format: basic parsing', () => {
    it('should parse a valid exported Excel file', async () => {
        const file = createExportedExcel([validRow()]);
        const result = await parseExcelFile(file);

        expect(result.schedules).toHaveLength(1);
        expect(result.skipped).toBe(0);
        expect(result.schedules[0].date).toBe('2024-06-15');
        expect(result.schedules[0].program).toBe('English 101');
    });

    it('should parse multiple rows', async () => {
        const file = createExportedExcel([
            validRow({ start_time: '08:00', program: 'Math' }),
            validRow({ start_time: '10:00', program: 'Science' }),
            validRow({ start_time: '12:00', program: 'English' }),
        ]);
        const result = await parseExcelFile(file);
        expect(result.schedules).toHaveLength(3);
        expect(result.skipped).toBe(0);
    });
});

// =============================================================================
// Exported Format: Null/empty/undefined handling
// =============================================================================

describe('parseExcelFile - exported format: null/empty handling', () => {
    it('should normalize empty instructor to "none"', async () => {
        const file = createExportedExcel([validRow({ instructor: '' })]);
        const result = await parseExcelFile(file);

        expect(result.schedules).toHaveLength(1);
        expect(result.schedules[0].instructor).toBe('none');
    });

    it('should normalize whitespace-only instructor to "none"', async () => {
        const file = createExportedExcel([validRow({ instructor: '   ' })]);
        const result = await parseExcelFile(file);

        expect(result.schedules).toHaveLength(1);
        expect(result.schedules[0].instructor).toBe('none');
    });

    it('should normalize empty branch to "none"', async () => {
        const file = createExportedExcel([validRow({ branch: '' })]);
        const result = await parseExcelFile(file);

        expect(result.schedules).toHaveLength(1);
        expect(result.schedules[0].branch).toBe('none');
    });

    it('should collapse multiple internal spaces in instructor', async () => {
        const file = createExportedExcel([validRow({ instructor: 'Juan     Perez' })]);
        const result = await parseExcelFile(file);

        expect(result.schedules[0].instructor).toBe('Juan Perez');
    });

    it('should collapse multiple internal spaces in program', async () => {
        const file = createExportedExcel([validRow({ program: 'English    101' })]);
        const result = await parseExcelFile(file);

        expect(result.schedules[0].program).toBe('English 101');
    });

    it('should default missing minutes to "0"', async () => {
        const row = validRow();
        delete row.minutes;
        const file = createExportedExcel([row]);
        const result = await parseExcelFile(file);

        expect(result.schedules[0].minutes).toBe('0');
    });

    it('should default missing units to "0"', async () => {
        const row = validRow();
        delete row.units;
        const file = createExportedExcel([row]);
        const result = await parseExcelFile(file);

        expect(result.schedules[0].units).toBe('0');
    });

    it('should pass through incidence fields as optional strings', async () => {
        const file = createExportedExcel([validRow({
            status: 'suspended',
            type: 'absence',
            substitute: 'Jane',
            description: 'Doctor appointment',
        })]);
        const result = await parseExcelFile(file);

        expect(result.schedules[0].status).toBe('suspended');
        expect(result.schedules[0].type).toBe('absence');
        expect(result.schedules[0].substitute).toBe('Jane');
        expect(result.schedules[0].description).toBe('Doctor appointment');
    });

    it('should handle empty incidence fields as empty strings (not null)', async () => {
        const file = createExportedExcel([validRow({
            status: '',
            type: '',
        })]);
        const result = await parseExcelFile(file);

        // Zod schema allows optional string — empty string passes through safeString
        expect(result.schedules).toHaveLength(1);
    });
});

// =============================================================================
// Exported Format: Validation (Zod rejection)
// =============================================================================

describe('parseExcelFile - exported format: Zod validation', () => {
    it('should skip rows with invalid date', async () => {
        const file = createExportedExcel([validRow({ date: '15/06/2024' })]);
        const result = await parseExcelFile(file);

        expect(result.schedules).toHaveLength(0);
        expect(result.skipped).toBe(1);
    });

    it('should skip rows with empty program', async () => {
        const file = createExportedExcel([validRow({ program: '' })]);
        const result = await parseExcelFile(file);

        expect(result.schedules).toHaveLength(0);
        expect(result.skipped).toBe(1);
    });

    it('should skip rows with non-numeric minutes', async () => {
        const file = createExportedExcel([validRow({ minutes: 'abc' })]);
        const result = await parseExcelFile(file);

        expect(result.schedules).toHaveLength(0);
        expect(result.skipped).toBe(1);
    });

    it('should count valid + skipped = total', async () => {
        const file = createExportedExcel([
            validRow(),                            // valid
            validRow({ date: 'invalid-date' }),    // invalid
            validRow({ start_time: '10:00' }),     // valid
        ]);
        const result = await parseExcelFile(file);

        expect(result.schedules.length + result.skipped).toBe(3);
        expect(result.schedules).toHaveLength(2);
        expect(result.skipped).toBe(1);
    });
});

// =============================================================================
// Exported Format: Date normalization
// =============================================================================

describe('parseExcelFile - exported format: date normalization', () => {
    it('should convert Excel serial date to YYYY-MM-DD', async () => {
        // 45458 = 2024-06-15 in Excel serial format
        const file = createExportedExcel([validRow({ date: 45458 })]);
        const result = await parseExcelFile(file);

        expect(result.schedules).toHaveLength(1);
        expect(result.schedules[0].date).toBe('2024-06-15');
    });

    it('should convert string serial date to YYYY-MM-DD', async () => {
        const file = createExportedExcel([validRow({ date: '45458' })]);
        const result = await parseExcelFile(file);

        expect(result.schedules).toHaveLength(1);
        expect(result.schedules[0].date).toBe('2024-06-15');
    });

    it('should preserve already-formatted ISO dates', async () => {
        const file = createExportedExcel([validRow({ date: '2024-06-15' })]);
        const result = await parseExcelFile(file);

        expect(result.schedules[0].date).toBe('2024-06-15');
    });
});

// =============================================================================
// Exported Format: Time normalization
// =============================================================================

describe('parseExcelFile - exported format: time normalization', () => {
    it('should convert Excel serial time (0.333 = 08:00) to HH:MM', async () => {
        // 0.333333... ≈ 8:00 AM
        const file = createExportedExcel([validRow({
            start_time: 1/3,
            end_time: 5/12,   // 10:00
        })]);
        const result = await parseExcelFile(file);

        expect(result.schedules).toHaveLength(1);
        expect(result.schedules[0].start_time).toBe('08:00');
        expect(result.schedules[0].end_time).toBe('10:00');
    });

    it('should preserve already-formatted HH:MM times', async () => {
        const file = createExportedExcel([validRow({
            start_time: '08:00',
            end_time: '10:00',
        })]);
        const result = await parseExcelFile(file);

        expect(result.schedules[0].start_time).toBe('08:00');
        expect(result.schedules[0].end_time).toBe('10:00');
    });
});

// =============================================================================
// Strict Validation mode
// =============================================================================

describe('parseExcelFile - strict validation', () => {
    it('should reject non-exported format in strict mode', async () => {
        // Create a sheet without proper headers
        const ws = utils.aoa_to_sheet([
            ['Some', 'Random', 'Headers'],
            ['data', '1', '2'],
        ]);
        const wb = utils.book_new();
        utils.book_append_sheet(wb, ws, 'Sheet1');
        const buf = write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
        const file = new File([buf], 'test.xlsx');

        await expect(parseExcelFile(file, { strictValidation: true }))
            .rejects.toThrow('Invalid file format');
    });

    it('should reject unauthorized columns in strict mode', async () => {
        const file = createExportedExcel([{
            ...validRow(),
            malicious_column: 'hacked',
        }]);

        await expect(parseExcelFile(file, { strictValidation: true }))
            .rejects.toThrow('Unauthorized columns');
    });

    it('should accept valid exported format in strict mode', async () => {
        const file = createExportedExcel([validRow()]);
        const result = await parseExcelFile(file, { strictValidation: true });
        expect(result.schedules).toHaveLength(1);
    });
});

// =============================================================================
// Empty / edge cases
// =============================================================================

describe('parseExcelFile - edge cases', () => {
    it('should handle empty workbook', async () => {
        const wb = utils.book_new();
        utils.book_append_sheet(wb, utils.aoa_to_sheet([]), 'Sheet1');
        const buf = write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
        const file = new File([buf], 'empty.xlsx');

        const result = await parseExcelFile(file);
        expect(result.schedules).toHaveLength(0);
        expect(result.skipped).toBe(0);
    });

    it('should handle sheet with only headers (no data rows)', async () => {
        const ws = utils.aoa_to_sheet([
            ['date', 'start_time', 'end_time', 'instructor', 'program'],
        ]);
        const wb = utils.book_new();
        utils.book_append_sheet(wb, ws, 'Sheet1');
        const buf = write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
        const file = new File([buf], 'headers-only.xlsx');

        const result = await parseExcelFile(file);
        expect(result.schedules).toHaveLength(0);
    });
});
