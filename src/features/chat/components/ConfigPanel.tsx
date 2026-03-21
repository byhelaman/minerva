import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Loader2, Wifi, WifiOff, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSettings } from "@/components/settings-provider";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Presets de proveedor
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Panel de configuración inline — proveedor único
// ---------------------------------------------------------------------------
export type ConnStatus = "idle" | "testing" | "ok" | "auth_error" | "error";

export function parseApiErrorMessage(text: string, status: number): string {
  try {
    const json = JSON.parse(text);
    const msg = json?.error?.message ?? json?.[0]?.error?.message ?? json?.message ?? json?.detail;
    if (typeof msg === "string" && msg) return msg;
  } catch { /* not JSON */ }
  return `Error ${status}: ${text}`;
}

export async function testProvider(baseUrl: string, model: string, apiKey: string): Promise<{ status: ConnStatus; msg: string }> {
  const url = baseUrl.replace(/\/$/, "");
  if (!url) return { status: "error", msg: "URL no configurada" };
  const isOllamaCloud = url.includes("ollama.com");
  try {
    let httpStatus: number;
    let text: string;
    if (isOllamaCloud) {
      const result = await invoke<[number, string]>("http_request", {
        method: "POST",
        url: `${url}/chat`,
        bearer: apiKey || null,
        body: JSON.stringify({ model: model || "gpt-oss:120b", messages: [{ role: "user", content: "hi" }], stream: false }),
      });
      [httpStatus, text] = result;
    } else {
      const reqBody = JSON.stringify({ model: model || "gpt-4o-mini", messages: [{ role: "user", content: "hi" }], max_tokens: 1 });
      const res = await fetch(`${url}/chat/completions`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey || "none"}`, "Content-Type": "application/json" },
        body: reqBody,
      });
      httpStatus = res.status;
      text = await res.text();
    }
    if (httpStatus >= 200 && httpStatus < 300) return { status: "ok", msg: "" };
    if (httpStatus === 401 || httpStatus === 403) return { status: "auth_error", msg: "Clave inválida o sin permisos" };
    return { status: "error", msg: parseApiErrorMessage(text, httpStatus) };
  } catch {
    return { status: "error", msg: "No se pudo conectar al servidor" };
  }
}

export function ConfigPanel() {
  const { settings, updateSetting } = useSettings();
  const [connStatus, setConnStatus] = useState<ConnStatus>("idle");
  const [connMsg, setConnMsg] = useState("");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const preset = detectPreset(settings.aiBaseUrl);

  function handlePresetChange(value: string) {
    const p = PRESETS[value];
    if (!p) return;
    const currentPreset = detectPreset(settings.aiBaseUrl);
    const updatedKeys = { ...settings.aiApiKeys, [currentPreset]: settings.aiApiKey };
    updateSetting("aiApiKeys", updatedKeys);
    const savedKey = updatedKeys[value] ?? "";
    updateSetting("aiApiKey", savedKey);
    if (value !== "custom") {
      updateSetting("aiBaseUrl", p.baseUrl);
      updateSetting("aiModel", p.model);
    }
    setAvailableModels([]);
  }

  function handleApiKeyChange(value: string) {
    updateSetting("aiApiKey", value);
    const currentPreset = detectPreset(settings.aiBaseUrl);
    updateSetting("aiApiKeys", { ...settings.aiApiKeys, [currentPreset]: value });
  }

  async function fetchModels() {
    const url = settings.aiBaseUrl.replace(/\/$/, "");
    if (!url) return;
    setFetchingModels(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (settings.aiApiKey) headers["Authorization"] = `Bearer ${settings.aiApiKey}`;

      let ids: string[] = [];
      const isOllamaUrl = url.includes("ollama") || url.includes("localhost");

      if (isOllamaUrl) {
        // Ollama usa /api/tags — invoke desde Rust para evitar CORS
        const base = new URL(url).origin;
        const result = await invoke<[number, string]>("http_request", {
          method: "GET",
          url: `${base}/api/tags`,
          bearer: settings.aiApiKey || null,
          body: null,
        }).catch(() => null);
        if (result?.[0] === 200) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const data = JSON.parse(result[1]) as any;
          if (Array.isArray(data?.models)) ids = (data.models as { name?: string }[]).map((m) => m.name ?? "").filter(Boolean);
        }
      } else {
        // OpenAI-compat /models (OpenAI, Groq, Gemini, etc.)
        const res = await fetch(`${url}/models`, { headers }).catch(() => null);
        if (res?.ok) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const data = await res.json() as any;
          if (Array.isArray(data?.data)) ids = (data.data as { id?: string }[]).map((m) => m.id ?? "").filter(Boolean);
          else if (Array.isArray(data?.models)) ids = (data.models as { name?: string }[]).map((m) => m.name ?? "").filter(Boolean);
        }
      }

      const normalized = ids.map((id) => id.replace(/^models\//, ""));
      if (normalized.length > 0) setAvailableModels(normalized.sort());
    } catch { /* silencioso */ }
    finally { setFetchingModels(false); }
  }

  function runTest() {
    setConnStatus("testing");
    setConnMsg("");
    void testProvider(settings.aiBaseUrl, settings.aiModel, settings.aiApiKey)
      .then((s) => { setConnStatus(s.status); setConnMsg(s.msg); });
  }

  // Auto-test con debounce al cambiar credenciales (Ollama local no necesita apiKey)
  useEffect(() => {
    if (!settings.aiBaseUrl) { setConnStatus("idle"); return; }
    setConnStatus("testing");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(runTest, 1500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.aiBaseUrl, settings.aiModel, settings.aiApiKey]);


  return (
    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 py-4">
      <div className="space-y-3 px-1">

        {/* Plataforma */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Plataforma</Label>
          <Select value={preset} onValueChange={handlePresetChange}>
            <SelectTrigger className="h-8! w-full py-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PRESETS).map(([key, p]) => (
                <SelectItem key={key} value={key}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* URL base */}
        <div className="space-y-1.5">
          <Label htmlFor="cfg-url" className="text-xs text-muted-foreground">URL base</Label>
          <Input
            id="cfg-url"
            value={settings.aiBaseUrl}
            onChange={(e) => updateSetting("aiBaseUrl", e.target.value)}
            placeholder="https://api.openai.com/v1"
            className="h-8 text-xs font-mono"
          />
        </div>

        {/* API Key */}
        <div className="space-y-1.5">
          <Label htmlFor="cfg-key" className="text-xs text-muted-foreground">API Key</Label>
          <Input
            id="cfg-key"
            type="password"
            value={settings.aiApiKey}
            onChange={(e) => handleApiKeyChange(e.target.value)}
            placeholder="sk-..."
            className="h-8 text-xs font-mono"
            autoComplete="new-password"
          />
        </div>

        {/* Modelo */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Modelo</Label>
            <button
              type="button"
              onClick={() => void fetchModels()}
              disabled={fetchingModels || !settings.aiBaseUrl || (!settings.aiApiKey && !settings.aiBaseUrl.includes("localhost"))}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
              title={!settings.aiApiKey && !settings.aiBaseUrl.includes("localhost") ? "Ingresa una API key primero" : "Obtener modelos disponibles"}
            >
              <RefreshCw className={cn("size-3", fetchingModels && "animate-spin")} />
              {availableModels.length > 0 ? `${availableModels.length} modelos` : "Obtener"}
            </button>
          </div>
          {availableModels.length > 0 ? (
            <Select value={settings.aiModel} onValueChange={(v) => updateSetting("aiModel", v)}>
              <SelectTrigger className="h-8! w-full py-1 font-mono">
                <SelectValue placeholder="Selecciona modelo" />
              </SelectTrigger>
              <SelectContent>
                {availableModels.map((m) => (
                  <SelectItem key={m} value={m} className="font-mono">{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id="cfg-model"
              value={settings.aiModel}
              onChange={(e) => updateSetting("aiModel", e.target.value)}
              placeholder="gemini-2.5-flash"
              className="h-8 text-xs font-mono"
            />
          )}
        </div>

        <Separator />

        {/* Estado de conexión */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {connStatus === "testing" && <Loader2 className="size-3 animate-spin text-muted-foreground shrink-0" />}
              {connStatus === "ok" && <Wifi className="size-3 text-green-500 shrink-0" />}
              {connStatus !== "testing" && connStatus !== "ok" && connStatus !== "idle" && <WifiOff className="size-3 text-destructive shrink-0" />}
              <span className={cn(
                "text-xs",
                connStatus === "ok" ? "text-green-600" :
                  connStatus === "auth_error" || connStatus === "error" ? "text-destructive" :
                    "text-muted-foreground"
              )}>
                {connStatus === "idle" ? "Sin verificar" :
                  connStatus === "testing" ? "Probando conexión..." :
                    connStatus === "ok" ? "Conectado" : "Error de conexión"}
              </span>
            </div>
            <Button
              variant="outline" size="sm"
              onClick={runTest}
              disabled={connStatus === "testing" || !settings.aiBaseUrl}
              className="h-7 text-xs shrink-0"
            >
              Probar
            </Button>
          </div>
          {connMsg && (connStatus === "error" || connStatus === "auth_error") && (
            <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2">
              <p className="text-xs text-destructive wrap-break-word">{connMsg}</p>
            </div>
          )}
        </div>


      </div>
    </div>
  );
}
