import { invoke } from "@tauri-apps/api/core";
import type { OAIMessage, OAIResponse, AIProvider } from "../types";
import { SCHEDULE_TOOLS } from "../tools/schedule-tools";
import { useScheduleDataStore } from "@/features/schedules/stores/useScheduleDataStore";
import { useScheduleUIStore } from "@/features/schedules/stores/useScheduleUIStore";
import { executeIntent, serializeResult, type ParsedIntent } from "../engine/local-queries";

const MAX_HISTORY_MESSAGES = 8;

const SYSTEM_PROMPT_CONTEXT_LOCAL = `Eres Minerva Assistant, un asistente especializado en gestión de horarios educativos.
Solo tienes datos del horario de la fecha activa ({ACTIVE_DATE}).

Reglas:
- Responde siempre en español.
- Para fechas relativas ("lunes", "mañana", "hoy"), usa la fecha actual: {CURRENT_DATE}.
- Usa únicamente los datos del contexto. Si preguntan por otra fecha, indícalo.
- Para disponibilidad: busca si el instructor tiene start_time/end_time que solape con el horario consultado.
- Sé conciso. Usa listas para múltiples resultados.

Datos de horarios ({ACTIVE_DATE}):
{SCHEDULE_DATA}`;

type ExtendedError = Error & { rawBody?: string; isAuthError?: boolean; isRetryable?: boolean };

// ---------------------------------------------------------------------------
// Llamada HTTP a un proveedor concreto
// ---------------------------------------------------------------------------
function estimateTokens(messages: OAIMessage[], extra = ""): number {
  const chars = messages.reduce(
    (acc, m) => acc + (typeof m.content === "string" ? m.content.length : 0), 0
  ) + extra.length;
  return Math.ceil(chars / 4);
}

async function callChatCompletions(
  provider: AIProvider,
  messages: OAIMessage[],
  withTools: boolean,
  signal?: AbortSignal
): Promise<OAIResponse> {
  const baseUrl = provider.baseUrl.replace(/\/$/, "");

  if (!baseUrl) {
    throw new Error("URL del proveedor no configurada.");
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (provider.apiKey) headers["Authorization"] = `Bearer ${provider.apiKey}`;

  // Ollama nativo (/api): usa /api/chat con formato propio
  if (baseUrl.endsWith("/api")) {
    const body: Record<string, unknown> = {
      model: provider.model || "llama3.2",
      messages,
      stream: false,
    };
    if (withTools) {
      body.tools = SCHEDULE_TOOLS;
    }

    let httpStatus: number;
    let responseText: string;

    // ollama.com requires Tauri http_request to bypass CORS
    if (baseUrl.includes("ollama.com")) {
      const result = await invoke<[number, string]>("http_request", {
        method: "POST",
        url: `${baseUrl}/chat`,
        bearer: provider.apiKey || null,
        body: JSON.stringify(body),
      });
      [httpStatus, responseText] = result;
    } else {
      const res = await fetch(`${baseUrl}/chat`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal,
      });
      httpStatus = res.status;
      responseText = await res.text();
    }

    if (httpStatus < 200 || httpStatus >= 300) {
      const err: ExtendedError = new Error(`Error de API (${httpStatus}): ${responseText}`);
      err.rawBody = responseText;
      err.isAuthError = httpStatus === 401 || httpStatus === 403;
      err.isRetryable = err.isAuthError || httpStatus === 429;
      throw err;
    }

    // Adaptar respuesta nativa Ollama → formato OAI
    const data = JSON.parse(responseText) as {
      message?: OAIMessage & { tool_calls?: OAIResponse["choices"][0]["message"]["tool_calls"] };
      done_reason?: string;
    };
    const finishReason = (data.message?.tool_calls?.length ? "tool_calls" : (data.done_reason === "stop" ? "stop" : "stop")) as "stop" | "tool_calls";
    return {
      id: "ollama",
      choices: [{
        message: data.message ?? { role: "assistant", content: "" },
        finish_reason: finishReason,
      }],
    };
  }

  // OpenAI-compat (/v1 o similar)
  const body: Record<string, unknown> = {
    model: provider.model || "gpt-4o-mini",
    messages,
  };
  if (withTools) {
    body.tools = SCHEDULE_TOOLS;
    body.tool_choice = "auto";
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const errorBody = await res.text();
    const err: ExtendedError = new Error(`Error de API (${res.status}): ${errorBody}`);
    err.rawBody = errorBody;
    err.isAuthError = res.status === 401 || res.status === 403;
    err.isRetryable = err.isAuthError || res.status === 429;
    throw err;
  }

  return res.json() as Promise<OAIResponse>;
}

// ---------------------------------------------------------------------------
// Chat result type
// ---------------------------------------------------------------------------
type ChatResult = { response: string; updatedHistory: OAIMessage[]; estimatedTokens: number; sentMessages: OAIMessage[] };

// ---------------------------------------------------------------------------
// Local context fallback
// ---------------------------------------------------------------------------
function buildLocalContextPrompt(today: string, activeDate: string | null, schedules: { date: string; instructor: string; program: string | null; start_time: string; end_time: string | null }[]): string {
  const scheduleData = schedules.length > 0
    ? JSON.stringify(
        schedules.reduce<Record<string, unknown[]>>((acc, s) => {
          if (!acc[s.date]) acc[s.date] = [];
          acc[s.date].push({ instructor: s.instructor, program: s.program, start_time: s.start_time, end_time: s.end_time });
          return acc;
        }, {}),
        null, 2
      )
    : "No hay horarios cargados.";

  return SYSTEM_PROMPT_CONTEXT_LOCAL
    .replace("{CURRENT_DATE}", today)
    .replace(/\{ACTIVE_DATE\}/g, activeDate ?? today)
    .replace("{SCHEDULE_DATA}", scheduleData);
}

async function runWithLocalContext(
  provider: AIProvider,
  userMessage: string,
  conversationHistory: OAIMessage[],
  today: string,
  activeDate: string | null,
  baseSchedules: { date: string; instructor: string; program: string | null; start_time: string; end_time: string | null }[],
  signal?: AbortSignal
): Promise<ChatResult> {
  const trimmedHistory = conversationHistory.slice(-MAX_HISTORY_MESSAGES);
  const messages: OAIMessage[] = [
    { role: "system", content: buildLocalContextPrompt(today, activeDate, baseSchedules) },
    ...trimmedHistory,
    { role: "user", content: userMessage },
  ];
  const response = await callChatCompletions(provider, messages, false, signal);
  const choice = response.choices[0];
  if (!choice) throw new Error("Respuesta vacía del modelo.");
  const text = choice.message.content?.trim() ?? "";
  return {
    response: text || "No tengo respuesta para esa consulta.",
    updatedHistory: [...trimmedHistory, { role: "user", content: userMessage }, choice.message],
    estimatedTokens: estimateTokens(messages, text),
    sentMessages: messages,
  };
}

// ---------------------------------------------------------------------------
// LLM formatter prompt
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// LLM intent parser
// ---------------------------------------------------------------------------
const INTENT_PARSER_PROMPT = `Eres un parser de intents para un sistema de horarios educativos.
El horario cargado es del día {ACTIVE_DATE}. Nunca preguntes por la fecha — ya la sabes.

Responde ÚNICAMENTE con un objeto JSON válido (sin markdown, sin texto adicional).

Intents disponibles:
{"type":"instructor_schedule","instructor":"<nombre parcial>"}
{"type":"instructor_free_slots","instructor":"<nombre parcial>"}
{"type":"classes_at_time","time":"HH:MM"}           ← clases que INICIAN exactamente a esa hora
{"type":"classes_in_range","start":"HH:MM","end":"HH:MM"}  ← clases que inician entre esos horarios
{"type":"count","branch":"<sede opcional>","program":"<prog opcional>"}
{"type":"available_instructors","start":"HH:MM","end":"HH:MM","instructor_list":["<nombre>"] opcional}
{"type":"instructor_availability","instructor":"<nombre>","start":"HH:MM","end":"HH:MM"}
{"type":"who_has_class","query":"<nombre de alumno o código de grupo>"}
{"type":"filtered_schedules","branch":"<sede?>","program":"<programa?>","shift":"<turno?>"}
{"type":"all_instructors"}
{"type":"extreme_instructors","mode":"min" o "max"}
{"type":"unknown"}

Reglas:
- "clases a las 16", "clases de las 16" → classes_at_time (inicio exacto)
- "clases entre 15 y 16", "de 15 a 16" → classes_in_range
- Horas con duración: "19:00 (20min)" → start:"19:00", end:"19:20"
- "hoy", "mañana" o sin fecha → ya sabes que es {ACTIVE_DATE}
- Follow-ups como "sí", "cuáles son", "y en HUB" → interpreta respecto al contexto anterior
- Tiempos en 12h: "2pm"→"14:00", "9am"→"09:00"
- "clases de X", "horario de X", "X tiene clases?" donde X es el propio instructor → instructor_schedule
- "quién tiene la clase de X", "quién atiende a X", "de quién es la clase de X" donde X es un alumno → who_has_class
- "evaluaciones", "sesiones" son sinónimos de "clases" para fines de búsqueda
- "cuántas clases/sesiones..." → count (incluye filtros de sede/programa si los menciona)
- "clases del programa X", "sesiones en SEDE", "turno mañana/tarde" sin preguntar cuántas → filtered_schedules
- Si no hay match claro → {"type":"unknown"}`;

function extractIntentJSON(text: string): ParsedIntent | null {
  const attempts = [
    () => JSON.parse(text.trim()) as ParsedIntent,
    () => {
      const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      return m ? JSON.parse(m[1].trim()) as ParsedIntent : null;
    },
    () => {
      const m = text.match(/\{[\s\S]*\}/);
      return m ? JSON.parse(m[0]) as ParsedIntent : null;
    },
  ];
  for (const attempt of attempts) {
    try {
      const result = attempt();
      if (result && typeof result === "object" && "type" in result) return result;
    } catch { /* try next */ }
  }
  return null;
}

async function parseIntent(
  provider: AIProvider,
  userMessage: string,
  activeDate: string,
  lastUserMessage: string,
  signal?: AbortSignal
): Promise<ParsedIntent> {
  const system = INTENT_PARSER_PROMPT.replace(/\{ACTIVE_DATE\}/g, activeDate);
  const contextMsg = lastUserMessage
    ? `Contexto — último mensaje del usuario: "${lastUserMessage}"\nMensaje actual: "${userMessage}"`
    : userMessage;
  const messages: OAIMessage[] = [
    { role: "system", content: system },
    { role: "user", content: contextMsg },
  ];
  try {
    const response = await callChatCompletions(provider, messages, false, signal);
    const text = response.choices[0]?.message?.content?.trim() ?? "";
    return extractIntentJSON(text) ?? { type: "unknown" };
  } catch {
    return { type: "unknown" };
  }
}

// ---------------------------------------------------------------------------
// Core provider logic
// ---------------------------------------------------------------------------
async function tryProvider(
  provider: AIProvider,
  userMessage: string,
  conversationHistory: OAIMessage[],
  _onToolCall?: (toolLabel: string) => void,
  signal?: AbortSignal
): Promise<ChatResult> {
  const today = new Date().toISOString().split("T")[0];
  const trimmedHistory = conversationHistory.slice(-MAX_HISTORY_MESSAGES);
  const activeDate = useScheduleUIStore.getState().activeDate;
  const baseSchedules = useScheduleDataStore.getState().baseSchedules;

  if (!activeDate) {
    const msg = "No hay una fecha activa seleccionada. Selecciona una fecha en la vista principal.";
    return { response: msg, updatedHistory: trimmedHistory, estimatedTokens: 0, sentMessages: [] };
  }
  if (baseSchedules.length === 0) {
    const msg = `No hay horarios cargados para ${activeDate}. Carga un archivo de horario primero.`;
    return { response: msg, updatedHistory: trimmedHistory, estimatedTokens: 0, sentMessages: [] };
  }

  // Step 1: Extract intent via LLM
  const lastUserMsg = [...trimmedHistory].reverse().find((m) => m.role === "user");
  const lastUserText = typeof lastUserMsg?.content === "string" ? lastUserMsg.content : "";
  const intent = await parseIntent(provider, userMessage, activeDate, lastUserText, signal);

  // Step 2: Execute locally and return directly — no second LLM call
  if (intent.type !== "unknown") {
    const localResult = executeIntent(intent, baseSchedules);
    if (localResult.kind !== "none") {
      const response = serializeResult(localResult, activeDate);
      return {
        response,
        updatedHistory: [...trimmedHistory, { role: "user", content: userMessage }, { role: "assistant", content: response }],
        estimatedTokens: estimateTokens([{ role: "user", content: userMessage }], response),
        sentMessages: [],
      };
    }
  }

  // Fallback: unknown intent — single call with full schedule context injected
  return runWithLocalContext(provider, userMessage, trimmedHistory, today, activeDate, baseSchedules, signal);
}

// ---------------------------------------------------------------------------
// Punto de entrada público
// ---------------------------------------------------------------------------
export async function sendChatMessage(
  userMessage: string,
  conversationHistory: OAIMessage[],
  provider: AIProvider,
  onToolCall?: (toolLabel: string) => void,
  signal?: AbortSignal
): Promise<ChatResult> {
  if (!provider.baseUrl) {
    throw new Error("Proveedor no configurado. Abre ⚙ y configura la URL y API key.");
  }

  let lastError: Error | null = null;

  // Intentar con proveedor principal; para extensibilidad futura se mantiene el loop
  for (const p of [provider]) {
    try {
      return await tryProvider(p, userMessage, conversationHistory, onToolCall, signal);
    } catch (err) {
      const e = err as ExtendedError;
      if (e.isRetryable) {
        lastError = e;
        continue;
      }
      throw err;
    }
  }

  throw lastError ?? new Error("Todos los proveedores fallaron.");
}
