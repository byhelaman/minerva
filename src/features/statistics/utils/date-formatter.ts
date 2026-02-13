import { parse, format } from "date-fns"
import { es } from "date-fns/locale"

/**
 * Parses a YYYY-MM-DD string as a local date (00:00:00) without UTC conversion.
 * Used for chart labels to prevent off-by-one errors due to timezone shifts.
 */
export function parseLocalDate(dateString: string): Date {
    // parse(dateString, 'yyyy-MM-dd', new Date()) interprets input as local time
    return parse(dateString, 'yyyy-MM-dd', new Date())
}

/**
 * Formats a YYYY-MM-DD string into a readable label (e.g. "12 feb")
 * using local time interpretation.
 */
export function formatChartDate(dateString: string, formatStr: string = "d MMM"): string {
    try {
        const date = parseLocalDate(dateString)
        return format(date, formatStr, { locale: es })
    } catch (e) {
        return dateString
    }
}
