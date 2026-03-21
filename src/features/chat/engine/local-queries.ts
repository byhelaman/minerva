/**
 * Motor de consultas local — ejecuta queries sobre Schedule[] sin llamar al LLM.
 * El LLM solo recibe el resultado ya calculado para formatearlo en lenguaje natural.
 */
import type { Schedule } from "@/features/schedules/types";
import { parseTimeToMinutes } from "@/features/schedules/utils/time-utils";

const MAX_LIST_ITEMS = 25;
const WORKDAY_START = "06:00";
const WORKDAY_END = "22:00";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/** Todos los tokens del query deben aparecer en el texto */
function matchesTokens(dbValue: string, query: string): boolean {
  const normDb = normalizeText(dbValue);
  return normalizeText(query)
    .split(" ")
    .filter(Boolean)
    .every((t) => normDb.includes(t));
}

function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, "0");
  const mn = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${mn}`;
}

/** Busca instructores cuyos nombres se parecen al query (al menos un token coincide) */
function findSimilarInstructors(schedules: Schedule[], query: string): string[] {
  const normQuery = normalizeText(query).split(" ").filter(Boolean);
  const all = [...new Set(schedules.map((s) => s.instructor))];
  return all
    .filter((name) => {
      const normName = normalizeText(name);
      return normQuery.some((t) => normName.includes(t));
    })
    .slice(0, 3);
}

// ---------------------------------------------------------------------------
// Funciones de consulta puras
// ---------------------------------------------------------------------------

export function findAvailableInstructors(
  schedules: Schedule[],
  startTime: string,
  endTime: string
): string[] {
  const qStart = parseTimeToMinutes(startTime);
  const qEnd = parseTimeToMinutes(endTime);
  const all = new Set(schedules.map((s) => s.instructor));
  const busy = new Set(
    schedules
      .filter((s) => {
        if (!s.end_time) return false;
        const sStart = parseTimeToMinutes(s.start_time);
        const sEnd = parseTimeToMinutes(s.end_time);
        return !(sEnd <= qStart || sStart >= qEnd);
      })
      .map((s) => s.instructor)
  );
  return [...all].filter((i) => !busy.has(i)).sort();
}

/** Clases que inician exactamente a esa hora */
export function findClassesAtTime(schedules: Schedule[], time: string): Schedule[] {
  const t = parseTimeToMinutes(time);
  return schedules.filter((s) => parseTimeToMinutes(s.start_time) === t);
}

/** Clases que inician dentro de un rango de hora (para "entre X y Y") */
export function findClassesInRange(schedules: Schedule[], startTime: string, endTime: string): Schedule[] {
  const rangeStart = parseTimeToMinutes(startTime);
  const rangeEnd = parseTimeToMinutes(endTime);
  return schedules.filter((s) => {
    const start = parseTimeToMinutes(s.start_time);
    return start >= rangeStart && start <= rangeEnd;
  });
}

export function findInstructorClasses(schedules: Schedule[], name: string): Schedule[] {
  return schedules.filter((s) => matchesTokens(s.instructor, name));
}

export function findExtremeInstructors(
  schedules: Schedule[],
  mode: "min" | "max"
): { instructor: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const s of schedules) counts.set(s.instructor, (counts.get(s.instructor) ?? 0) + 1);
  if (counts.size === 0) return [];
  const extreme = mode === "min" ? Math.min(...counts.values()) : Math.max(...counts.values());
  return [...counts.entries()]
    .filter(([, c]) => c === extreme)
    .map(([instructor, count]) => ({ instructor, count }))
    .sort((a, b) => a.instructor.localeCompare(b.instructor));
}

export function findByBranch(schedules: Schedule[], query: string): Schedule[] {
  return schedules.filter((s) => matchesTokens(s.branch, query));
}

export function findByProgram(schedules: Schedule[], query: string): Schedule[] {
  return schedules.filter((s) => matchesTokens(s.program ?? "", query));
}

export function findByShift(schedules: Schedule[], query: string): Schedule[] {
  return schedules.filter((s) => matchesTokens(s.shift, query));
}

/**
 * Solo detecta doble-asignación: mismo instructor en dos clases solapadas.
 * (Antes comparaba todos los pares posibles, generando miles de falsos positivos.)
 */
export function findOverlappingClasses(schedules: Schedule[]): Array<[Schedule, Schedule]> {
  const byInstructor = new Map<string, Schedule[]>();
  for (const s of schedules) {
    if (!byInstructor.has(s.instructor)) byInstructor.set(s.instructor, []);
    byInstructor.get(s.instructor)!.push(s);
  }
  const pairs: Array<[Schedule, Schedule]> = [];
  for (const [, classes] of byInstructor) {
    for (let i = 0; i < classes.length; i++) {
      for (let j = i + 1; j < classes.length; j++) {
        const a = classes[i], b = classes[j];
        if (!a.end_time || !b.end_time) continue;
        const aStart = parseTimeToMinutes(a.start_time);
        const aEnd = parseTimeToMinutes(a.end_time);
        const bStart = parseTimeToMinutes(b.start_time);
        const bEnd = parseTimeToMinutes(b.end_time);
        if (!(aEnd <= bStart || bEnd <= aStart)) pairs.push([a, b]);
      }
    }
  }
  return pairs;
}

/** Calcula ventanas libres de un instructor dentro del horario laboral */
export function findInstructorFreeSlots(
  schedules: Schedule[],
  instructorName: string
): { instructor: string; classes: Schedule[]; freeSlots: Array<{ start: string; end: string }> } {
  const classes = schedules
    .filter((s) => matchesTokens(s.instructor, instructorName) && s.end_time)
    .sort((a, b) => parseTimeToMinutes(a.start_time) - parseTimeToMinutes(b.start_time));

  const instructor = classes[0]?.instructor ?? instructorName;
  if (classes.length === 0) return { instructor, classes: [], freeSlots: [] };

  const wsMin = parseTimeToMinutes(WORKDAY_START);
  const weMin = parseTimeToMinutes(WORKDAY_END);
  const freeSlots: Array<{ start: string; end: string }> = [];

  let cursor = wsMin;
  for (const cls of classes) {
    const start = parseTimeToMinutes(cls.start_time);
    const end = parseTimeToMinutes(cls.end_time!);
    if (start > cursor) freeSlots.push({ start: minutesToHHMM(cursor), end: minutesToHHMM(start) });
    cursor = Math.max(cursor, end);
  }
  if (cursor < weMin) freeSlots.push({ start: minutesToHHMM(cursor), end: minutesToHHMM(weMin) });

  return { instructor, classes, freeSlots };
}

/** Busca por código de clase o nombre de programa (alumno/clase) */
export function findByCodeOrProgram(schedules: Schedule[], query: string): Schedule[] {
  const byCode = schedules.filter((s) => s.code && matchesTokens(s.code, query));
  if (byCode.length > 0) return byCode;
  return schedules.filter((s) => matchesTokens(s.program ?? "", query));
}

// ---------------------------------------------------------------------------
// Tipo resultado
// ---------------------------------------------------------------------------
export type LocalQueryResult =
  | { kind: "available_instructors"; instructors: string[]; startTime: string; endTime: string }
  | { kind: "classes_at_time"; schedules: Schedule[]; time: string }
  | { kind: "instructor_schedule"; schedules: Schedule[]; name: string }
  | { kind: "instructor_list"; names: string[] }
  | { kind: "extreme_instructors"; results: { instructor: string; count: number }[]; mode: "min" | "max" }
  | { kind: "count"; count: number; label: string }
  | { kind: "filtered_schedules"; schedules: Schedule[]; filterLabel: string }
  | { kind: "multi_filter"; schedules: Schedule[]; description: string }
  | { kind: "not_found"; query: string; suggestions: string[] }
  | { kind: "overlapping"; pairs: Array<[Schedule, Schedule]> }
  | { kind: "instructor_free_slots"; instructor: string; classes: Schedule[]; freeSlots: Array<{ start: string; end: string }> }
  | { kind: "who_has_class"; query: string; matches: Schedule[] }
  | { kind: "instructor_availability"; instructor: string; available: boolean; conflicts: Schedule[]; start: string; end: string }
  | { kind: "none" };

export type ParsedIntent =
  | { type: "instructor_schedule"; instructor: string }
  | { type: "instructor_free_slots"; instructor: string }
  | { type: "classes_at_time"; time: string }
  | { type: "classes_in_range"; start: string; end: string }
  | { type: "count"; branch?: string; program?: string }
  | { type: "available_instructors"; start: string; end: string; instructor_list?: string[] }
  | { type: "instructor_availability"; instructor: string; start: string; end: string }
  | { type: "who_has_class"; query: string }
  | { type: "filtered_schedules"; branch?: string; program?: string; shift?: string }
  | { type: "all_instructors" }
  | { type: "extreme_instructors"; mode: "min" | "max" }
  | { type: "unknown" };

/** Extrae el array de schedules de cualquier resultado con datos de clases (útil para follow-ups). */
export function extractSchedulesFromResult(result: LocalQueryResult): Schedule[] {
  switch (result.kind) {
    case "instructor_schedule": return result.schedules;
    case "classes_at_time": return result.schedules;
    case "filtered_schedules": return result.schedules;
    case "multi_filter": return result.schedules;
    case "instructor_free_slots": return result.classes;
    case "who_has_class": return result.matches;
    case "instructor_availability": return result.conflicts;
    default: return [];
  }
}

// ---------------------------------------------------------------------------
// Ejecución de intents
// ---------------------------------------------------------------------------

export function executeIntent(intent: ParsedIntent, schedules: Schedule[]): LocalQueryResult {
  switch (intent.type) {
    case "instructor_schedule": {
      const classes = findInstructorClasses(schedules, intent.instructor);
      if (classes.length === 0) {
        const suggestions = findSimilarInstructors(schedules, intent.instructor);
        return { kind: "not_found", query: intent.instructor, suggestions };
      }
      return { kind: "instructor_schedule", schedules: classes, name: classes[0].instructor };
    }
    case "instructor_free_slots": {
      const result = findInstructorFreeSlots(schedules, intent.instructor);
      if (result.classes.length === 0) {
        const suggestions = findSimilarInstructors(schedules, intent.instructor);
        return { kind: "not_found", query: intent.instructor, suggestions };
      }
      return { kind: "instructor_free_slots", instructor: result.instructor, classes: result.classes, freeSlots: result.freeSlots };
    }
    case "classes_at_time":
      return { kind: "classes_at_time", schedules: findClassesAtTime(schedules, intent.time), time: intent.time };
    case "count": {
      let filtered = schedules;
      let label = "en total";
      if (intent.branch) {
        const res = findByBranch(filtered, intent.branch);
        if (res.length > 0) { filtered = res; label = `en ${res[0].branch}`; }
      }
      if (intent.program) {
        const res = findByProgram(filtered, intent.program);
        if (res.length > 0) { filtered = res; label += ` programa ${intent.program}`; }
      }
      return { kind: "count", count: filtered.length, label };
    }
    case "classes_in_range":
      return { kind: "classes_at_time", schedules: findClassesInRange(schedules, intent.start, intent.end), time: `${intent.start}-${intent.end}` };
    case "available_instructors": {
      let available = findAvailableInstructors(schedules, intent.start, intent.end);
      if (intent.instructor_list?.length) {
        available = available.filter((name) =>
          intent.instructor_list!.some((q) => matchesTokens(name, q))
        );
      }
      return { kind: "available_instructors", instructors: available, startTime: intent.start, endTime: intent.end };
    }
    case "instructor_availability": {
      const classes = findInstructorClasses(schedules, intent.instructor);
      const name = classes[0]?.instructor ?? intent.instructor;
      const qStart = parseTimeToMinutes(intent.start);
      const qEnd = parseTimeToMinutes(intent.end);
      const conflicts = classes.filter((s) => {
        if (!s.end_time) return false;
        const sStart = parseTimeToMinutes(s.start_time);
        const sEnd = parseTimeToMinutes(s.end_time);
        return !(sEnd <= qStart || sStart >= qEnd);
      });
      return { kind: "instructor_availability", instructor: name, available: conflicts.length === 0, conflicts, start: intent.start, end: intent.end };
    }
    case "who_has_class":
      return { kind: "who_has_class", query: intent.query, matches: findByCodeOrProgram(schedules, intent.query) };
    case "filtered_schedules": {
      let filtered = schedules;
      const labels: string[] = [];
      if (intent.branch) { const r = findByBranch(filtered, intent.branch); if (r.length > 0) { filtered = r; labels.push(`sede ${r[0].branch}`); } }
      if (intent.program) { const r = findByProgram(filtered, intent.program); if (r.length > 0) { filtered = r; labels.push(`programa ${intent.program}`); } }
      if (intent.shift) { const r = findByShift(filtered, intent.shift); if (r.length > 0) { filtered = r; labels.push(`turno ${intent.shift}`); } }
      return { kind: "filtered_schedules", schedules: filtered, filterLabel: labels.join(" + ") || "general" };
    }
    case "all_instructors":
      return { kind: "instructor_list", names: [...new Set(schedules.map((s) => s.instructor))].sort() };
    case "extreme_instructors":
      return { kind: "extreme_instructors", results: findExtremeInstructors(schedules, intent.mode), mode: intent.mode };
    default:
      return { kind: "none" };
  }
}

// ---------------------------------------------------------------------------
// Serialización compacta para inyectar en el prompt del LLM
// ---------------------------------------------------------------------------
function capList<T>(items: T[], serialize: (item: T) => string): string {
  const shown = items.slice(0, MAX_LIST_ITEMS);
  const suffix = items.length > MAX_LIST_ITEMS
    ? `\n... y ${items.length - MAX_LIST_ITEMS} más (total: ${items.length})`
    : "";
  return shown.map(serialize).join("\n") + suffix;
}

export function serializeResult(result: LocalQueryResult, activeDate: string): string {
  switch (result.kind) {
    case "available_instructors":
      return result.instructors.length === 0
        ? `No hay instructores disponibles de ${result.startTime} a ${result.endTime} el ${activeDate} (todos tienen clase).`
        : `Instructores disponibles de ${result.startTime} a ${result.endTime} el ${activeDate} (${result.instructors.length}):\n` +
        capList(result.instructors, (i) => `- ${i}`);

    case "classes_at_time":
      return result.schedules.length === 0
        ? `No hay clases a las ${result.time} el ${activeDate}.`
        : `Clases activas a las ${result.time} el ${activeDate} (${result.schedules.length}):\n` +
        capList(result.schedules, (s) => `- instructor: ${s.instructor} | clase: ${s.program} | sede: ${s.branch} | horario: ${s.start_time}-${s.end_time}`);

    case "instructor_schedule":
      return result.schedules.length === 0
        ? `${result.name} no tiene clases el ${activeDate}.`
        : `Clases de ${result.name} el ${activeDate} (${result.schedules.length}):\n` +
        capList(result.schedules, (s) => `- horario: ${s.start_time}-${s.end_time} | sede: ${s.branch} | clase: ${s.program}`);

    case "multi_filter":
      return result.schedules.length === 0
        ? `No se encontraron clases para ${result.description} el ${activeDate}.`
        : `Clases para ${result.description} el ${activeDate} (${result.schedules.length}):\n` +
        capList(result.schedules, (s) => `- horario: ${s.start_time}-${s.end_time} | sede: ${s.branch} | clase: ${s.program}`);

    case "extreme_instructors": {
      const label = result.mode === "min" ? "menos" : "más";
      return (
        `Instructores con ${label} clases el ${activeDate} (${result.results[0]?.count ?? 0} clase/s):\n` +
        capList(result.results, (r) => `- ${r.instructor}`)
      );
    }

    case "instructor_list":
      return result.names.length === 0
        ? `No hay instructores registrados el ${activeDate}.`
        : `Instructores el ${activeDate} (${result.names.length}):\n${result.names.slice(0, MAX_LIST_ITEMS).join(", ")}` +
        (result.names.length > MAX_LIST_ITEMS ? ` ... y ${result.names.length - MAX_LIST_ITEMS} más` : "");

    case "count":
      return `Total de clases ${result.label} el ${activeDate}: ${result.count}.`;

    case "filtered_schedules":
      return result.schedules.length === 0
        ? `No hay clases para ${result.filterLabel} el ${activeDate}.`
        : `Clases para ${result.filterLabel} el ${activeDate} (${result.schedules.length}):\n` +
        capList(result.schedules, (s) => `- instructor: ${s.instructor} | clase: ${s.program} | horario: ${s.start_time}-${s.end_time}`);

    case "overlapping": {
      if (result.pairs.length === 0) return `No se detectaron instructores con doble asignación el ${activeDate}.`;
      return (
        `Instructores con doble asignación el ${activeDate} (${result.pairs.length} conflicto/s):\n` +
        capList(result.pairs, ([a, b]) =>
          `- ${a.instructor}: "${a.program}" (${a.start_time}-${a.end_time}) solapa con "${b.program}" (${b.start_time}-${b.end_time})`
        )
      );
    }

    case "instructor_free_slots": {
      const { instructor, classes, freeSlots } = result;
      if (classes.length === 0)
        return `${instructor} no tiene clases el ${activeDate}; disponible todo el día laboral.`;
      const classesStr = capList(classes, (s) => `- ${s.start_time}-${s.end_time} | ${s.program} | ${s.branch}`);
      const slotsStr = freeSlots.length === 0
        ? "No hay ventanas libres entre sus clases."
        : capList(freeSlots, (f) => {
          const durMin = parseTimeToMinutes(f.end) - parseTimeToMinutes(f.start);
          return `- ${f.start}-${f.end} (${durMin} min libres)`;
        });
      return `Horario de ${instructor} el ${activeDate}:\nClases (${classes.length}):\n${classesStr}\n\nVentanas disponibles:\n${slotsStr}`;
    }

    case "who_has_class":
      return result.matches.length === 0
        ? `No se encontró ninguna clase con código o programa "${result.query}" el ${activeDate}.`
        : `Clase(s) que coinciden con "${result.query}" el ${activeDate} (${result.matches.length}):\n` +
        capList(result.matches, (s) => `- Instructor: ${s.instructor} | ${s.start_time}-${s.end_time} | ${s.branch} | ${s.program}`);

    case "instructor_availability": {
      const { instructor, available, conflicts, start, end } = result;
      if (available) return `${instructor} está disponible de ${start} a ${end} el ${activeDate}.`;
      return (
        `${instructor} NO está disponible de ${start} a ${end} el ${activeDate}. Tiene clase en ese horario:\n` +
        capList(conflicts, (s) => `- ${s.start_time}-${s.end_time} | ${s.program} | ${s.branch}`)
      );
    }

    case "not_found":
      return result.suggestions.length > 0
        ? `No se encontró ningún instructor con el nombre "${result.query}". ¿Quisiste decir: ${result.suggestions.join(", ")}?`
        : `No se encontró ningún instructor con el nombre "${result.query}" el ${activeDate}.`;

    default:
      return "";
  }
}
