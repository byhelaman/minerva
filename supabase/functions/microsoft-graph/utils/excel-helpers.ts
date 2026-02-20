// Utilidades de Microsoft Graph / Excel
// Funciones compartidas para normalizar y formatear datos

/**
 * Convierte un número de columna entero (base 0) a su letra equivalente en Excel (0 -> A, 27 -> AB).
 */
export function getColumnLetter(index: number): string {
    let letter = ""
    while (index >= 0) {
        letter = String.fromCharCode((index % 26) + 65) + letter
        index = Math.floor(index / 26) - 1
    }
    return letter
}

/**
 * Analiza una referencia de celda de Excel (ej. "A1", "Z99") convirtiéndola en columna (base 0) y fila (base 1).
 */
export function parseCell(cell: string): { col: number; row: number } {
    const match = cell.match(/^([A-Z]+)([0-9]+)$/i)
    if (!match) return { col: 0, row: 1 }
    const colStr = match[1].toUpperCase()
    const row = parseInt(match[2], 10)
    let col = 0
    for (let i = 0; i < colStr.length; i++) col = col * 26 + (colStr.charCodeAt(i) - 64)
    return { col: col - 1, row }
}

/**
 * Normaliza variaciones de fechas o fechas seriales de Excel al formato YYYY-MM-DD.
 */
export function normalizeDate(value: any): string {
    if (!value) return '';
    const str = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.substring(0, 10);
    const ddmmyyyyMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (ddmmyyyyMatch) {
        const [, day, month, year] = ddmmyyyyMatch;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    const num = Number(value);
    if (!isNaN(num) && num > 25000 && num < 60000) {
        const excelEpoch = new Date(1900, 0, 1);
        const date = new Date(excelEpoch.getTime() + (num - 2) * 86400000);
        return date.toISOString().substring(0, 10);
    }
    return str;
}

/**
 * Normaliza variaciones de horas o fracciones de hora de Excel al formato HH:MM.
 */
export function normalizeTime(value: any): string {
    if (!value && value !== 0) return '';
    const num = Number(value);
    if (!isNaN(num) && num >= 0 && num < 1) {
        const totalMinutes = Math.round(num * 24 * 60);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }
    const str = String(value).trim();
    if (/^\d{2}:\d{2}$/.test(str)) return str;
    if (/^\d{2}:\d{2}:\d{2}/.test(str)) return str.substring(0, 5);
    if (/^\d{1}:\d{2}/.test(str)) return '0' + str.substring(0, 4);
    return str;
}

/**
 * Normaliza líneas de texto, eliminando espacios en blanco finales y límites Unicode invisibles.
 */
export function normalizeText(value: any): string {
    if (!value) return '';
    return String(value).trim().replace(/\s+/g, ' ').replace(/[\u200B-\u200D\uFEFF]/g, '');
}
