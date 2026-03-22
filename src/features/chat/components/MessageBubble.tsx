import { useState, useRef, useEffect } from "react";
import {
  Loader2, ChevronLeft, Copy, Check, Pencil, RotateCcw,
} from "lucide-react";
import Markdown from "react-markdown";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import type { ChatMessage } from "../types";

// ---------------------------------------------------------------------------
// Sub-componente: burbuja de mensaje
// ---------------------------------------------------------------------------
export interface MessageBubbleProps {
  message: ChatMessage;
  elapsedSeconds: number;
  isEditing: boolean;
  onRetry: (text: string, errorMsgId: string) => void;
  onEditStart: (id: string, text: string) => void;
  onEditSave: (id: string, newText: string) => void;
  onEditCancel: () => void;
}

export function parseThinkContent(content: string): { thinking: string; response: string } {
  const match = content.match(/^<think>([\s\S]*?)<\/think>\s*/);
  if (match) {
    return { thinking: match[1].trim(), response: content.slice(match[0].length).trim() };
  }
  return { thinking: "", response: content };
}

export function MessageBubble({
  message, elapsedSeconds, isEditing,
  onRetry, onEditStart, onEditSave, onEditCancel,
}: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const [thinkOpen, setThinkOpen] = useState(false);
  const [editText, setEditText] = useState(message.content);
  const editRef = useRef<HTMLTextAreaElement>(null);

  const { thinking, response: parsedResponse } = parseThinkContent(message.content);

  // Foco al entrar en modo edición
  useEffect(() => {
    if (isEditing) {
      setEditText(message.content);
      setTimeout(() => {
        editRef.current?.focus();
        editRef.current?.select();
      }, 0);
    }
  }, [isEditing, message.content]);

  if (message.role === "tool_status") {
    return (
      <div className="flex items-center gap-1.5 text-muted-foreground text-xs py-1 px-1">
        <Loader2 className="size-3 animate-spin shrink-0" />
        <span>{message.content}</span>
      </div>
    );
  }

  const isUser = message.role === "user";

  async function handleCopy() {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  // Edición in-place
  if (isEditing && isUser) {
    return (
      <div className="flex flex-col items-end mb-3 w-full">
        <Textarea
          ref={editRef}
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (editText.trim()) onEditSave(message.id, editText.trim());
            }
            if (e.key === "Escape") onEditCancel();
          }}
          className="w-full max-w-[82%] text-sm resize-none min-h-0 field-sizing-content"
          rows={1}
        />
        <div className="flex gap-1 mt-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs text-muted-foreground"
            onClick={onEditCancel}
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => { if (editText.trim()) onEditSave(message.id, editText.trim()); }}
            disabled={!editText.trim()}
          >
            Enviar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("group flex flex-col mb-1", isUser ? "items-end" : "items-start")}>
      {/* Bloque thinking (solo asistente, solo si hay) */}
      {!isUser && !message.isLoading && thinking && (
        <div className="w-full mb-1">
          <button
            type="button"
            onClick={() => setThinkOpen((v) => !v)}
            className="flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            <ChevronLeft className={cn("size-2.5 transition-transform", thinkOpen ? "-rotate-90" : "rotate-180")} />
            Razonamiento
          </button>
          {thinkOpen && (
            <pre className="mt-1 text-[10px] font-mono text-muted-foreground/60 border-l border-muted-foreground/20 pl-3 whitespace-pre-wrap wrap-break-word leading-relaxed max-h-40 overflow-auto">
              {thinking}
            </pre>
          )}
        </div>
      )}

      {/* Mensaje usuario: burbuja con fondo */}
      {isUser && (
        <div className="max-w-[82%] rounded-lg px-3 py-2 text-sm bg-muted text-foreground whitespace-pre-wrap wrap-break-word">
          {message.content}
        </div>
      )}

      {/* Mensaje asistente: sin burbuja, con markdown */}
      {!isUser && (
        <div className={cn("w-full text-sm p-1 text-foreground", message.isError && "text-destructive")}>
          {message.isLoading ? (
            <span className="flex gap-1 items-center">
              <span className="size-1 rounded-full bg-current animate-bounce [animation-delay:0ms]" />
              <span className="size-1 rounded-full bg-current animate-bounce [animation-delay:150ms]" />
              <span className="size-1 rounded-full bg-current animate-bounce [animation-delay:300ms]" />
              {elapsedSeconds > 0 && (
                <span className="ml-1 text-xs opacity-50 tabular-nums">{elapsedSeconds}s</span>
              )}
            </span>
          ) : message.isError ? (
            <p className="break-all">{parsedResponse}</p>
          ) : (
            <Markdown
              components={{
                p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                ul: ({ children }) => <ul className="list-disc pl-4 mb-1 space-y-0.5">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal pl-4 mb-1 space-y-0.5">{children}</ol>,
                li: ({ children }) => <li>{children}</li>,
                strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                em: ({ children }) => <em className="italic">{children}</em>,
                code: ({ children }) => <code className="font-mono text-xs bg-muted px-1 rounded">{children}</code>,
              }}
            >
              {parsedResponse}
            </Markdown>
          )}
        </div>
      )}

      {/* Acciones (hover) */}
      {!message.isLoading && !message.isStreaming && (
        <div className="flex items-center gap-0.5 mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          {!message.isError && (
            <Button variant="ghost" size="icon" className="size-6 text-muted-foreground hover:text-foreground" onClick={handleCopy} title="Copiar">
              {copied ? <Check className="size-3 text-green-500" /> : <Copy className="size-3" />}
            </Button>
          )}
          {isUser && (
            <Button variant="ghost" size="icon" className="size-6 text-muted-foreground hover:text-foreground" onClick={() => onEditStart(message.id, message.content)} title="Editar">
              <Pencil className="size-3" />
            </Button>
          )}
          {message.isError && message.retryText && (
            <Button variant="ghost" size="icon" className="size-6 text-destructive hover:text-destructive/80" onClick={() => onRetry(message.retryText!, message.id)} title="Reintentar">
              <RotateCcw className="size-3" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
