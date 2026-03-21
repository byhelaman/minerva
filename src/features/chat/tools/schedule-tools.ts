import { useScheduleDataStore } from "@/features/schedules/stores/useScheduleDataStore";
import { useScheduleUIStore } from "@/features/schedules/stores/useScheduleUIStore";
import { parseTimeToMinutes } from "@/features/schedules/utils/time-utils";
import { findAvailableInstructors } from "../engine/local-queries";
import type { Schedule } from "@/features/schedules/types";
import type {
  GetSchedulesForDateInput,
  CheckInstructorAvailabilityInput,
  FindInstructorScheduleInput,
  FindAvailableInstructorsInput,
} from "../types";

// ---------------------------------------------------------------------------
// Obtiene los horarios locales para una fecha (solo fecha activa disponible)
// ---------------------------------------------------------------------------
function getLocalSchedules(date: string): { schedules: Schedule[]; activeDate: string | null } {
  const activeDate = useScheduleUIStore.getState().activeDate;
  return { schedules: date === activeDate ? useScheduleDataStore.getState().baseSchedules : [], activeDate };
}

// ---------------------------------------------------------------------------
// Normalización para matching de instructores (NFD + sin acentos + lowercase)
// ---------------------------------------------------------------------------
function normalizeForSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function matchesInstructor(dbName: string, query: string): boolean {
  const normalizedDb = normalizeForSearch(dbName);
  const tokens = normalizeForSearch(query).split(" ").filter(Boolean);
  return tokens.every((token) => normalizedDb.includes(token));
}

// ---------------------------------------------------------------------------
// Definiciones de herramientas — formato OpenAI function calling
// Compatible con: OpenAI, Gemini (OpenAI compat), Groq, Ollama, etc.
// ---------------------------------------------------------------------------
export const SCHEDULE_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "get_schedules_for_date",
      description:
        "Returns scheduled classes for a given date. " +
        "IMPORTANT RULES: " +
        "(1) If the user asks 'how many' or 'cuántas' WITHOUT asking for details, set count_only=true to avoid sending unnecessary data. " +
        "(2) If the user mentions a specific time ('a las 18', 'a las 20:00'), ALWAYS set time_filter to that time in HH:MM format. " +
        "(3) If the user asks about a program type ('corp', 'kids', 'adultos'), set program_filter. " +
        "(4) Combine filters when needed (e.g. count_only=true + time_filter to count classes at a specific hour).",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "Date in YYYY-MM-DD format",
          },
          time_filter: {
            type: "string",
            description:
              "Time in HH:MM 24h format. Returns only classes active at that moment (start_time <= time <= end_time). MUST be used whenever the user specifies a time.",
          },
          program_filter: {
            type: "string",
            description:
              "Keyword to filter by program name (case-insensitive partial match). E.g. 'corp', 'kids', 'adultos'. Also use this to find who teaches a specific student's class.",
          },
          branch_filter: {
            type: "string",
            description:
              "Keyword to filter by branch/sede (case-insensitive partial match). E.g. 'HUB', 'Centro'.",
          },
          count_only: {
            type: "boolean",
            description:
              "If true, returns only the total count (no schedule details). Use when the user asks 'how many' or 'cuántas' without needing the list.",
          },
        },
        required: ["date"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "check_instructor_availability",
      description:
        "Checks if a specific instructor has any schedule conflicts during a given time range on a date. Returns whether they are available and any conflicting entries.",
      parameters: {
        type: "object",
        properties: {
          instructor_name: {
            type: "string",
            description: "Instructor name (partial match accepted)",
          },
          date: {
            type: "string",
            description: "Date in YYYY-MM-DD format",
          },
          start_time: {
            type: "string",
            description: "Start time in HH:MM 24h format",
          },
          end_time: {
            type: "string",
            description: "End time in HH:MM 24h format",
          },
        },
        required: ["instructor_name", "date", "start_time", "end_time"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "find_instructor_schedule",
      description:
        "Returns all schedule entries for a specific instructor on a date or date range.",
      parameters: {
        type: "object",
        properties: {
          instructor_name: {
            type: "string",
            description: "Instructor name (partial match accepted)",
          },
          date: {
            type: "string",
            description: "Date in YYYY-MM-DD format",
          },
          end_date: {
            type: "string",
            description:
              "Optional end date for range queries in YYYY-MM-DD format",
          },
        },
        required: ["instructor_name", "date"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "find_available_instructors",
      description:
        "Returns all instructors who are FREE (no schedule conflict) during a given time range on a date. " +
        "Use this when the user asks who CAN take an evaluation, cover a class, or is available at a specific time. " +
        "For queries like '19:00 (20min)', parse end_time as start + duration (19:00 + 20min = 19:20). " +
        "If the user says 'only these instructors are evaluators' or restricts to a subset, use instructor_list to filter.",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "Date in YYYY-MM-DD format",
          },
          start_time: {
            type: "string",
            description: "Start time in HH:MM 24h format",
          },
          end_time: {
            type: "string",
            description: "End time in HH:MM 24h format",
          },
          instructor_list: {
            type: "array",
            items: { type: "string" },
            description:
              "Optional. Restrict availability check to only these instructors (partial name match). Use when the user says 'considering only X, Y, Z are evaluators' or similar.",
          },
        },
        required: ["date", "start_time", "end_time"],
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------
async function handleGetSchedulesForDate(input: GetSchedulesForDateInput) {
  if (!input.date) return { error: "Se requiere el parámetro 'date'" };

  const { schedules, activeDate } = getLocalSchedules(input.date);
  if (schedules.length === 0 && input.date !== activeDate) {
    return { error: `Solo tengo datos para la fecha activa: ${activeDate ?? "ninguna"}. Cambia la fecha en la vista principal.` };
  }

  let filtered = schedules;

  // Filtrar por hora activa
  if (input.time_filter) {
    const filterMinutes = parseTimeToMinutes(input.time_filter);
    filtered = filtered.filter((s: Schedule) => {
      if (!s.end_time) return false;
      return (
        parseTimeToMinutes(s.start_time) <= filterMinutes &&
        filterMinutes < parseTimeToMinutes(s.end_time)
      );
    });
  }

  // Filtrar por nombre de programa
  if (input.program_filter) {
    const keyword = normalizeForSearch(input.program_filter);
    filtered = filtered.filter((s: Schedule) =>
      normalizeForSearch(s.program ?? "").includes(keyword)
    );
  }

  // Filtrar por sede
  if (input.branch_filter) {
    const keyword = normalizeForSearch(input.branch_filter);
    filtered = filtered.filter((s: Schedule) =>
      normalizeForSearch(s.branch).includes(keyword)
    );
  }

  const total = filtered.length;

  // count_only: solo devolver el total, sin detalle (ahorra tokens)
  if (input.count_only) {
    return {
      date: input.date,
      count: total,
      filters_applied: {
        time_filter: input.time_filter ?? null,
        program_filter: input.program_filter ?? null,
        branch_filter: input.branch_filter ?? null,
      },
    };
  }

  if (total === 0) {
    return {
      found: false,
      date: input.date,
      filters_applied: {
        time_filter: input.time_filter ?? null,
        program_filter: input.program_filter ?? null,
        branch_filter: input.branch_filter ?? null,
      },
      schedules: [],
    };
  }

  // Cap a 50 para no superar límites de tokens
  const MAX_RESULTS = 50;
  const capped = filtered.slice(0, MAX_RESULTS);

  return {
    found: true,
    date: input.date,
    count: total,
    ...(total > MAX_RESULTS && { truncated: true, showing: MAX_RESULTS }),
    schedules: capped.map((s: Schedule) => ({
      instructor: s.instructor,
      program: s.program,
      start_time: s.start_time,
      end_time: s.end_time,
    })),
  };
}

async function handleCheckInstructorAvailability(
  input: CheckInstructorAvailabilityInput
) {
  if (!input.instructor_name || !input.date || !input.start_time || !input.end_time) {
    return { error: "Faltan parámetros requeridos" };
  }

  const { schedules, activeDate } = getLocalSchedules(input.date);
  if (schedules.length === 0 && input.date !== activeDate) {
    return { error: `Solo tengo datos para la fecha activa: ${activeDate ?? "ninguna"}. Cambia la fecha en la vista principal.` };
  }

  const instructorSchedules = schedules.filter((s: Schedule) =>
    matchesInstructor(s.instructor, input.instructor_name)
  );

  const queryStart = parseTimeToMinutes(input.start_time);
  const queryEnd = parseTimeToMinutes(input.end_time);

  const conflicts = instructorSchedules.filter((s: Schedule) => {
    if (!s.end_time) return false;
    const entryStart = parseTimeToMinutes(s.start_time);
    const entryEnd = parseTimeToMinutes(s.end_time);
    return !(entryEnd <= queryStart || entryStart >= queryEnd);
  });

  return {
    instructor_query: input.instructor_name,
    matched_instructors: [...new Set(instructorSchedules.map((s: Schedule) => s.instructor))],
    date: input.date,
    time_range: `${input.start_time}–${input.end_time}`,
    is_available: conflicts.length === 0,
    conflicts: conflicts.map((c: Schedule) => ({
      program: c.program,
      start_time: c.start_time,
      end_time: c.end_time,
    })),
  };
}

async function handleFindInstructorSchedule(
  input: FindInstructorScheduleInput
) {
  if (!input.instructor_name || !input.date) {
    return { error: "Faltan parámetros requeridos" };
  }

  const queryDate = input.end_date ? input.date : input.date;
  const { schedules, activeDate } = getLocalSchedules(queryDate);
  if (schedules.length === 0 && input.date !== activeDate) {
    return { error: `Solo tengo datos para la fecha activa: ${activeDate ?? "ninguna"}. Cambia la fecha en la vista principal.` };
  }

  const instructorSchedules = schedules.filter((s: Schedule) =>
    matchesInstructor(s.instructor, input.instructor_name)
  );

  return {
    instructor_query: input.instructor_name,
    matched_instructors: [...new Set(instructorSchedules.map((s: Schedule) => s.instructor))],
    date_range: input.end_date
      ? `${input.date} to ${input.end_date}`
      : input.date,
    count: instructorSchedules.length,
    schedules: instructorSchedules.map((s: Schedule) => ({
      date: s.date,
      program: s.program,
      start_time: s.start_time,
      end_time: s.end_time,
    })),
  };
}

async function handleFindAvailableInstructors(input: FindAvailableInstructorsInput) {
  if (!input.date || !input.start_time || !input.end_time) {
    return { error: "Faltan parámetros requeridos" };
  }

  const { schedules, activeDate } = getLocalSchedules(input.date);
  if (schedules.length === 0 && input.date !== activeDate) {
    return { error: `Solo tengo datos para la fecha activa: ${activeDate ?? "ninguna"}. Cambia la fecha en la vista principal.` };
  }

  let available = findAvailableInstructors(schedules, input.start_time, input.end_time);

  // Si se especifica una lista de instructores, filtrar solo entre ellos
  if (input.instructor_list && input.instructor_list.length > 0) {
    available = available.filter((name) =>
      input.instructor_list!.some((q) => matchesInstructor(name, q))
    );
  }

  return {
    date: input.date,
    time_range: `${input.start_time}–${input.end_time}`,
    available_count: available.length,
    available_instructors: available,
    ...(input.instructor_list?.length && { filtered_to: input.instructor_list }),
  };
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------
export async function executeToolCall(
  toolName: string,
  toolInput: Record<string, unknown>
): Promise<unknown> {
  switch (toolName) {
    case "get_schedules_for_date":
      return handleGetSchedulesForDate(toolInput as unknown as GetSchedulesForDateInput);
    case "check_instructor_availability":
      return handleCheckInstructorAvailability(
        toolInput as unknown as CheckInstructorAvailabilityInput
      );
    case "find_instructor_schedule":
      return handleFindInstructorSchedule(
        toolInput as unknown as FindInstructorScheduleInput
      );
    case "find_available_instructors":
      return handleFindAvailableInstructors(
        toolInput as unknown as FindAvailableInstructorsInput
      );
    default:
      return { error: `Herramienta desconocida: ${toolName}` };
  }
}

// Labels legibles para la UI
export const TOOL_LABELS: Record<string, string> = {
  get_schedules_for_date: "Consultando horarios...",
  check_instructor_availability: "Verificando disponibilidad del instructor...",
  find_instructor_schedule: "Buscando horario del instructor...",
  find_available_instructors: "Buscando instructores disponibles...",
};
