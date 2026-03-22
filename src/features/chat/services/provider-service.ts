import { fetch } from "@tauri-apps/plugin-http";

export type ConnStatus = "idle" | "testing" | "ok" | "auth_error" | "error";

type OllamaTagsResponse = { models?: { name?: string }[] };
type OpenAIModelsResponse = { data?: { id?: string }[]; models?: { name?: string }[] };

export function parseApiErrorMessage(text: string, status: number): string {
  try {
    const json = JSON.parse(text);
    const msg = json?.error?.message ?? json?.[0]?.error?.message ?? json?.message ?? json?.detail;
    if (typeof msg === "string" && msg) return msg;
  } catch { /* not JSON */ }
  return `Error ${status}: ${text}`;
}

export async function testProvider(
  baseUrl: string,
  model: string,
  apiKey: string,
): Promise<{ status: ConnStatus; msg: string }> {
  const url = baseUrl.replace(/\/$/, "");
  if (!url) return { status: "error", msg: "URL not configured" };
  const isOllamaCloud = url.includes("ollama.com");
  try {
    const [endpoint, body] = isOllamaCloud
      ? [`${url}/chat`, JSON.stringify({ model: model || "gpt-oss:120b", messages: [{ role: "user", content: "hi" }], stream: false })]
      : [`${url}/chat/completions`, JSON.stringify({ model: model || "gpt-4o-mini", messages: [{ role: "user", content: "hi" }] })];
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey || "none"}`, "Content-Type": "application/json" },
      body,
    });
    const text = await res.text();
    if (res.status >= 200 && res.status < 300) return { status: "ok", msg: "" };
    if (res.status === 401 || res.status === 403) return { status: "auth_error", msg: "Invalid or missing API key" };
    return { status: "error", msg: parseApiErrorMessage(text, res.status) };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { status: "error", msg: `Could not reach server: ${detail}` };
  }
}

export async function fetchProviderModels(baseUrl: string, apiKey: string): Promise<string[]> {
  const url = baseUrl.replace(/\/$/, "");
  if (!url) return [];
  const isOllamaUrl = url.includes("ollama") || url.includes("localhost");

  try {
    let ids: string[] = [];

    if (isOllamaUrl) {
      // Ollama usa /api/tags en el origen base
      const base = new URL(url).origin;
      const res = await fetch(`${base}/api/tags`, {
        headers: apiKey ? { "Authorization": `Bearer ${apiKey}` } : {},
      }).catch(() => null);
      if (res?.ok) {
        const data = await res.json() as OllamaTagsResponse;
        if (Array.isArray(data?.models)) ids = data.models.map((m) => m.name ?? "").filter(Boolean);
      }
    } else {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
      const res = await fetch(`${url}/models`, { headers }).catch(() => null);
      if (res?.ok) {
        const data = await res.json() as OpenAIModelsResponse;
        if (Array.isArray(data?.data)) ids = data.data.map((m) => m.id ?? "").filter(Boolean);
        else if (Array.isArray(data?.models)) ids = data.models.map((m) => m.name ?? "").filter(Boolean);
      }
    }

    return ids.map((id) => id.replace(/^models\//, "")).sort();
  } catch {
    return [];
  }
}
