import { read, utils } from "xlsx";
import { formatTimeTo24h, parseTimeValue } from "./time-utils";
import { ScheduleSchema } from "../schemas/schedule-schema";
import type { Schedule } from "../types";

// =============================================================================
// CONFIGURACIÓN DEL PARSER
// =============================================================================

export const PARSER_CONFIG = {
    METADATA_ROWS: {
        DATE_ROW_IDX: 1,      // Row 2
        DATE_COL_IDX: 14,     // Col O
        LOCATION_ROW_IDX: 1,  // Row 2
        LOCATION_COL_IDX: 21, // Col V
        INSTRUCTOR_CODE_ROW: 4, // Row 5
        INSTRUCTOR_NAME_ROW: 5, // Row 6
    },
    DATA: {
        START_ROW_IDX: 7, // Row 8
        COLS: {
            START_TIME: 0, // Col A
            END_TIME: 3,   // Col D
            GROUP: 17,     // Col R
            BLOCK: 19,     // Col T
            PROGRAM: 25    // Col Z
        }
    }
};

// =============================================================================
// UTILIDADES GENERALES
// =============================================================================

/** Convierte cualquier valor a string de forma segura (maneja null/undefined) */
function safeString(val: unknown): string {
    return String(val ?? "").trim();
}

/** Verifica si el texto contiene una palabra (case-insensitive, límite de palabra) */
function matchesWord(text: string, word: string): boolean {
    const regex = new RegExp(`\\b${word}\\b`, "i");
    return regex.test(text);
}

/** Busca la primera palabra coincidente de una lista en el texto */
function findMatchingWord(text: string, words: string[]): string | null {
    const content = safeString(text);
    for (const word of words) {
        if (matchesWord(content, word)) {
            return word;
        }
    }
    return null;
}

// =============================================================================
// HELPERS ESPECÍFICOS DEL DOMINIO
// =============================================================================

const BRANCH_KEYWORDS = ["CORPORATE", "HUB", "LA MOLINA", "BAW", "KIDS"] as const;

const DURATION_MAP: Record<string, string> = {
    "30": "30",
    "45": "45",
    "60": "30",
    "CEIBAL": "45",
    "KIDS": "45",
};

const SPECIAL_TAGS = new Set(
    ["@Corp", "@Corporate", "@Lima2", "@LimaCorporate", "@LCBulevarArtigas", "@Argentina"]
        .map(tag => tag.toLowerCase().replace(/\s/g, ''))
);

const ALLOWED_HEADERS = new Set([
    "date", "shift", "branch", "start_time", "end_time", "code", "instructor",
    "program", "minutes", "units", "status", "substitute", "type", "subtype",
    "description", "department", "feedback"
]);

function extractParenthesizedContent(text: string): string {
    if (!text) return "";
    const matches = safeString(text).match(/\((.*?)\)/g);
    return matches ? matches.map((m) => m.slice(1, -1)).join(", ") : safeString(text);
}

function extractBranchKeyword(text: string): string | null {
    return findMatchingWord(text, [...BRANCH_KEYWORDS]);
}

function filterSpecialTags(text: string): string | null {
    const content = safeString(text);
    const normalized = content.replace(/\s+/g, "").toLowerCase();
    // Verificar si contiene algún tag especial
    for (const tag of SPECIAL_TAGS) {
        if (normalized.includes(tag)) return null;
    }
    return content;
}

function extractDuration(programName: string): string | null {
    const content = safeString(programName);
    for (const [keyword, duration] of Object.entries(DURATION_MAP)) {
        if (matchesWord(content, keyword)) {
            return duration;
        }
    }
    return null;
}

function determineShift(startTime: string | number): string {
    const { hours } = parseTimeValue(startTime);
    return hours < 14 ? "P. ZUÑIGA" : "H. GARCIA";
}

function excelDateToString(serial: number): string {
    const utcDays = Math.floor(serial - 25569);
    const date = new Date(utcDays * 86400 * 1000);
    const day = String(date.getUTCDate()).padStart(2, "0");
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const year = date.getUTCFullYear();
    return `${year}-${month}-${day}`; // Formato ISO
}

// =============================================================================
// FUNCIÓN PRINCIPAL DE PARSEO
// =============================================================================

export interface ParseResult {
    schedules: Schedule[];
    skipped: number;
}

export async function parseExcelFile(file: File, options?: { strictValidation?: boolean }): Promise<ParseResult> {
    const buffer = await file.arrayBuffer();
    const workbook = read(buffer, { type: "array" });
    const schedules: Schedule[] = [];
    let skipped = 0;

    for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        const rawSheet = utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][];

        if (!rawSheet || rawSheet.length === 0) continue;

        // --- 1. Verificación de formato exportado ---
        // Los archivos exportados tienen headers: date, shift, branch, start_time, end_time, code, instructor, program, minutes, units, ...
        // Se verifica la presencia de campos clave de la interfaz Schedule en la fila de encabezados
        const firstRow = rawSheet[0] as unknown[];
        const headerCells = firstRow?.slice(0, 20).map(cell => safeString(cell).toLowerCase()) ?? [];

        const requiredHeaders = ['date', 'start_time', 'end_time', 'program', 'instructor'];
        const matchedHeaders = requiredHeaders.filter(h => headerCells.includes(h));
        const isExportedFormat = matchedHeaders.length >= 5; // Deben existir todos los headers requeridos
        
        // Strict Validation Logic
        if (options?.strictValidation) {
            // Must be exported format
            if (!isExportedFormat) {
                throw new Error("Invalid file format. Ensure headers are present.");
            }

            // Check for unauthorized columns
            const invalidHeaders = headerCells.filter(h => h && !ALLOWED_HEADERS.has(h));
            if (invalidHeaders.length > 0) {
                throw new Error(`Unauthorized columns found: ${invalidHeaders.join(", ")}`);
            }
        }

        if (isExportedFormat) {
            const exportData = utils.sheet_to_json(worksheet) as Record<string, unknown>[];
            const normalizedData = exportData.map(item => {
                let date = item.date;
                if (typeof date === 'number') {
                    date = excelDateToString(date);
                } else if (typeof date === 'string' && /^\d+$/.test(date.trim())) {
                    date = excelDateToString(parseInt(date.trim(), 10));
                }

                const rawObj = {
                    ...item,
                    date: safeString(date),
                    start_time: formatTimeTo24h(item.start_time as string | number),
                    end_time: formatTimeTo24h(item.end_time as string | number),
                    // Asegurar que existan los campos requeridos
                    program: safeString(item.program),
                    instructor: safeString(item.instructor),
                    code: safeString(item.code),
                    minutes: safeString(item.minutes) || '0',
                    units: safeString(item.units) || '0',
                    shift: safeString(item.shift) || determineShift(safeString(item.start_time)),
                    branch: safeString(item.branch),
                    // Incidence fields
                    status: safeString(item.status),
                    substitute: safeString(item.substitute),
                    type: safeString(item.type),
                    subtype: safeString(item.subtype),
                    description: safeString(item.description),
                    department: safeString(item.department),
                    feedback: safeString(item.feedback)
                };

                // Validar con Zod incluso para exportados, por seguridad
                const result = ScheduleSchema.safeParse(rawObj);
                if (!result.success) skipped++;
                return result.success ? result.data : null;
            }).filter(Boolean) as Schedule[];

            schedules.push(...normalizedData);
            continue;
        }

        // --- 2. Validación heurística del formato estándar ---
        // Verificar si la fila de inicio de datos realmente contiene datos
        // Fila 8 (Índice 7), Col 0 (Hora) -> Debería ser número o string de hora
        const startRow = rawSheet[PARSER_CONFIG.DATA.START_ROW_IDX];
        if (!startRow) {
            console.warn(`Sheet ${sheetName} is too short`);
            continue;
        }

        // --- 3. Extraer metadatos ---
        const row0 = rawSheet[PARSER_CONFIG.METADATA_ROWS.DATE_ROW_IDX] as unknown[];
        const row3 = rawSheet[PARSER_CONFIG.METADATA_ROWS.INSTRUCTOR_CODE_ROW] as unknown[];
        const row4 = rawSheet[PARSER_CONFIG.METADATA_ROWS.INSTRUCTOR_NAME_ROW] as unknown[];

        if (!row0 || !row3 || !row4) continue;

        let scheduleDate = safeString(row0[PARSER_CONFIG.METADATA_ROWS.DATE_COL_IDX]);
        if (/^\d+$/.test(scheduleDate)) scheduleDate = excelDateToString(parseInt(scheduleDate));

        const instructorCode = safeString(row3[0]);
        const instructorName = safeString(row4[0]);
        const locationVal = safeString(row0[PARSER_CONFIG.METADATA_ROWS.LOCATION_COL_IDX]);
        const branchName = extractBranchKeyword(locationVal) ?? "";

        // --- 4. Pre-calcular conteo de grupos ---
        const groupCounts: Record<string, number> = {};
        for (let i = PARSER_CONFIG.DATA.START_ROW_IDX; i < rawSheet.length; i++) {
            const row = rawSheet[i];
            if (!row) continue;
            const group = safeString(row[PARSER_CONFIG.DATA.COLS.GROUP]);
            if (group) groupCounts[group] = (groupCounts[group] || 0) + 1;
        }

        // --- 5. Iteración de datos con validación Zod ---
        for (let i = PARSER_CONFIG.DATA.START_ROW_IDX; i < rawSheet.length; i++) {
            const row = rawSheet[i];
            if (!row) continue;

            const startTimeRaw = row[PARSER_CONFIG.DATA.COLS.START_TIME];
            const endTimeRaw = row[PARSER_CONFIG.DATA.COLS.END_TIME];
            let groupName = safeString(row[PARSER_CONFIG.DATA.COLS.GROUP]);
            const rawBlock = safeString(row[PARSER_CONFIG.DATA.COLS.BLOCK]);
            const programName = safeString(row[PARSER_CONFIG.DATA.COLS.PROGRAM]);

            if (!startTimeRaw || !endTimeRaw) continue;

            // Lógica de fallback
            if (!groupName) {
                const blockFiltered = filterSpecialTags(rawBlock);
                if (blockFiltered) groupName = blockFiltered;
                else continue;
            }

            const startTimeStr = extractParenthesizedContent(safeString(startTimeRaw));
            const endTimeStr = extractParenthesizedContent(safeString(endTimeRaw));

            // Lógica de sucursal
            const programKeyword = extractBranchKeyword(programName);
            const branch = programKeyword === "KIDS" && branchName
                ? `${branchName}/${programKeyword}`
                : branchName;

            // Construcción del objeto crudo
            const rawObj = {
                date: scheduleDate,
                shift: determineShift(startTimeStr), // Inyectado
                branch: branch,     // Inyectado
                start_time: formatTimeTo24h(startTimeStr),
                end_time: formatTimeTo24h(endTimeStr),
                code: instructorCode,
                instructor: instructorName,
                program: groupName,
                minutes: extractDuration(programName) ?? "0",
                units: String(groupCounts[groupName] ?? 0)
            };

            // VALIDACIÓN ZOD
            const result = ScheduleSchema.safeParse(rawObj);

            if (result.success) {
                schedules.push(result.data as Schedule);
            } else {
                skipped++;
            }
        }
    }

    return { schedules, skipped };
}
