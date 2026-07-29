/**
 * RegLayer — Chat Message
 *
 * Production chat message with:
 * - Full markdown rendering
 * - Copy to clipboard
 * - Regenerate response (assistant messages)
 * - Edit message (user messages)
 * - Feedback thumbs up/down (assistant messages)
 * - Inline edit mode with save/cancel
 */

"use client";

import { useState } from "react";
import type { ChatMessage as ChatMessageType } from "@/stores/chatStore";
import type { ChatResponseStatus } from "@/lib/ai/chat/message-status";
import { stabilizeStreamingMarkdown } from "@/lib/ai/chat/stream-format";
import {
  MessageSquare,
  User,
  Copy,
  Check,
  RotateCcw,
  Pencil,
  ThumbsUp,
  ThumbsDown,
  Clock,
  Loader2,
  Radio,
  RefreshCw,
  Square,
  TriangleAlert,
  WifiOff,
} from "lucide-react";
import { ToolCallIndicator } from "./ToolCallIndicator";
import { ExplainabilityPanel } from "./ExplainabilityPanel";

interface ChatMessageProps {
  message: ChatMessageType;
  isLast?: boolean;
  isStreaming?: boolean;
  onRegenerate?: () => void;
  onEdit?: (id: string, newContent: string) => void;
  onFeedback?: (id: string, feedback: -1 | 0 | 1) => void;
}

const STATUS_LABELS: Record<ChatResponseStatus, string> = {
  sending: "Sending",
  queued: "Queued",
  generating: "Generating",
  streaming: "Streaming",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
  retrying: "Retrying",
  interrupted: "Interrupted",
};

function ResponseStatus({ status }: { status: ChatResponseStatus }) {
  const className = "h-3 w-3";
  const icon = status === "sending" || status === "generating"
    ? <Loader2 className={`${className} animate-spin`} />
    : status === "queued"
      ? <Clock className={className} />
      : status === "streaming"
        ? <Radio className={className} />
        : status === "completed"
          ? <Check className={className} />
          : status === "failed"
            ? <TriangleAlert className={className} />
            : status === "cancelled"
              ? <Square className={className} />
              : status === "retrying"
                ? <RefreshCw className={`${className} animate-spin`} />
                : <WifiOff className={className} />;

  return (
    // NOT a live region. Every assistant message used to announce independently, so a
    // queue drain produced N regions × four transitions each — a stream of chatter that
    // buried the one fact the user needed. The panel owns a single announcer instead;
    // this badge stays readable on demand but never interrupts.
    <div className="mt-1 flex items-center gap-1 text-[10px] text-neutral-400 dark:text-neutral-500">
      {icon}
      <span>{STATUS_LABELS[status]}</span>
    </div>
  );
}

export function ChatMessage({ message, isLast, isStreaming, onRegenerate, onEdit, onFeedback }: ChatMessageProps) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveEdit = () => {
    if (editContent.trim() && editContent !== message.content) {
      onEdit?.(message.id, editContent.trim());
    }
    setEditing(false);
  };

  const handleCancelEdit = () => {
    setEditContent(message.content);
    setEditing(false);
  };

  return (
    <div className={`group flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      {/* Avatar */}
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full mt-0.5 ${
          isUser
            ? "bg-accent text-white"
            : "bg-accent/10 text-accent"
        }`}
      >
        {isUser ? (
          <User className="h-3.5 w-3.5" />
        ) : (
          <MessageSquare className="h-3.5 w-3.5" />
        )}
      </div>

      {/* Content */}
      <div className={`flex-1 min-w-0 ${isUser ? "flex flex-col items-end" : ""}`}>
        {/* Edit mode for user messages */}
        {isUser && editing ? (
          <div className="w-full max-w-[80%]">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full rounded-xl border border-accent/30 bg-accent/5 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 dark:bg-accent/10 resize-none"
              rows={Math.min(6, editContent.split("\n").length + 1)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSaveEdit(); }
                if (e.key === "Escape") handleCancelEdit();
              }}
            />
            <div className="mt-1.5 flex gap-1.5 justify-end">
              <button
                onClick={handleCancelEdit}
                className="rounded-md px-2.5 py-1 text-xs text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="rounded-md bg-accent px-2.5 py-1 text-xs text-white hover:bg-accent/90"
              >
                Save & Resend
              </button>
            </div>
          </div>
        ) : (
          <div
            className={`relative rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
              isUser
                ? "bg-accent text-white max-w-[80%] inline-block"
                : "text-neutral-800 dark:text-neutral-200"
            }`}
          >
            {isUser ? (
              <p className="whitespace-pre-wrap">{message.content}</p>
            ) : (
              <>
                {/* Tool Call Indicators */}
                {message.toolCalls && message.toolCalls.length > 0 && (
                  <ToolCallIndicator toolCalls={message.toolCalls} />
                )}
                {message.content ? (
                  <div className="prose-sm">
                    <FormattedContent content={message.content} isStreaming={isStreaming} />
                  </div>
                ) : isStreaming ? (
                  <div className="flex items-center gap-1.5 py-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                ) : null}
                {/* Explainability Panel */}
                {message.lineage && !isStreaming && (
                  <ExplainabilityPanel lineage={message.lineage} />
                )}
              </>
            )}
          </div>
        )}

        {!isUser && message.status && <ResponseStatus status={message.status} />}

        {/* Action bar — visible on hover */}
        {!editing && message.content && !isStreaming && (
          <div className={`flex items-center gap-0.5 mt-1 opacity-0 transition-opacity group-hover:opacity-100 ${isUser ? "justify-end" : ""}`}>
            {/* Copy */}
            <ActionButton onClick={handleCopy} title="Copy">
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </ActionButton>

            {/* User: Edit */}
            {isUser && onEdit && (
              <ActionButton onClick={() => { setEditContent(message.content); setEditing(true); }} title="Edit & resend">
                <Pencil className="h-3 w-3" />
              </ActionButton>
            )}

            {/* Assistant: Regenerate (only on last message) */}
            {!isUser && isLast && onRegenerate && (
              <ActionButton onClick={onRegenerate} title="Regenerate">
                <RotateCcw className="h-3 w-3" />
              </ActionButton>
            )}

            {/* Assistant: Feedback */}
            {!isUser && onFeedback && (
              <>
                <ActionButton
                  onClick={() => onFeedback(message.id, message.feedback === 1 ? 0 : 1)}
                  title="Helpful"
                  active={message.feedback === 1}
                >
                  <ThumbsUp className="h-3 w-3" />
                </ActionButton>
                <ActionButton
                  onClick={() => onFeedback(message.id, message.feedback === -1 ? 0 : -1)}
                  title="Not helpful"
                  active={message.feedback === -1}
                >
                  <ThumbsDown className="h-3 w-3" />
                </ActionButton>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ActionButton({ onClick, title, active, children }: { onClick: () => void; title: string; active?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`rounded-md p-1.5 transition-colors ${
        active
          ? "text-accent bg-accent/10"
          : "text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 dark:hover:text-neutral-300 dark:hover:bg-neutral-800"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Full markdown formatter for assistant messages.
 * Supports: headings, bold, italic, inline code, fenced code blocks with
 * language label + copy button, bullet/numbered lists, links, horizontal
 * rules, and paragraph breaks.
 */
function FormattedContent({ content, isStreaming = false }: { content: string; isStreaming?: boolean }) {
  if (!content) {
    return <ThinkingIndicator />;
  }

  // While streaming, an opened-but-unclosed fence would otherwise render as plain text
  // with literal backticks and then snap into a dark bordered block — a late layout
  // shift that moves everything below it, on essentially every answer containing code.
  const display = stabilizeStreamingMarkdown(content, isStreaming);

  // Split by fenced code blocks first (```lang\n...\n```)
  const parts = display.split(/(```[\s\S]*?```)/g);

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("```") && part.endsWith("```")) {
          const inner = part.slice(3, -3);
          const firstNewline = inner.indexOf("\n");
          const lang = firstNewline > 0 ? inner.slice(0, firstNewline).trim() : "";
          const code = firstNewline > 0 ? inner.slice(firstNewline + 1) : inner;
          return <CodeBlock key={i} code={code} language={lang} />;
        }
        return <InlineFormat key={i} text={part} />;
      })}
    </>
  );
}

/** Fenced code block with language label, copy button, and mono font. */
function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-2.5 rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-700">
      {/* Header bar */}
      <div className="flex items-center justify-between bg-neutral-100 dark:bg-neutral-800 px-3 py-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          {language || "code"}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-neutral-500 hover:text-neutral-700 hover:bg-neutral-200 dark:hover:text-neutral-300 dark:hover:bg-neutral-700 transition-colors"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {/* Code */}
      <pre className="overflow-x-auto bg-neutral-950 p-3 text-[13px] leading-relaxed text-neutral-100">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function InlineFormat({ text }: { text: string }) {
  const lines = text.split("\n");

  return (
    <>
      {lines.map((line, i) => {
        // Horizontal rule
        if (/^-{3,}$/.test(line.trim()) || /^\*{3,}$/.test(line.trim())) {
          return <hr key={i} className="my-3 border-neutral-200 dark:border-neutral-700" />;
        }
        // Headings
        if (line.startsWith("### ")) {
          return <h4 key={i} className="mt-3 mb-1 text-[13px] font-semibold text-neutral-900 dark:text-white">{formatInline(line.slice(4))}</h4>;
        }
        if (line.startsWith("## ")) {
          return <h3 key={i} className="mt-3 mb-1 text-sm font-bold text-neutral-900 dark:text-white">{formatInline(line.slice(3))}</h3>;
        }
        if (line.startsWith("# ")) {
          return <h2 key={i} className="mt-4 mb-1.5 text-[15px] font-bold text-neutral-900 dark:text-white">{formatInline(line.slice(2))}</h2>;
        }
        // Numbered list
        if (/^\d+\.\s/.test(line)) {
          return (
            <div key={i} className="ml-1 flex gap-2 py-0.5">
              <span className="shrink-0 w-5 text-right text-neutral-400 text-[13px]">{line.match(/^\d+/)?.[0]}.</span>
              <span className="text-[13px]">{formatInline(line.replace(/^\d+\.\s/, ""))}</span>
            </div>
          );
        }
        // Bullet list
        if (line.startsWith("- ") || line.startsWith("* ")) {
          return (
            <div key={i} className="ml-1 flex gap-2 py-0.5">
              <span className="shrink-0 w-5 text-right text-neutral-400 text-[13px]">•</span>
              <span className="text-[13px]">{formatInline(line.slice(2))}</span>
            </div>
          );
        }
        // Empty line = paragraph break
        if (line.trim() === "") {
          return <div key={i} className="h-2" />;
        }
        // Regular text
        return <span key={i} className="text-[13px] leading-relaxed">{formatInline(line)}{i < lines.length - 1 ? "\n" : ""}</span>;
      })}
    </>
  );
}

function formatInline(text: string): React.ReactNode {
  // Match: **bold**, *italic*, `code`, [text](url)
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*") && !part.startsWith("**")) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={i} className="rounded bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 text-[12px] font-mono text-accent">{part.slice(1, -1)}</code>;
    }
    // Links: [text](url)
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return (
        <a
          key={i}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent underline underline-offset-2 hover:text-accent/80 transition-colors"
        >
          {linkMatch[1]}
        </a>
      );
    }
    return part;
  });
}

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-2 py-2">
      <div className="flex items-center gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-accent/60 animate-pulse" style={{ animationDelay: "0ms" }} />
        <span className="h-1.5 w-1.5 rounded-full bg-accent/60 animate-pulse" style={{ animationDelay: "200ms" }} />
        <span className="h-1.5 w-1.5 rounded-full bg-accent/60 animate-pulse" style={{ animationDelay: "400ms" }} />
      </div>
      <span className="text-[11px] text-neutral-400">Thinking...</span>
    </div>
  );
}
