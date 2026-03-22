import { invoke } from "@tauri-apps/api/core";
import { fetch } from "@tauri-apps/plugin-http";
import type { OAIMessage, OAIResponse, OAIUsage, AIProvider } from "../types";
import { SCHEDULE_TOOLS, executeToolCall, TOOL_LABELS } from "../tools/schedule-tools";
import { SYSTEM_PROMPT } from "./system-prompt";

const MAX_TOOL_ITERATIONS = 5;
const TOKEN_HISTORY_BUDGET = 6000; // chars/4 estimate; leaves room for system + tools + new message

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
            prompt_tokens: parsed.usage.prompt_tokens,
            completion_tokens: parsed.usage.completion_tokens,
            total_tokens: parsed.usage.prompt_tokens + parsed.usage.completion_tokens,
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
        promptTokens: usage?.prompt_tokens ?? estimateTokens(messages),
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
