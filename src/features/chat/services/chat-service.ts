import { invoke } from "@tauri-apps/api/core";
import { fetch } from "@tauri-apps/plugin-http";
import type { OAIMessage, OAIResponse, AIProvider } from "../types";
import { SCHEDULE_TOOLS, executeToolCall, TOOL_LABELS } from "../tools/schedule-tools";

const MAX_HISTORY_MESSAGES = 8;
const MAX_TOOL_ITERATIONS = 5;

const SYSTEM_PROMPT = `Eres Mina, asistente virtual dentro de Minerva.
Fecha actual: {CURRENT_DATE}.

PERSONALIDAD:
- Tono profesional y directo. Sin rodeos, sin relleno.
- Responde siempre en español, sin importar el idioma del usuario.
- Si el usuario saluda por primera vez, responde: "Hola, soy Mina. ¿En qué puedo ayudarte hoy?"
- Adapta la longitud al contexto: breve para consultas simples, detallada para análisis o conflictos.

CAPACIDADES:
- Consultar horarios por fecha, sede, instructor o programa.
- Detectar solapamientos o conflictos en los horarios.
- Sugerir instructores disponibles para cubrir una clase.
- Resumir estadísticas de carga horaria por instructor, sede o período.
- Informar sobre reglas de pools (qué instructores pueden dar ciertas clases).

INSTRUCCIONES TÉCNICAS:
- Usa las tools para consultar datos reales. Nunca inventes ni asumas datos.
- Si una tool retorna vacío: indícalo claramente y sugiere una alternativa (fecha cercana, otro instructor, reformular).
- Si una tool retorna error: indícalo claramente y no intentes continuar con esa consulta.
- Para fechas relativas ("ayer", "la semana pasada", "el lunes"), calcula desde {CURRENT_DATE}.
- "Febrero" sin año = año de {CURRENT_DATE}.
- Indica siempre la fecha o rango consultado en tu respuesta.
- Usa listas para múltiples resultados.

DATOS FALTANTES:
- Si el usuario pide disponibilidad o evaluadores pero no indica la fecha, PREGUNTA la fecha
  antes de llamar cualquier tool. No intentes inferirla ni uses una fecha por defecto.
- Si el usuario da múltiples franjas horarias sin fecha, pide la fecha una sola vez.

INSTRUCTORES vs EVALUADORES:
- "Evaluadores" = instructores con can_evaluate=true. "Instructores" = todos los perfiles, incluidos no evaluadores.
- Cuando el usuario pregunte por "instructores de [idioma]" o "quién enseña [idioma]", SIEMPRE llama
  chat_find_instructors con p_language=[idioma]. Aunque ya hayas buscado evaluadores del mismo idioma,
  los resultados de evaluadores NO responden la pregunta de instructores — son subconjuntos distintos.
- Nunca deduzcas que no hay instructores de un idioma basándote en resultados de evaluadores.

ALUMNOS vs INSTRUCTORES:
- "¿Quién tiene programado a X?", "¿Quién da clases a X?", "¿Quién tiene a X?" → X es un ALUMNO.
  Busca usando program_filter con el nombre de X en get_schedules_for_date o get_schedules_range.
  NO busques X como instructor_name.

MATCHES APROXIMADOS EN PERFILES:
- Si get_instructor_profile retorna un nombre distinto al consultado, NO afirmes que la persona
  "está registrada como" o "es conocida como" el nombre buscado — esa relación no existe en la DB.
- En su lugar responde: "No encontré exactamente '[nombre buscado]'. El resultado más cercano es
  '[nombre retornado]'. ¿Es este el que buscas?"

EVAL_TYPE POR CONSULTA:
- Nunca uses el eval_type de una consulta anterior. Cada pregunta se interpreta de forma independiente.
- Si el usuario no menciona un tipo de evaluación, omite el filtro eval_type en la tool call.

DISPONIBILIDAD VACÍA:
- Si find_evaluators retorna vacío para un horario específico, llama find_evaluator_slots con start_date=hoy
  para sugerir cuándo sí hay evaluadores disponibles. No respondas solo "no hay evaluadores" sin antes
  ofrecer alternativas concretas.

FUERA DE CONTEXTO:
- Si el usuario pregunta algo ajeno a horarios, instructores o programas, redirige amablemente:
  "Eso está fuera de lo que manejo. Puedo ayudarte con horarios, instructores, conflictos o estadísticas."
`;

type ExtendedError = Error & { rawBody?: string; isAuthError?: boolean; isRetryable?: boolean };

// ---------------------------------------------------------------------------
// Token estimator
// ---------------------------------------------------------------------------
function estimateTokens(messages: OAIMessage[], extra = ""): number {
  const chars = messages.reduce(
    (acc, m) => acc + (typeof m.content === "string" ? m.content.length : 0), 0
  ) + extra.length;
  return Math.ceil(chars / 4);
}

// ---------------------------------------------------------------------------
// Non-streaming call (used for tool-call iterations)
// ---------------------------------------------------------------------------
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
    if (withTools) body.tools = SCHEDULE_TOOLS;

    let httpStatus: number;
    let responseText: string;

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
        method: "POST", headers, body: JSON.stringify(body), signal,
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

    const data = JSON.parse(responseText) as {
      message?: OAIMessage & { tool_calls?: OAIResponse["choices"][0]["message"]["tool_calls"] };
    };
    const finishReason = (data.message?.tool_calls?.length ? "tool_calls" : "stop") as "stop" | "tool_calls";
    return {
      id: "ollama",
      choices: [{ message: data.message ?? { role: "assistant", content: "" }, finish_reason: finishReason }],
    };
  }

  // OpenAI-compat
  const body: Record<string, unknown> = { model: provider.model || "gpt-4o-mini", messages };
  if (withTools) { body.tools = SCHEDULE_TOOLS; body.tool_choice = "auto"; }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST", headers, body: JSON.stringify(body), signal,
  });

  if (!res.ok) {
    const errorBody = await res.text();
    const err: ExtendedError = new Error(`Error de API (${res.status}): ${errorBody}`);
    err.rawBody = errorBody;
    err.isAuthError = res.status === 401 || res.status === 403;
    err.isRetryable = err.isAuthError || res.status === 429;
    throw err;
  }

  return res.json() as unknown as OAIResponse;
}

// ---------------------------------------------------------------------------
// Streaming call (OpenAI-compat SSE) — used for the final text response
// ---------------------------------------------------------------------------
async function callChatCompletionsStream(
  provider: AIProvider,
  messages: OAIMessage[],
  withTools: boolean,
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<OAIResponse> {
  const baseUrl = provider.baseUrl.replace(/\/$/, "");

  // Ollama: no streaming support here, fall back to non-streaming
  if (baseUrl.endsWith("/api")) {
    const res = await callChatCompletions(provider, messages, withTools, signal);
    const content = res.choices[0]?.message?.content ?? "";
    if (content) onChunk(content);
    return res;
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (provider.apiKey) headers["Authorization"] = `Bearer ${provider.apiKey}`;

  const body: Record<string, unknown> = {
    model: provider.model || "gpt-4o-mini",
    messages,
    stream: true,
  };
  if (withTools) { body.tools = SCHEDULE_TOOLS; body.tool_choice = "auto"; }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST", headers, body: JSON.stringify(body), signal,
  });

  if (!res.ok) {
    const errorBody = await res.text();
    const err: ExtendedError = new Error(`Error de API (${res.status}): ${errorBody}`);
    err.rawBody = errorBody;
    err.isAuthError = res.status === 401 || res.status === 403;
    err.isRetryable = err.isAuthError || res.status === 429;
    throw err;
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No se pudo leer el stream de respuesta.");

  const decoder = new TextDecoder();
  let buffer = "";
  let accText = "";
  let finishReason: "stop" | "tool_calls" = "stop";
  const toolCallsMap: Record<number, { id: string; name: string; arguments: string }> = {};

  try {
    outer: while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") break outer;

        try {
          const parsed = JSON.parse(data) as {
            choices?: Array<{
              delta?: {
                content?: string;
                tool_calls?: Array<{
                  index: number;
                  id?: string;
                  function?: { name?: string; arguments?: string };
                }>;
              };
              finish_reason?: string | null;
            }>;
          };

          const choice = parsed.choices?.[0];
          if (!choice) continue;
          if (choice.finish_reason) finishReason = choice.finish_reason as "stop" | "tool_calls";

          const delta = choice.delta;
          if (!delta) continue;

          if (delta.content) {
            accText += delta.content;
            onChunk(delta.content);
          }

          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              if (!toolCallsMap[tc.index]) toolCallsMap[tc.index] = { id: "", name: "", arguments: "" };
              if (tc.id) toolCallsMap[tc.index].id = tc.id;
              if (tc.function?.name) toolCallsMap[tc.index].name += tc.function.name;
              if (tc.function?.arguments) toolCallsMap[tc.index].arguments += tc.function.arguments;
            }
          }
        } catch { /* ignore malformed chunks */ }
      }
    }
  } finally {
    reader.releaseLock();
  }

  const toolCalls = Object.values(toolCallsMap)
    .filter((tc) => tc.name)
    .map((tc) => ({
      id: tc.id || crypto.randomUUID(),
      type: "function" as const,
      function: { name: tc.name, arguments: tc.arguments },
    }));

  const message: OAIMessage = {
    role: "assistant",
    content: accText || null,
    ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
  };

  return {
    id: "stream",
    choices: [{
      message,
      finish_reason: toolCalls.length > 0 ? "tool_calls" : finishReason,
    }],
  };
}

// ---------------------------------------------------------------------------
// Chat result type
// ---------------------------------------------------------------------------
type ChatResult = {
  response: string;
  updatedHistory: OAIMessage[];
  estimatedTokens: number;
  sentMessages: OAIMessage[];
};

// ---------------------------------------------------------------------------
// Core provider logic — tool call loop
// ---------------------------------------------------------------------------
async function tryProvider(
  provider: AIProvider,
  userMessage: string,
  conversationHistory: OAIMessage[],
  onToolCall?: (toolLabel: string) => void,
  signal?: AbortSignal,
  onChunk?: (text: string) => void
): Promise<ChatResult> {
  const today = new Date().toISOString().split("T")[0];
  const trimmedHistory = conversationHistory.slice(-MAX_HISTORY_MESSAGES);

  const messages: OAIMessage[] = [
    { role: "system", content: SYSTEM_PROMPT.replace(/\{CURRENT_DATE\}/g, today) },
    ...trimmedHistory,
    { role: "user", content: userMessage },
  ];

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    // Always stream when streaming is requested — tool-call rounds emit no text, final round emits text
    const response = onChunk
      ? await callChatCompletionsStream(provider, messages, true, onChunk, signal)
      : await callChatCompletions(provider, messages, true, signal);

    const choice = response.choices[0];
    if (!choice) throw new Error("Respuesta vacía del modelo.");

    // No tool calls — final response
    if (choice.finish_reason !== "tool_calls" || !choice.message.tool_calls?.length) {
      const text = choice.message.content?.trim() ?? "";
      return {
        response: text || "No tengo respuesta para esa consulta.",
        updatedHistory: [
          ...trimmedHistory,
          { role: "user", content: userMessage },
          choice.message,
        ],
        estimatedTokens: estimateTokens(messages, text),
        sentMessages: messages,
      };
    }

    // Execute tool calls
    messages.push(choice.message);
    for (const toolCall of choice.message.tool_calls) {
      const label = TOOL_LABELS[toolCall.function.name] ?? "Consultando...";
      onToolCall?.(label);

      let result: unknown;
      try {
        const input = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
        result = await executeToolCall(toolCall.function.name, input);
      } catch (err) {
        result = { error: err instanceof Error ? err.message : "Error ejecutando la herramienta" };
      }
      messages.push({ role: "tool", tool_call_id: toolCall.id, content: JSON.stringify(result) });
    }
  }

  return {
    response: "No pude completar la consulta después de varios intentos.",
    updatedHistory: trimmedHistory,
    estimatedTokens: 0,
    sentMessages: messages,
  };
}

// ---------------------------------------------------------------------------
// Punto de entrada público
// ---------------------------------------------------------------------------
export async function sendChatMessage(
  userMessage: string,
  conversationHistory: OAIMessage[],
  provider: AIProvider,
  onToolCall?: (toolLabel: string) => void,
  signal?: AbortSignal,
  onChunk?: (text: string) => void
): Promise<ChatResult> {
  if (!provider.baseUrl) {
    throw new Error("Proveedor no configurado. Abre ⚙ y configura la URL y API key.");
  }

  return tryProvider(provider, userMessage, conversationHistory, onToolCall, signal, onChunk);
}
