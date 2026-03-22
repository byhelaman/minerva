import { useReducer, useRef, useEffect, useCallback, useState } from "react";
import {
  BotMessageSquare, Send, Settings,
  ChevronLeft, X, Square, ClipboardCopy, Check, Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { RequirePermission } from "@/components/RequirePermission";
import { useSettings } from "@/components/settings-provider";
import { cn } from "@/lib/utils";

import { sendChatMessage } from "../services/chat-service";
import type { OAIMessage } from "../types";

import { chatReducer, initialState, formatTokens } from "./chat-reducer";
import { MessageBubble } from "./MessageBubble";
import { ConfigPanel } from "./ConfigPanel";

// ---------------------------------------------------------------------------
// Widget principal
// ---------------------------------------------------------------------------
export function ChatWidget() {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const [showConfig, setShowConfig] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { settings } = useSettings();

  const isLoading = state.messages.some((m) => m.isLoading);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.messages]);

  // Foco al abrir
  useEffect(() => {
    if (state.isOpen && !showConfig) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [state.isOpen, showConfig]);

  // Contador de tiempo durante loading
  useEffect(() => {
    if (!isLoading) { setElapsedSeconds(0); return; }
    setElapsedSeconds(0);
    const interval = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [isLoading]);

  const abortRef = useRef<AbortController | null>(null);
  const handleStop = useCallback(() => { abortRef.current?.abort(); }, []);

  const runSubmit = useCallback(async (text: string, historyOverride?: OAIMessage[]) => {
    const assistantMsgId = crypto.randomUUID();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    dispatch({ type: "ADD_MESSAGE", payload: { id: crypto.randomUUID(), role: "user", content: text, timestamp: Date.now() } });
    dispatch({ type: "ADD_MESSAGE", payload: { id: assistantMsgId, role: "assistant", content: "", timestamp: Date.now(), isLoading: true } });

    const provider = { id: "main", baseUrl: settings.aiBaseUrl, model: settings.aiModel, apiKey: settings.aiApiKey };

    let streamedText = "";
    let firstChunk = true;

    try {
      const { response, updatedHistory, estimatedTokens } = await sendChatMessage(
        text,
        historyOverride ?? state.history,
        provider,
        (toolLabel) => {
          dispatch({ type: "ADD_MESSAGE", payload: { id: crypto.randomUUID(), role: "tool_status", content: toolLabel, timestamp: Date.now() } });
        },
        ctrl.signal,
        (chunk) => {
          streamedText += chunk;
          const patch = firstChunk
            ? { content: streamedText, isLoading: false, isStreaming: true }
            : { content: streamedText };
          firstChunk = false;
          dispatch({ type: "UPDATE_MESSAGE", id: assistantMsgId, patch });
        }
      );
      dispatch({ type: "REMOVE_TOOL_STATUS" });
      dispatch({ type: "UPDATE_MESSAGE", id: assistantMsgId, patch: { content: response, isLoading: false, isStreaming: false } });
      dispatch({ type: "SET_HISTORY", payload: updatedHistory });
      dispatch({ type: "ADD_TOKENS", amount: estimatedTokens });
    } catch (err) {
      dispatch({ type: "REMOVE_TOOL_STATUS" });
      if (err instanceof Error && err.name === "AbortError") {
        dispatch({ type: "REMOVE_MESSAGE", id: assistantMsgId });
        return;
      }
      const errorMsg = err instanceof Error ? err.message : "Error desconocido";
      dispatch({ type: "UPDATE_MESSAGE", id: assistantMsgId, patch: { content: errorMsg, isLoading: false, isError: true, retryText: text } });
    } finally {
      abortRef.current = null;
    }
  }, [state.history, settings.aiBaseUrl, settings.aiModel, settings.aiApiKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = useCallback(() => {
    const text = state.input.trim();
    if (!text || isLoading) return;
    dispatch({ type: "SET_INPUT", payload: "" });
    void runSubmit(text);
  }, [state.input, isLoading, runSubmit]);

  const handleRetry = useCallback((text: string, errorMsgId: string) => {
    if (isLoading) return;
    dispatch({ type: "REMOVE_MESSAGE", id: errorMsgId });
    void runSubmit(text);
  }, [isLoading, runSubmit]);

  const handleEditStart = useCallback((id: string) => {
    if (isLoading) return;
    setEditingId(id);
  }, [isLoading]);

  const handleEditSave = useCallback((messageId: string, newText: string) => {
    const idx = state.messages.findIndex((m) => m.id === messageId);
    if (idx === -1) return;
    dispatch({ type: "TRUNCATE_FROM", index: idx });
    dispatch({ type: "SET_HISTORY", payload: [] });
    setEditingId(null);
    void runSubmit(newText, []);
  }, [state.messages, runSubmit]);

  const handleEditCancel = useCallback(() => setEditingId(null), []);

  const handleShare = useCallback(() => {
    const lines = state.messages
      .filter((m) => m.role !== "tool_status" && !m.isLoading && m.content)
      .map((m) => `${m.role === "user" ? "Usuario" : "Mina"}: ${m.content}`)
      .join("\n\n");
    const date = new Date().toLocaleDateString("es-MX", { dateStyle: "long" });
    const text = `Chat con Mina — ${date}\n${"─".repeat(40)}\n\n${lines}`;
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [state.messages]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
    },
    [handleSubmit]
  );

  return (
    <RequirePermission permission="schedules.read">
      {/* Panel flotante */}
      {state.isOpen && (
        <Card className="fixed bottom-6 right-6 z-50 w-105 h-140 flex flex-col p-0 gap-0 shadow-xl overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              {showConfig && (
                <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={() => setShowConfig(false)}>
                  <ChevronLeft className="size-4" />
                </Button>
              )}
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-none">
                  {showConfig ? "Configuración" : "Mina"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {showConfig ? "Proveedor de IA y credenciales" : "Tu asistente en Minerva"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {!showConfig && state.messages.length > 0 && (
                <>
                  <Button variant="ghost" size="icon" className="size-7 text-muted-foreground"
                    onClick={handleShare} title="Compartir conversación">
                    {copied ? <Check className="size-4 text-green-500" /> : <ClipboardCopy className="size-4" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="size-7 text-muted-foreground"
                    onClick={() => dispatch({ type: "CLEAR" })} disabled={isLoading} title="Limpiar conversación">
                    <Trash2 className="size-4" />
                  </Button>
                </>
              )}
              <Button variant="ghost" size="icon" className={cn("size-7", showConfig && "text-primary")}
                onClick={() => setShowConfig((v) => !v)} aria-label="Configuración">
                <Settings className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" className="size-7"
                onClick={() => { dispatch({ type: "TOGGLE" }); setShowConfig(false); }}>
                <X className="size-4" />
              </Button>
            </div>
          </div>

          {/* Contenido */}
          {showConfig ? (
            <ConfigPanel />
          ) : (
            <>
              <ScrollArea className="flex-1 min-h-0 px-4 py-3">
                <div className="p-1">
                  {state.messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center text-center text-muted-foreground gap-3 py-8">
                      <BotMessageSquare className="size-10 opacity-30" />
                      <div className="space-y-1">
                        <p className="text-sm font-medium">¿En qué puedo ayudarte?</p>
                        <p className="text-xs max-w-72">
                          Pregunta sobre disponibilidad de instructores, horarios del día, o clases programadas.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      {state.messages.map((msg) => (
                        <MessageBubble
                          key={msg.id}
                          message={msg}
                          elapsedSeconds={msg.isLoading ? elapsedSeconds : 0}
                          isEditing={editingId === msg.id}
                          onRetry={handleRetry}
                          onEditStart={handleEditStart}
                          onEditSave={handleEditSave}
                          onEditCancel={handleEditCancel}
                        />
                      ))}
                      <div ref={bottomRef} />
                    </>
                  )}
                </div>
              </ScrollArea>

              <div className="px-4 pt-3 pb-4 border-t shrink-0">
                <div className="flex gap-2 items-end">
                  <Textarea
                    ref={textareaRef}
                    placeholder="Escribe tu pregunta..."
                    value={state.input}
                    onChange={(e) => dispatch({ type: "SET_INPUT", payload: e.target.value })}
                    onKeyDown={handleKeyDown}
                    rows={1}
                    className="min-h-0 max-h-30 resize-none field-sizing-content"
                  />
                  {isLoading ? (
                    <Button size="icon" variant="outline" onClick={handleStop} className="shrink-0 size-9" title="Detener">
                      <Square className="size-4" />
                    </Button>
                  ) : (
                    <Button size="icon" onClick={handleSubmit}
                      disabled={!state.input.trim() || (settings.aiTokenLimit > 0 && state.sessionTokens >= settings.aiTokenLimit)}
                      className="shrink-0 size-9">
                      <Send className="size-4" />
                    </Button>
                  )}
                </div>
                {state.sessionTokens > 0 && (
                  <p className={cn(
                    "text-xs mt-1.5 tabular-nums",
                    settings.aiTokenLimit > 0 && state.sessionTokens >= settings.aiTokenLimit ? "text-destructive"
                      : settings.aiTokenLimit > 0 && state.sessionTokens >= settings.aiTokenLimit * 0.8 ? "text-amber-500"
                        : "text-muted-foreground"
                  )}>
                    ~{formatTokens(state.sessionTokens)} tokens esta sesión
                    {settings.aiTokenLimit > 0 && ` / ${formatTokens(settings.aiTokenLimit)}`}
                  </p>
                )}
              </div>
            </>
          )}
        </Card>
      )}

      {/* Botón flotante */}
      {!state.isOpen && (
        <Button
          onClick={() => dispatch({ type: "TOGGLE" })}
          size="icon"
          className="fixed bottom-6 right-6 z-50 size-12 rounded-full shadow-lg"
          aria-label="Abrir asistente"
        >
          <BotMessageSquare className="size-5" />
        </Button>
      )}
    </RequirePermission>
  );
}
