import { useState, useRef, useEffect } from "react";
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

import { PRESETS, detectPreset } from "../services/provider-presets";
import { type ConnStatus, testProvider, fetchProviderModels } from "../services/provider-service";

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
    const updatedModels = { ...settings.aiModels, [currentPreset]: settings.aiModel };
    updateSetting("aiApiKeys", updatedKeys);
    updateSetting("aiModels", updatedModels);

    updateSetting("aiApiKey", updatedKeys[value] ?? "");
    updateSetting("aiBaseUrl", p.baseUrl);
    updateSetting("aiModel", updatedModels[value] ?? p.model);
    setAvailableModels([]);
  }

  function handleApiKeyChange(value: string) {
    updateSetting("aiApiKey", value);
    const currentPreset = detectPreset(settings.aiBaseUrl);
    updateSetting("aiApiKeys", { ...settings.aiApiKeys, [currentPreset]: value });
  }

  async function handleFetchModels() {
    setFetchingModels(true);
    const models = await fetchProviderModels(settings.aiBaseUrl, settings.aiApiKey);
    if (models.length > 0) setAvailableModels(models);
    setFetchingModels(false);
  }

  function runTest() {
    setConnStatus("testing");
    setConnMsg("");
    void testProvider(settings.aiBaseUrl, settings.aiModel, settings.aiApiKey)
      .then((s) => { setConnStatus(s.status); setConnMsg(s.msg); });
  }

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
          <Label className="text-xs text-muted-foreground">Platform</Label>
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
          <Label htmlFor="cfg-url" className="text-xs text-muted-foreground">Base URL</Label>
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
            <Label className="text-xs text-muted-foreground">Model</Label>
            <button
              type="button"
              onClick={() => void handleFetchModels()}
              disabled={fetchingModels || !settings.aiBaseUrl || (!settings.aiApiKey && !settings.aiBaseUrl.includes("localhost"))}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
              title={!settings.aiApiKey && !settings.aiBaseUrl.includes("localhost") ? "Enter an API key first" : "Fetch available models"}
            >
              <RefreshCw className={cn("size-3", fetchingModels && "animate-spin")} />
              {availableModels.length > 0 ? `${availableModels.length} models` : "Fetch"}
            </button>
          </div>
          {availableModels.length > 0 ? (
            <Select value={settings.aiModel} onValueChange={(v) => updateSetting("aiModel", v)}>
              <SelectTrigger className="h-8! w-full py-1 font-mono">
                <SelectValue placeholder="Select model" />
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
            <div className="flex items-center gap-1.5">
              {connStatus === "testing" && <Loader2 className="size-3 animate-spin text-muted-foreground shrink-0" />}
              {connStatus === "ok" && <Wifi className="size-3 text-green-500 shrink-0" />}
              {connStatus !== "testing" && connStatus !== "ok" && connStatus !== "idle" && <WifiOff className="size-3 text-destructive shrink-0" />}
              <span className={cn(
                "text-xs",
                connStatus === "ok" ? "text-green-600" :
                  connStatus === "auth_error" || connStatus === "error" ? "text-destructive" :
                    "text-muted-foreground"
              )}>
                {connStatus === "idle" ? "Not verified" :
                  connStatus === "testing" ? "Testing..." :
                    connStatus === "ok" ? "Connected" :
                      connStatus === "auth_error" ? "Invalid API key" : "Connection error"}
              </span>
            </div>
            <Button
              variant="outline" size="sm"
              onClick={runTest}
              disabled={connStatus === "testing" || !settings.aiBaseUrl}
              className="h-7 text-xs shrink-0"
            >
              Test
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
