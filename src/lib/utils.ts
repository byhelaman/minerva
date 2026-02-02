import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// =============================================================================
// UTILIDADES DE FECHA - Formato ISO 8601 (YYYY-MM-DD)
// =============================================================================

import { format, parseISO } from "date-fns";

/** Formatea un objeto Date a string ISO (YYYY-MM-DD) */
export function formatDateToISO(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/** Parsea un string de fecha ISO (YYYY-MM-DD) a un objeto Date */
export function parseISODate(dateStr: string): Date {
  return parseISO(dateStr);
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
 * Útil para fechas que representan "días calendario" sin hora específica.
 */
export function formatDateForDisplay(isoDate: string | null | undefined): string {
  if (!isoDate) return '';
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

/**
 * Formatea un timestamp ISO para mostrar como DD/MM/YYYY HH:mm.
 * Usa date-fns para formato consistente.
 */
export function formatTimestampForDisplay(isoTimestamp: string): string {
  if (!isoTimestamp) return "";
  return format(parseISO(isoTimestamp), "dd/MM/yyyy HH:mm");
}
