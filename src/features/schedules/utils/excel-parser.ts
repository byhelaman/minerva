import { read, utils } from "xlsx";
import { formatTimeTo24h, parseTimeValue } from "./time-utils";

// =============================================================================
// TIPOS DE DATOS
// =============================================================================

export interface Schedule {
    date: string;
    shift: string;
    branch: string;
    start_time: string;
    end_time: string;
    code: string;
    instructor: string;
    program: string;
    minutes: string;
    units: number;
}



// =============================================================================
// UTILIDADES GENERALES (Patrones comunes abstraídos)
// =============================================================================

/** Convierte cualquier valor a string de forma segura (maneja null/undefined) */
function safeString(val: unknown): string {
    return String(val ?? "");
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

// Mapeo de duraciones: la clave "60" se mapea a "30" por lógica heredada de Python
const DURATION_MAP: Record<string, string> = {
    "30": "30",
    "45": "45",
    "60": "30",
    "CEIBAL": "45",
    "KIDS": "45",
};

// Tags especiales que deben ser filtrados (pre-calculado como Set para eficiencia)
const SPECIAL_TAGS = new Set(
    [
        "@Corp",
        "@Lima 2 | lima2 | @Lima Corporate",
        "@LC Bulevar Artigas",
        "@Argentina",
    ]
        .flatMap((group) => group.split("|"))
        .map((tag) => tag.replace(/\s+/g, "").toLowerCase())
);

/** Extrae contenido entre paréntesis de un texto */
function extractParenthesizedContent(text: string): string {
    if (!text) return "";
    const matches = safeString(text).match(/\((.*?)\)/g);
    return matches ? matches.map((m) => m.slice(1, -1)).join(", ") : safeString(text);
}

/** Extrae palabra clave de sucursal del texto */
function extractBranchKeyword(text: string): string | null {
    return findMatchingWord(text, [...BRANCH_KEYWORDS]);
}

/** Filtra tags especiales, retorna null si el texto es un tag especial */
function filterSpecialTags(text: string): string | null {
    const content = safeString(text);
    const normalized = content.replace(/\s+/g, "").toLowerCase();
    return SPECIAL_TAGS.has(normalized) ? null : content;
}

/** Extrae duración del nombre del programa usando el mapeo de duraciones */
function extractDuration(programName: string): string | null {
    const content = safeString(programName);
    for (const [keyword, duration] of Object.entries(DURATION_MAP)) {
        if (matchesWord(content, keyword)) {
            return duration;
        }
    }
    return null;
}



/** Determina el turno según la hora de inicio */
function determineShift(startTime: string | number): string {
    const { hours } = parseTimeValue(startTime);
    // P. ZUÑIGA = turno mañana (antes de 14:00)
    // H. GARCIA = turno tarde (14:00+)
    return hours < 14 ? "P. ZUÑIGA" : "H. GARCIA";
}

/** Convierte serial de fecha Excel a string formato DD/MM/YYYY */
function excelDateToString(serial: number): string {
    // Epoch de Excel: 1 Enero 1900. Epoch de JS: 1 Enero 1970.
    // Usamos UTC para evitar problemas de zona horaria.
    const utcDays = Math.floor(serial - 25569);
    const date = new Date(utcDays * 86400 * 1000);

    const day = String(date.getUTCDate()).padStart(2, "0");
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const year = date.getUTCFullYear();
    return `${day}/${month}/${year}`;
}

// =============================================================================
// FUNCIÓN PRINCIPAL DE PARSEO
// =============================================================================

export async function parseExcelFile(file: File): Promise<Schedule[]> {
    const buffer = await file.arrayBuffer();
    const workbook = read(buffer, { type: "array" });
    const schedules: Schedule[] = [];

    for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        // Convertimos la hoja a un array 2D de filas/columnas:
        // sheet[fila][columna] donde sheet[0] = Fila 1 en Excel, sheet[1] = Fila 2, etc.
        // Cada fila es un array de celdas: [ColA, ColB, ColC, ...]
        // Primero intentamos detectar si es un archivo exportado (formato simple)
        const rawSheet = utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][];
        if (!rawSheet || rawSheet.length === 0) continue;

        const headerRow = rawSheet[0] as unknown[];

        // Verificamos si los headers coinciden con las propiedades de Schedule
        // (Al exportar usamos las claves de la interfaz: date, shift, etc.)
        const isExportedFormat = headerRow && headerRow.some((cell) => {
            const val = safeString(cell);
            return val === "start_time" || val === "instructor" || val === "program";
        });

        if (isExportedFormat) {
            // Parseo simple para archivos exportados
            const exportData = utils.sheet_to_json(worksheet) as Schedule[];
            // Normalizar tiempos a 24h para consistencia interna
            const normalizedData = exportData.map(item => ({
                ...item,
                start_time: formatTimeTo24h(item.start_time),
                end_time: formatTimeTo24h(item.end_time)
            }));
            schedules.push(...normalizedData);
            continue;
        }

        // Si no es formato exportado, usamos la lógica compleja original
        const sheet = rawSheet;

        if (!sheet || sheet.length < 6) continue;

        try {
            // Filas de encabezado (ajustadas para comportamiento de Pandas read_excel header=0)
            const row0 = sheet[1] as unknown[]; // Fila Excel 2
            const row3 = sheet[4] as unknown[]; // Fila Excel 5
            const row4 = sheet[5] as unknown[]; // Fila Excel 6

            // Extraer metadatos del encabezado
            const scheduleDateVal = row0[14]; // Columna O
            const locationVal = row0[21];     // Columna V
            const instructorCode = safeString(row3[0]);
            const instructorName = safeString(row4[0]);

            const scheduleDate =
                typeof scheduleDateVal === "number"
                    ? excelDateToString(scheduleDateVal)
                    : safeString(scheduleDateVal);

            const branchName = extractBranchKeyword(safeString(locationVal)) ?? "";

            // Contar grupos para cálculo de unidades
            const groupCounts: Record<string, number> = {};
            for (let i = 7; i < sheet.length; i++) {
                const group = sheet[i]?.[17];
                if (group) {
                    const key = safeString(group);
                    groupCounts[key] = (groupCounts[key] || 0) + 1;
                }
            }

            // Procesar filas de datos (desde Fila Excel 8 = índice JS 7)
            for (let i = 7; i < sheet.length; i++) {
                const row = sheet[i];
                if (!row) continue;

                const startTime = row[0];
                const endTime = row[3];
                let groupName = row[17];   // Columna R
                const rawBlock = row[19];  // Columna T
                const programName = row[25]; // Columna Z

                if (!startTime || !endTime) continue;

                // Usar bloque como fallback para nombre de grupo
                const blockFiltered = rawBlock ? filterSpecialTags(safeString(rawBlock)) : null;
                if (!groupName || safeString(groupName).trim() === "") {
                    if (blockFiltered?.trim()) {
                        groupName = blockFiltered;
                    } else {
                        continue;
                    }
                }

                const startTimeStr = extractParenthesizedContent(safeString(startTime));
                const endTimeStr = extractParenthesizedContent(safeString(endTime));

                // Determinar sucursal (agregar KIDS si aplica)
                const programKeyword = extractBranchKeyword(safeString(programName));
                const branch =
                    programKeyword === "KIDS" && branchName
                        ? `${branchName}/${programKeyword}`
                        : branchName;

                schedules.push({
                    date: scheduleDate,
                    shift: determineShift(startTimeStr),
                    branch,
                    start_time: formatTimeTo24h(startTimeStr),
                    end_time: formatTimeTo24h(endTimeStr),
                    code: instructorCode,
                    instructor: instructorName,
                    program: safeString(groupName),
                    minutes: extractDuration(safeString(programName)) ?? "0",
                    units: groupCounts[safeString(groupName)] ?? 0,
                });
            }
        } catch (err) {
            console.warn(`Error al parsear hoja ${sheetName}:`, err);
        }
    }

    return schedules;
}
