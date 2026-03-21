/**
 * Schedule tools for the chat RAG system.
 * All handlers query Supabase directly — no local in-memory data.
 */
import {
  dbGetSchedules,
  dbFindInstructor,
  dbGetSchedulesRange,
  dbGetStats,
  dbCheckInstructorAvailability,
  dbFindAvailableInstructors,
  dbGetInstructorProfile,
  dbFindEvaluators,
  dbGetEvaluatorsList,
  dbGetPoolRules,
  dbFindInstructors,
} from "../engine/db-queries";
import type {
  GetSchedulesForDateInput,
  FindInstructorScheduleInput,
  CheckInstructorAvailabilityInput,
  FindAvailableInstructorsInput,
  GetSchedulesRangeInput,
  GetScheduleStatsInput,
  GetInstructorProfileInput,
  GetPoolRulesInput,
  GetEvaluatorsListInput,
  FindEvaluatorsInput,
  FindInstructorsInput,
} from "../types";

// ---------------------------------------------------------------------------
// Tool definitions — OpenAI function calling format
// ---------------------------------------------------------------------------
export const SCHEDULE_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "get_schedules_for_date",
      description:
        "Returns scheduled classes for a specific date from the database. " +
        "Use for: 'what classes are on DATE', 'how many classes today/tomorrow'. " +
        "Set count_only=true when the user only asks 'how many' without needing the list. " +
        "Set time_filter (HH:MM) to get classes active at a specific moment.",
      parameters: {
        type: "object",
        properties: {
          date:           { type: "string", description: "Date in YYYY-MM-DD format" },
          time_filter:    { type: "string", description: "HH:MM 24h — returns only classes active at that moment" },
          program_filter: { type: "string", description: "Partial keyword match on program name (case-insensitive). Use short singular roots: 'evaluacion' not 'evaluaciones', 'kids' not 'clases kids'" },
          branch_filter:  { type: "string", description: "Partial match on branch/sede (case-insensitive)" },
          count_only:     { type: "boolean", description: "Return only the total count, no schedule details" },
        },
        required: ["date"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "find_instructor_schedule",
      description:
        "Finds all classes for an instructor across a date range. Uses fuzzy name matching. " +
        "Use for: 'María schedule this week', 'what does Juan teach in March', 'instructor history'.",
      parameters: {
        type: "object",
        properties: {
          instructor_name: { type: "string", description: "Instructor name (partial/fuzzy match accepted)" },
          start_date:      { type: "string", description: "Start date in YYYY-MM-DD format" },
          end_date:        { type: "string", description: "End date in YYYY-MM-DD format" },
        },
        required: ["instructor_name", "start_date", "end_date"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "check_instructor_availability",
      description:
        "Checks if an instructor has schedule conflicts during a time range on a date. " +
        "Use for: 'is María available from 9 to 10 on DATE', 'can Juan cover a class at 15:00'.",
      parameters: {
        type: "object",
        properties: {
          instructor_name: { type: "string", description: "Instructor name (partial/fuzzy match accepted)" },
          date:            { type: "string", description: "Date in YYYY-MM-DD format" },
          start_time:      { type: "string", description: "Start time in HH:MM 24h format" },
          end_time:        { type: "string", description: "End time in HH:MM 24h format" },
        },
        required: ["instructor_name", "date", "start_time", "end_time"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "find_available_instructors",
      description:
        "Returns instructors who are free (no schedule conflict) during a time range on a date. " +
        "Use for: 'who is available at 15:00 on DATE', 'who can cover an evaluation at 18:00'. " +
        "For '19:00 (20min)', parse end_time as 19:20. " +
        "Use instructor_list to restrict to a subset of evaluators.",
      parameters: {
        type: "object",
        properties: {
          date:            { type: "string", description: "Date in YYYY-MM-DD format" },
          start_time:      { type: "string", description: "Start time in HH:MM 24h format" },
          end_time:        { type: "string", description: "End time in HH:MM 24h format" },
          instructor_list: {
            type: "array",
            items: { type: "string" },
            description: "Optional subset of instructor names to check (partial match)",
          },
        },
        required: ["date", "start_time", "end_time"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_schedules_range",
      description:
        "Returns schedules for a multi-day date range with optional filters. " +
        "Use for: 'classes next week', 'KIDS program in March', 'HUB schedule for the next 5 days'. " +
        "Set count_only=true when only a total count is needed.",
      parameters: {
        type: "object",
        properties: {
          start_date:     { type: "string", description: "Start date in YYYY-MM-DD format" },
          end_date:       { type: "string", description: "End date in YYYY-MM-DD format" },
          program_filter: { type: "string", description: "Partial keyword match on program name (case-insensitive). Use short singular roots: 'evaluacion' not 'evaluaciones'" },
          branch_filter:  { type: "string", description: "Partial match on branch/sede" },
          count_only:     { type: "boolean", description: "Return only the total count" },
        },
        required: ["start_date", "end_date"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_schedule_stats",
      description:
        "Returns aggregate class counts for a date range, grouped by instructor, date, or branch. " +
        "Use for: 'how many classes did María teach in February', 'who taught the most in March', " +
        "'how many classes per day last week'.",
      parameters: {
        type: "object",
        properties: {
          start_date:      { type: "string", description: "Start date in YYYY-MM-DD format" },
          end_date:        { type: "string", description: "End date in YYYY-MM-DD format" },
          instructor_name: { type: "string", description: "Optional instructor name filter (partial/fuzzy)" },
          group_by:        {
            type: "string",
            enum: ["instructor", "date", "branch", "program"],
            description: "Group results by instructor (default), date, branch, or program",
          },
        },
        required: ["start_date", "end_date"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_instructor_profile",
      description:
        "Returns an instructor's full profile: nationality, languages, evaluator status, " +
        "evaluation types and languages they can evaluate in, and weekly availability windows. " +
        "Use for: 'is María an evaluator', 'what days can Juan teach', " +
        "'what languages does Ana evaluate', 'show Jorge\\'s availability schedule'.",
      parameters: {
        type: "object",
        properties: {
          instructor_name: {
            type: "string",
            description: "Instructor name (partial/fuzzy match accepted)",
          },
        },
        required: ["instructor_name"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_pool_rules",
      description:
        "Returns pool rules (allowed and blocked instructors per program and branch). " +
        "Use for: 'what are the pool rules for HUB', 'which instructors can teach Kids program', " +
        "'is there a restriction for program X', 'what programs have pool rules'. " +
        "Optionally filter by branch and/or program name (partial match).",
      parameters: {
        type: "object",
        properties: {
          branch: {
            type: "string",
            description: "Partial match on branch/sede (case-insensitive, e.g. 'HUB', 'CORPORATE')",
          },
          program: {
            type: "string",
            description: "Partial match on program name (case-insensitive, e.g. 'Kids', 'Evaluacion')",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_evaluators_list",
      description:
        "Returns all registered evaluators, optionally filtered by eval_type or language. " +
        "Use for: 'how many evaluators do we have', 'list all evaluators', " +
        "'which evaluators speak English', 'who can do corporate evaluations'. " +
        "Does NOT check availability — use find_evaluators for a specific date/time.",
      parameters: {
        type: "object",
        properties: {
          eval_type: {
            type: "string",
            description: "Optional filter: 'corporativo', 'consumer_adult', 'demo_adult', 'consumer_kids', 'demo_kids'",
          },
          language: {
            type: "string",
            description: "Optional language filter (e.g. 'English', 'Spanish')",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "find_instructors",
      description:
        "Returns instructors from the profiles database, optionally filtered by language, " +
        "native status, evaluator status, or evaluation type. Does NOT check schedule availability. " +
        "Use for: 'which instructors speak Portuguese', 'list all native instructors', " +
        "'who teaches in English', 'instructors that can evaluate corporativo'. " +
        "Do NOT use for availability checks — use find_evaluators for that.",
      parameters: {
        type: "object",
        properties: {
          language: {
            type: "string",
            description: "Filter by language the instructor speaks/evaluates in (e.g. 'English', 'Portuguese'). Case-insensitive.",
          },
          is_native: {
            type: "boolean",
            description: "true = only native speakers, false = only non-native, omit = all",
          },
          can_evaluate: {
            type: "boolean",
            description: "true = only evaluators, false = only non-evaluators, omit = all instructors",
          },
          eval_type: {
            type: "string",
            description: "Filter by evaluation type: 'corporativo', 'consumer_adult', 'demo_adult', 'consumer_kids', 'demo_kids'",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "find_evaluators",
      description:
        "Finds qualified evaluators with no schedule conflict for a specific date and time window. " +
        "An evaluator must: (1) be flagged as evaluator, (2) have a weekly availability window " +
        "covering the full slot on that day of week, (3) have no conflicting class on that date. " +
        "Use for: 'who can evaluate at 15:00 on DATE', 'find evaluators for kids at 9am', " +
        "'available corporate evaluators on Friday'. " +
        "Always infer end_time — for '19:00 (20min)' use end_time='19:20'. " +
        "Set eval_type only when the user specifies: 'adultos', 'kids', or 'corporativo'. " +
        "Set language when the user specifies a language (e.g. 'English', 'Spanish').",
      parameters: {
        type: "object",
        properties: {
          date:       { type: "string", description: "Date in YYYY-MM-DD format" },
          start_time: { type: "string", description: "Start time HH:MM (24h)" },
          end_time:   { type: "string", description: "End time HH:MM (24h)" },
          eval_type:  {
            type: "string",
            description: "Optional filter: 'corporativo', 'consumer_adult', 'demo_adult', 'consumer_kids', 'demo_kids'",
          },
          language: {
            type: "string",
            description: "Optional language filter (e.g. 'English', 'Spanish'). Use when user specifies a language.",
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
  return dbGetSchedules({
    date:      input.date,
    program:   input.program_filter,
    branch:    input.branch_filter,
    time:      input.time_filter,
    countOnly: input.count_only,
  });
}

async function handleFindInstructorSchedule(input: FindInstructorScheduleInput) {
  return dbFindInstructor(input.instructor_name, input.start_date, input.end_date);
}

async function handleCheckInstructorAvailability(input: CheckInstructorAvailabilityInput) {
  return dbCheckInstructorAvailability({
    name:      input.instructor_name,
    date:      input.date,
    startTime: input.start_time,
    endTime:   input.end_time,
  });
}

async function handleFindAvailableInstructors(input: FindAvailableInstructorsInput) {
  return dbFindAvailableInstructors({
    date:           input.date,
    startTime:      input.start_time,
    endTime:        input.end_time,
    instructorList: input.instructor_list,
  });
}

async function handleGetSchedulesRange(input: GetSchedulesRangeInput) {
  return dbGetSchedulesRange({
    startDate: input.start_date,
    endDate:   input.end_date,
    program:   input.program_filter,
    branch:    input.branch_filter,
    countOnly: input.count_only,
  });
}

async function handleGetScheduleStats(input: GetScheduleStatsInput) {
  return dbGetStats({
    startDate:  input.start_date,
    endDate:    input.end_date,
    nameFilter: input.instructor_name,
    groupBy:    input.group_by,
  });
}

async function handleGetInstructorProfile(input: GetInstructorProfileInput) {
  return dbGetInstructorProfile({ name: input.instructor_name, threshold: input.threshold });
}

async function handleGetPoolRules(input: GetPoolRulesInput) {
  return dbGetPoolRules({ branch: input.branch, program: input.program });
}

async function handleGetEvaluatorsList(input: GetEvaluatorsListInput) {
  return dbGetEvaluatorsList({
    evalType: input.eval_type,
    language: input.language,
  });
}

async function handleFindInstructors(input: FindInstructorsInput) {
  return dbFindInstructors({
    language:    input.language,
    isNative:    input.is_native,
    canEvaluate: input.can_evaluate,
    evalType:    input.eval_type,
  });
}

async function handleFindEvaluators(input: FindEvaluatorsInput) {
  return dbFindEvaluators({
    date:      input.date,
    startTime: input.start_time,
    endTime:   input.end_time,
    evalType:  input.eval_type,
    language:  input.language,
  });
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
    case "find_instructor_schedule":
      return handleFindInstructorSchedule(toolInput as unknown as FindInstructorScheduleInput);
    case "check_instructor_availability":
      return handleCheckInstructorAvailability(toolInput as unknown as CheckInstructorAvailabilityInput);
    case "find_available_instructors":
      return handleFindAvailableInstructors(toolInput as unknown as FindAvailableInstructorsInput);
    case "get_schedules_range":
      return handleGetSchedulesRange(toolInput as unknown as GetSchedulesRangeInput);
    case "get_schedule_stats":
      return handleGetScheduleStats(toolInput as unknown as GetScheduleStatsInput);
    case "get_instructor_profile":
      return handleGetInstructorProfile(toolInput as unknown as GetInstructorProfileInput);
    case "get_pool_rules":
      return handleGetPoolRules(toolInput as unknown as GetPoolRulesInput);
    case "get_evaluators_list":
      return handleGetEvaluatorsList(toolInput as unknown as GetEvaluatorsListInput);
    case "find_instructors":
      return handleFindInstructors(toolInput as unknown as FindInstructorsInput);
    case "find_evaluators":
      return handleFindEvaluators(toolInput as unknown as FindEvaluatorsInput);
    default:
      return { error: `Herramienta desconocida: ${toolName}` };
  }
}

// Labels legibles para la UI (ChatWidget onToolCall callback)
export const TOOL_LABELS: Record<string, string> = {
  get_schedules_for_date:          "Consultando horarios...",
  find_instructor_schedule:        "Buscando horario del instructor...",
  check_instructor_availability:   "Verificando disponibilidad...",
  find_available_instructors:      "Buscando instructores disponibles...",
  get_schedules_range:             "Consultando base de datos...",
  get_schedule_stats:              "Calculando estadísticas...",
  get_instructor_profile:          "Consultando perfil del instructor...",
  get_pool_rules:                  "Consultando reglas de pool...",
  get_evaluators_list:             "Consultando evaluadores...",
  find_instructors:                "Buscando instructores...",
  find_evaluators:                 "Buscando evaluadores disponibles...",
};
