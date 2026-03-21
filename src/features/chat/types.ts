export type ChatRole = "user" | "assistant" | "tool_status";

export interface AIProvider {
  id: string;
  baseUrl: string;
  model: string;
  apiKey: string;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: number;
  isLoading?: boolean;
  isError?: boolean;
  retryText?: string; // query original para reintentar en caso de error
}

// ---------------------------------------------------------------------------
// OpenAI Chat Completions API shapes (compatible con Gemini, Groq, Ollama, etc.)
// ---------------------------------------------------------------------------

export interface OAIToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface OAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: OAIToolCall[];
  tool_call_id?: string; // solo para role "tool"
  name?: string;
}

export interface OAIChoice {
  message: OAIMessage;
  finish_reason: "stop" | "tool_calls" | "length" | "content_filter" | null;
}

export interface OAIResponse {
  id: string;
  choices: OAIChoice[];
}

// ---------------------------------------------------------------------------
// Inputs de herramientas — formato OpenAI function calling
// ---------------------------------------------------------------------------

export interface GetSchedulesForDateInput {
  date: string;
  time_filter?: string;
  program_filter?: string;
  branch_filter?: string;
  count_only?: boolean;
}

export interface FindInstructorScheduleInput {
  instructor_name: string;
  start_date: string;
  end_date: string;
}

export interface CheckInstructorAvailabilityInput {
  instructor_name: string;
  date: string;
  start_time: string;
  end_time: string;
}

export interface FindAvailableInstructorsInput {
  date: string;
  start_time: string;
  end_time: string;
  instructor_list?: string[];
}

export interface GetSchedulesRangeInput {
  start_date: string;
  end_date: string;
  program_filter?: string;
  branch_filter?: string;
  count_only?: boolean;
}

export interface GetScheduleStatsInput {
  start_date: string;
  end_date: string;
  instructor_name?: string;
  group_by?: "instructor" | "date" | "branch";
}
