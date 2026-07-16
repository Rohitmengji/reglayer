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
import { MessageSquare, User, Copy, Check, RotateCcw, Pencil, ThumbsUp, ThumbsDown, X } from "lucide-react";

interface ChatMessageProps {
  message: ChatMessageType;
  isLast?: boolean;
  isStreaming?: boolean;
  onRegenerate?: () => void;
  onEdit?: (id: string, newContent: string) => void;
  onFeedback?: (id: string, feedback: -1 | 0 | 1) => void;
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
              <div className="prose-sm">
                <FormattedContent content={message.content} />
              </div>
            )}
          </div>
        )}

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
 * Handles: headings, bold, inline code, code blocks, lists, line breaks.
 */
function FormattedContent({ content }: { content: string }) {
  if (!content) {
    return <ThinkingIndicator />;
  }

  // Split by code blocks first (```...```)
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("```") && part.endsWith("```")) {
          const code = part.slice(3, -3).replace(/^\w*\n/, "");
          return (
            <pre
              key={i}
              className="my-2 overflow-x-auto rounded-lg bg-neutral-900 p-3 text-xs text-neutral-100 dark:bg-neutral-950"
            >
              <code>{code}</code>
            </pre>
          );
        }
        return <InlineFormat key={i} text={part} />;
      })}
    </>
  );
}

function InlineFormat({ text }: { text: string }) {
  // Process line by line for headings and lists
  const lines = text.split("\n");

  return (
    <>
      {lines.map((line, i) => {
        // Headings
        if (line.startsWith("### ")) {
          return <h4 key={i} className="mt-3 mb-1 text-sm font-semibold text-neutral-900 dark:text-white">{formatInline(line.slice(4))}</h4>;
        }
        if (line.startsWith("## ")) {
          return <h3 key={i} className="mt-3 mb-1 text-sm font-bold text-neutral-900 dark:text-white">{formatInline(line.slice(3))}</h3>;
        }
        if (line.startsWith("# ")) {
          return <h2 key={i} className="mt-3 mb-1 font-bold text-neutral-900 dark:text-white">{formatInline(line.slice(2))}</h2>;
        }
        // Numbered list
        if (/^\d+\.\s/.test(line)) {
          return <div key={i} className="ml-4 flex gap-2"><span className="shrink-0 text-neutral-400">{line.match(/^\d+/)?.[0]}.</span><span>{formatInline(line.replace(/^\d+\.\s/, ""))}</span></div>;
        }
        // Bullet list
        if (line.startsWith("- ") || line.startsWith("* ")) {
          return <div key={i} className="ml-4 flex gap-2"><span className="shrink-0 text-neutral-400">•</span><span>{formatInline(line.slice(2))}</span></div>;
        }
        // Empty line = paragraph break
        if (line.trim() === "") {
          return <div key={i} className="h-2" />;
        }
        // Regular text
        return <span key={i}>{formatInline(line)}{i < lines.length - 1 ? "\n" : ""}</span>;
      })}
    </>
  );
}

function formatInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={i} className="rounded bg-neutral-200 px-1 py-0.5 text-xs font-mono dark:bg-neutral-700">{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-1 py-1">
      <span className="h-2 w-2 rounded-full bg-neutral-400 animate-bounce dark:bg-neutral-500" style={{ animationDelay: "0ms" }} />
      <span className="h-2 w-2 rounded-full bg-neutral-400 animate-bounce dark:bg-neutral-500" style={{ animationDelay: "150ms" }} />
      <span className="h-2 w-2 rounded-full bg-neutral-400 animate-bounce dark:bg-neutral-500" style={{ animationDelay: "300ms" }} />
    </div>
  );
}
