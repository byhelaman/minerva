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
// Inputs de herramientas (independientes del proveedor)
// ---------------------------------------------------------------------------

export interface GetSchedulesForDateInput {
  date: string;
  time_filter?: string;    // HH:MM — devuelve solo clases activas en ese momento
  program_filter?: string; // texto libre — filtra por nombre de programa (parcial)
  branch_filter?: string;  // texto libre — filtra por sede (parcial)
  count_only?: boolean;    // si true, devuelve solo el total sin detalle
}

export interface CheckInstructorAvailabilityInput {
  instructor_name: string;
  date: string;
  start_time: string;
  end_time: string;
}

export interface FindInstructorScheduleInput {
  instructor_name: string;
  date: string;
  end_date?: string;
}

export interface FindAvailableInstructorsInput {
  date: string;
  start_time: string;
  end_time: string;
  instructor_list?: string[]; // Si se especifica, filtra la disponibilidad a solo estos instructores
}
