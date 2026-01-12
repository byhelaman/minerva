/**
 * Convierte cualquier valor a string de forma segura (maneja null/undefined)
 */
function safeString(val: unknown): string {
    return String(val ?? "");
}

interface ParsedTime {
    hours: number;
    minutes: number;
}

/** Parsea tiempo desde serial de Excel o string a horas/minutos */
export function parseTimeValue(value: string | number): ParsedTime {
    // Serial de Excel (fracción del día: 0.5 = 12:00, 0.75 = 18:00)
    if (typeof value === "number") {
        const totalMinutes = Math.round(value * 24 * 60);
        return {
            hours: Math.floor(totalMinutes / 60) % 24,
            minutes: totalMinutes % 60,
        };
    }

    const text = safeString(value).trim();

    // Intentar parsear formato AM/PM (ej: "2:30 PM", "8:00 a.m.")
    const ampmMatch = text.match(/(\d{1,2}):(\d{2})\s*(AM|PM|a\.m\.|p\.m\.)/i);
    if (ampmMatch) {
        let hours = parseInt(ampmMatch[1], 10);
        const minutes = parseInt(ampmMatch[2], 10);
        const period = ampmMatch[3].toUpperCase().replace(/\./g, "");

        if (period === "PM" && hours !== 12) hours += 12;
        else if (period === "AM" && hours === 12) hours = 0;

        return { hours, minutes };
    }

    // Intentar parsear formato 24h (ej: "14:30", "08:00")
    const timeMatch = text.match(/(\d{1,2}):(\d{2})/);
    if (timeMatch) {
        return {
            hours: parseInt(timeMatch[1], 10),
            minutes: parseInt(timeMatch[2], 10),
        };
    }

    // Fallback por defecto
    return { hours: 0, minutes: 0 };
}

/** Formatea un valor de tiempo a formato 24h (HH:MM) */
export function formatTimeTo24h(value: string | number): string {
    const { hours, minutes } = parseTimeValue(value);
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** Formatea un valor de tiempo a formato 12h (hh:mm AM/PM) */
export function formatTimeTo12Hour(value: string | number): string {
    const { hours, minutes } = parseTimeValue(value);
    const period = hours >= 12 ? "PM" : "AM";
    const hours12 = hours % 12 || 12; // Convierte 0 a 12
    return `${String(hours12).padStart(2, "0")}:${String(minutes).padStart(2, "0")} ${period}`;
}
