import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// =============================================================================
// UTILIDADES DE FECHA - Formato ISO 8601 (YYYY-MM-DD)
// =============================================================================

/** Formatea un objeto Date a string ISO (YYYY-MM-DD) */
export function formatDateToISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Parsea un string de fecha ISO (YYYY-MM-DD) a un objeto Date */
export function parseISODate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** Obtiene la fecha de hoy en formato ISO (YYYY-MM-DD) */
export function getTodayISO(): string {
  return formatDateToISO(new Date());
}

/** Extrae año y mes de un string de fecha ISO */
export function extractYearMonth(dateStr: string): { year: string; month: string } {
  const [year, month] = dateStr.split('-');
  return { year, month };
}

/**
 * Formatea un string de fecha ISO (YYYY-MM-DD) para mostrar como DD/MM/YYYY.
 * Manipulación pura de strings — sin constructor Date, sin problemas de timezone.
 */
export function formatDateForDisplay(isoDate: string | null | undefined): string {
  if (!isoDate) return '';
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

/**
 * Formatea un timestamp ISO para mostrar como DD/MM/YYYY HH:mm.
 * Usa Date con métodos locales para extraer la hora.
 */
export function formatTimestampForDisplay(isoTimestamp: string): string {
  const d = new Date(isoTimestamp);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}
