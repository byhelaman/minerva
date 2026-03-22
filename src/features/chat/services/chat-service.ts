import { invoke } from "@tauri-apps/api/core";
import { fetch } from "@tauri-apps/plugin-http";
import type { OAIMessage, OAIResponse, OAIUsage, AIProvider } from "../types";
import { SCHEDULE_TOOLS, executeToolCall, TOOL_LABELS } from "../tools/schedule-tools";

const MAX_TOOL_ITERATIONS = 5;
const TOKEN_HISTORY_BUDGET = 6000; // chars/4 estimate; leaves room for system + tools + new message

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
- Nunca pidas permiso para llamar una tool. Si tienes los parámetros necesarios, ejecútala directamente.
- Si una tool retorna vacío: indícalo claramente y sugiere una alternativa (fecha cercana, otro instructor, reformular).
- Si una tool retorna error: indícalo claramente y no intentes continuar con esa consulta.
- Indica siempre la fecha o rango consultado en tu respuesta.
- Usa listas para múltiples resultados.

DATOS FALTANTES:
- Si falta un parámetro crítico, haz UNA sola pregunta con todos los datos faltantes a la vez.
  Nunca hagas múltiples rondas de aclaración para la misma consulta.
- Si el usuario pide disponibilidad o evaluadores pero no indica la fecha, PREGUNTA solo la fecha
  (no más datos) antes de llamar cualquier tool.

FECHAS RELATIVAS:
- Para fechas relativas ("ayer", "la semana pasada", "el lunes"), calcula desde {CURRENT_DATE}.
- "Febrero" sin año = año de {CURRENT_DATE}.
- "El lunes", "el martes", etc. SIN fecha explícita → resuelve al día de la semana ya mencionado
  en la conversación activa, NO al próximo. Solo calcula desde {CURRENT_DATE} si no hay fecha previa.

DESAMBIGUACIÓN HORARIA:
- "12am" es ambiguo (puede ser 00:00 o confusión con mediodía). Si el contexto es laboral,
  pregunta: "¿12:00 (mediodía) o 00:00 (medianoche)?" antes de ejecutar.
- "12pm" = 12:00 siempre. No preguntes.
- "12" sin sufijo en contexto de horario laboral = 12:00 (mediodía). No preguntes.

IDIOMA COMO FILTRO:
- Cuando el usuario mencione un idioma ("inglés", "portugués", "francés", etc.) en contexto de
  evaluadores o instructores, es SIEMPRE el filtro de idioma (parámetro language).
  Nunca lo interpretes como nombre de programa o clase.

INFERENCIA DE TIPO DE EVALUACIÓN:
- "demo" + "adulto/adult" → eval_type="demo_adult" sin confirmar.
- "consumer" + "adulto/adult" → eval_type="consumer_adult" sin confirmar.
- "corporativo" o "corporate" → eval_type="corporate" sin confirmar.
- "kids" + "consumer" → eval_type="consumer_kids" sin confirmar.
- Solo pide confirmación si hay ambigüedad real entre dos tipos.

INSTRUCTORES vs EVALUADORES:
- "Evaluadores" = instructores con can_evaluate=true. "Instructores" = todos los perfiles.
- Cuando el usuario pregunte por "instructores de [idioma]" o "quién enseña [idioma]", SIEMPRE llama
  find_instructors con language=[idioma]. Los resultados de evaluadores NO responden esta pregunta.
- Nunca deduzcas que no hay instructores de un idioma basándote en resultados de evaluadores.
- Si el usuario pide disponibilidad de instructores NO evaluadores para horarios de evaluación,
  busca quién tiene el horario libre igualmente (con find_available_instructors o
  get_instructor_free_windows) y aclara la distinción de competencia UNA sola vez.

ALUMNOS vs INSTRUCTORES:
- "¿Quién tiene programado a X?", "¿Quién da clases a X?" → X es un ALUMNO.
  Busca con program_filter en get_schedules_for_date. NO busques X como instructor_name.

DISPONIBILIDAD — DOS TIPOS (CRÍTICO):
Existen dos tipos de consulta de disponibilidad. Debes distinguirlos siempre:

TIPO A — Disponibilidad teórica (horario registrado, sin considerar clases):
  Señales: "¿en qué turnos trabaja?", "¿qué días puede?", "¿cuál es su horario?", sin fecha específica.
  Tool: get_instructor_profile → presentar el campo availability_windows del perfil.
  Describe: "Su horario registrado es lunes 08:00–14:00, miércoles 10:00–18:00..."

TIPO B — Disponibilidad real (espacios libres en una fecha concreta, descontando clases):
  Señales: pregunta incluye una fecha o día ("el lunes", "hoy", "el 24"), o el usuario quiere saber
  cuándo puede asignarse algo. Esta es la interpretación POR DEFECTO cuando hay fecha.
  Tool: get_instructor_free_windows → presentar free_windows.
  Describe: "Tiene libre de 07:00 a 09:00 y de 15:00 a 22:00 (tiene clase de 09:00 a 15:00)."

REGLAS DE INFERENCIA:
- Si la pregunta incluye una fecha o día → TIPO B. Llama get_instructor_free_windows directamente.
- Si la pregunta NO incluye fecha y el contexto tampoco tiene una → TIPO A o preguntar: "¿Quieres
  su horario semanal registrado, o los espacios libres en un día concreto?"
- Si el contexto de la conversación ya tiene una fecha activa y el usuario vuelve a preguntar
  por el mismo instructor sin nueva fecha → reutiliza la fecha del contexto (TIPO B).
- Si free_windows está vacío pero hay availability_windows → "No tiene espacios libres ese día;
  sus clases ocupan todo su horario registrado."
- Si has_availability=false → "No tiene disponibilidad registrada para ese día de la semana."

DISPONIBILIDAD — EXPLICACIÓN EN RESPUESTA:
- Siempre indica qué clases ocupan el tiempo: "Tiene clase de 09:00 a 15:00, así que queda libre..."
- Si una tool retorna reason="no_availability_window": indica "no tiene disponibilidad registrada para ese horario."
- Si retorna reason="class_conflict": indica la clase que genera el conflicto.
- Si retorna reason="all_have_conflicts": hay evaluadores con ventana pero todos tienen clase.
- Si retorna reason="no_evaluators_for_filter": no hay evaluadores del idioma/tipo pedido.

DISPONIBILIDAD VACÍA:
- Si find_evaluators retorna vacío, usa el campo diagnostics.reason para explicar por qué.
  Luego llama find_evaluator_slots para sugerir cuándo sí hay disponibilidad.

MATCHES APROXIMADOS EN PERFILES:
- Si get_instructor_profile retorna un nombre distinto al consultado, responde:
  "No encontré exactamente '[nombre buscado]'. El resultado más cercano es '[nombre retornado]'. ¿Es este?"

EVAL_TYPE POR CONSULTA:
- Nunca uses el eval_type de una consulta anterior. Cada pregunta es independiente.
- Si el usuario no menciona tipo de evaluación, omite el filtro eval_type.

COBERTURA DE CLASES Y POOLS (CRÍTICO):
Un pool define qué instructores pueden dar clases de un programa. Hay dos intenciones posibles:

INTENCIÓN A — Cobertura real (disponibilidad en fecha y hora concretas):
  Señales: "cubrir", "reemplazar", "sustituir", "quién puede en ese horario", pregunta con fecha/hora.
  Flujo:
  1. Tienes programa + fecha + hora → llama get_pool_candidates(program, branch, date, start_time, end_time).
  2. Tienes programa + fecha pero NO hora → pregunta UNA SOLA VEZ: "¿A qué hora es la clase?"
  3. Tienes programa pero NO fecha ni hora → pregunta UNA SOLA VEZ: "¿En qué fecha y horario es la clase?"
  4. Si hay una fecha/hora en el contexto activo de la conversación, úsala sin preguntar.
  Respuesta con candidatos disponibles:
    → Lista solo los que tienen available=true. Formato: "Candidatos disponibles: X, Y, Z."
  Respuesta sin candidatos disponibles (available_count=0):
    → "No hay instructores del pool disponibles en ese horario."
    → Muestra el pool completo (available=false) como referencia: "El pool de [programa] incluye: A, B, C."
    → No sugieras buscar fuera del pool a menos que hard_lock=false.
  Respuesta si pool_found=false:
    → "No hay pool definido para [programa]. Puedo buscar cualquier instructor libre a esa hora."
    → Ofrece llamar find_available_instructors con esa fecha y horario.

INTENCIÓN B — Lista general del pool (sin fecha/hora):
  Señales: "¿quién está en el pool de X?", "¿qué instructores pueden dar X?", "lista de candidatos para X", sin fecha.
  Flujo: llama get_pool_candidates(program, branch) SIN fecha ni hora.
  Respuesta: lista todos los candidatos. El campo available será null (no verificado). No hagas notar esto.

OTRAS CONSULTAS DE POOL:
- "¿En qué pools está [instructor]?" o "¿puede [instructor] dar [programa]?" → get_pool_rules con instructor=[nombre].
  Interpreta instructor_status por regla: 'allowed' = sí puede, 'blocked' = excluido explícitamente, 'not_in_pool' = no definido.
- "¿Cuántos pools hay?" o "¿Qué pools existen?" → get_pool_rules sin filtros (o count_only=true para solo el total).
- hard_lock=true: SOLO los de la lista pueden dar el programa. hard_lock=false: lista es recomendación, no obligatoria.
- day_overrides: si existen sobreescrituras por día, menciónalas solo si son relevantes para la consulta.

CONCISIÓN (CRÍTICO):
- Responde exactamente lo que se pregunta. No agregues información no solicitada.
- Si preguntan "¿está disponible X a las 10?" → responde solo sí o no + motivo breve. No listes sus clases del día.
- Si preguntan "¿qué espacios libres tiene X?" → lista los free_windows. Menciona solo cuántas clases tiene, no las detallas.
  Solo detalla clases si el usuario pregunta explícitamente ("¿qué clases tiene?", "¿qué la ocupa?").
- Si preguntan "¿quién puede cubrir X?" → lista los candidatos disponibles. No expliques el pool completo.
- Si preguntan una cantidad ("¿cuántos instructores hablan X?") → responde el número y opcionalmente la lista.
  No des contexto adicional sobre evaluadores, pools, etc. a menos que se pida.
- Usa listas cortas. Si hay más de 8 elementos, muestra los primeros y di "y N más".

FUERA DE CONTEXTO:
- Si el usuario pregunta algo ajeno a horarios, instructores o programas, redirige:
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
// History trimmer + compressor (ConversationSummaryBuffer pattern)
// ---------------------------------------------------------------------------

/** Splits history into [keep, drop] — keeps the most recent messages within budget. */
function splitHistoryByBudget(history: OAIMessage[]): { keep: OAIMessage[]; drop: OAIMessage[] } {
  let total = 0;
  const keep: OAIMessage[] = [];
  for (let i = history.length - 1; i >= 0; i--) {
    const content = history[i].content;
    const chars = typeof content === "string" ? content.length : 100;
    const tokens = Math.ceil(chars / 4);
    if (total + tokens > TOKEN_HISTORY_BUDGET && keep.length >= 2) {
      return { keep, drop: history.slice(0, i + 1) };
    }
    keep.unshift(history[i]);
    total += tokens;
  }
  return { keep, drop: [] };
}

/** Calls the LLM to produce a short summary of dropped messages. */
async function compressHistory(
  dropped: OAIMessage[],
  provider: AIProvider,
  existingSummary: string | null
): Promise<string> {
  const prefix = existingSummary
    ? `Previous summary:\n${existingSummary}\n\nAdditional messages to include:\n`
    : "";
  const transcript = dropped
    .filter((m) => m.role !== "tool" && typeof m.content === "string" && m.content)
    .map((m) => `${m.role}: ${m.content as string}`)
    .join("\n");
  const response = await callChatCompletions(provider, [
    {
      role: "system",
      content:
        "Summarize the following conversation in 3 bullet points, max 120 words. " +
        "Be factual. Focus on: people mentioned, dates/times discussed, decisions or findings.",
    },
    { role: "user", content: prefix + transcript },
  ], false);
  return response.choices[0]?.message.content?.trim() ?? "";
}

/** Returns the messages to include in the next request + an updated summary. */
async function trimOrCompress(
  history: OAIMessage[],
  provider: AIProvider,
  existingSummary: string | null
): Promise<{ trimmed: OAIMessage[]; summary: string | null }> {
  const { keep, drop } = splitHistoryByBudget(history);
  if (drop.length === 0) return { trimmed: keep, summary: existingSummary };
  const summary = await compressHistory(drop, provider, existingSummary);
  return { trimmed: keep, summary };
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
    throw new Error("Provider URL not configured.");
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
      const err: ExtendedError = new Error(`API error (${httpStatus}): ${responseText}`);
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
  if (!reader) throw new Error("Could not read response stream.");

  const decoder = new TextDecoder();
  let buffer = "";
  let accText = "";
  let finishReason: "stop" | "tool_calls" = "stop";
  const toolCallsMap: Record<number, { id: string; name: string; arguments: string }> = {};
  let usageCapture: OAIUsage | undefined;

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
            usage?: { prompt_tokens: number; completion_tokens: number };
          };

          if (parsed.usage) usageCapture = {
            prompt_tokens:     parsed.usage.prompt_tokens,
            completion_tokens: parsed.usage.completion_tokens,
            total_tokens:      parsed.usage.prompt_tokens + parsed.usage.completion_tokens,
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
    usage: usageCapture,
  };
}

// ---------------------------------------------------------------------------
// Chat result type
// ---------------------------------------------------------------------------
type ChatResult = {
  response: string;
  updatedHistory: OAIMessage[];
  updatedSummary: string | null;
  promptTokens: number;
  completionTokens: number;
  sentMessages: OAIMessage[];
};

// ---------------------------------------------------------------------------
// Core provider logic — tool call loop
// ---------------------------------------------------------------------------
async function tryProvider(
  provider: AIProvider,
  userMessage: string,
  conversationHistory: OAIMessage[],
  existingSummary: string | null,
  onToolCall?: (toolLabel: string) => void,
  signal?: AbortSignal,
  onChunk?: (text: string) => void
): Promise<ChatResult> {
  const today = new Date().toISOString().split("T")[0];
  const { trimmed, summary } = await trimOrCompress(conversationHistory, provider, existingSummary);

  const messages: OAIMessage[] = [
    { role: "system", content: SYSTEM_PROMPT.replace(/\{CURRENT_DATE\}/g, today) },
    ...(summary ? [{ role: "system" as const, content: `Context from earlier in this conversation:\n${summary}` }] : []),
    ...trimmed,
    { role: "user", content: userMessage },
  ];

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    // Always stream when streaming is requested — tool-call rounds emit no text, final round emits text
    const response = onChunk
      ? await callChatCompletionsStream(provider, messages, true, onChunk, signal)
      : await callChatCompletions(provider, messages, true, signal);

    const choice = response.choices[0];
    if (!choice) throw new Error("Empty response from model.");

    // No tool calls — final response
    if (choice.finish_reason !== "tool_calls" || !choice.message.tool_calls?.length) {
      const text = choice.message.content?.trim() ?? "";
      const usage = response.usage;
      return {
        response: text || "No response available.",
        updatedHistory: [
          ...trimmed,
          { role: "user", content: userMessage },
          choice.message,
        ],
        updatedSummary: summary,
        promptTokens:     usage?.prompt_tokens     ?? estimateTokens(messages),
        completionTokens: usage?.completion_tokens ?? Math.ceil(text.length / 4),
        sentMessages: messages,
      };
    }

    // Execute tool calls in parallel — results preserve order via Promise.all
    messages.push(choice.message);
    for (const toolCall of choice.message.tool_calls) {
      onToolCall?.(TOOL_LABELS[toolCall.function.name] ?? "Querying...");
    }
    const toolResults = await Promise.all(
      choice.message.tool_calls.map(async (toolCall) => {
        try {
          const input = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
          const result = await executeToolCall(toolCall.function.name, input);
          return { tool_call_id: toolCall.id, content: JSON.stringify(result) };
        } catch (err) {
          return {
            tool_call_id: toolCall.id,
            content: JSON.stringify({ error: err instanceof Error ? err.message : "Tool execution error" }),
          };
        }
      })
    );
    for (const r of toolResults) {
      messages.push({ role: "tool", ...r });
    }
  }

  return {
    response: "Could not complete the query after several attempts.",
    updatedHistory: trimmed,
    updatedSummary: summary,
    promptTokens: 0,
    completionTokens: 0,
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
  existingSummary: string | null,
  onToolCall?: (toolLabel: string) => void,
  signal?: AbortSignal,
  onChunk?: (text: string) => void
): Promise<ChatResult> {
  if (!provider.baseUrl) {
    throw new Error("Provider not configured. Open ⚙ to set the URL and API key.");
  }

  return tryProvider(provider, userMessage, conversationHistory, existingSummary, onToolCall, signal, onChunk);
}
