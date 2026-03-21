import { invoke } from "@tauri-apps/api/core";
import type { OAIMessage, OAIResponse, AIProvider } from "../types";
import { SCHEDULE_TOOLS, executeToolCall, TOOL_LABELS } from "../tools/schedule-tools";

const MAX_HISTORY_MESSAGES = 8;
const MAX_TOOL_ITERATIONS  = 5;

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

FUERA DE CONTEXTO:
- Si el usuario pregunta algo ajeno a horarios, instructores o programas, redirige amablemente:
  "Eso está fuera de lo que manejo. Puedo ayudarte con horarios, instructores, conflictos o estadísticas."
`;

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
    const finishReason = (data.message?.tool_calls?.length
      ? "tool_calls"
      : "stop") as "stop" | "tool_calls";
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
  signal?: AbortSignal
): Promise<ChatResult> {
  const today = new Date().toISOString().split("T")[0];
  const trimmedHistory = conversationHistory.slice(-MAX_HISTORY_MESSAGES);

  const messages: OAIMessage[] = [
    {
      role: "system",
      content: SYSTEM_PROMPT.replace(/\{CURRENT_DATE\}/g, today),
    },
    ...trimmedHistory,
    { role: "user", content: userMessage },
  ];

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await callChatCompletions(provider, messages, true, signal);
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

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      });
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
  signal?: AbortSignal
): Promise<ChatResult> {
  if (!provider.baseUrl) {
    throw new Error("Proveedor no configurado. Abre ⚙ y configura la URL y API key.");
  }

  let lastError: Error | null = null;

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
