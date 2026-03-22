export const PRESETS: Record<string, { label: string; baseUrl: string; model: string }> = {
  gemini: {
    label: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-2.5-flash",
  },
  openai: {
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
  },
  openrouter: {
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "openrouter/free",
  },
  vercel: {
    label: "Vercel AI Gateway",
    baseUrl: "https://ai-gateway.vercel.sh/v1",
    model: "google/gemini-2.5-flash",
  },
  groq: {
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile",
  },
  ollama: {
    label: "Ollama (local)",
    baseUrl: "http://localhost:11434/v1",
    model: "llama3.2:3b",
  },
  ollama_cloud: {
    label: "Ollama (cloud)",
    baseUrl: "https://ollama.com/api",
    model: "gpt-oss:120b",
  },
  custom: {
    label: "Personalizado",
    baseUrl: "",
    model: "",
  },
};

export function detectPreset(baseUrl: string): string {
  for (const [key, p] of Object.entries(PRESETS)) {
    if (key !== "custom" && p.baseUrl === baseUrl) return key;
  }
  return "custom";
}
