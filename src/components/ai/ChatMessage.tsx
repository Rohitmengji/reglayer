/**
 * RegLayer — Chat Message
 *
 * Production chat message component with:
 * - Copy to clipboard button
 * - Full markdown: headings, bold, code blocks, inline code, lists
 * - Timestamp display
 * - Clean layout (no bubbles — like ChatGPT/Claude)
 */

"use client";

import { useState } from "react";
import type { ChatMessage as ChatMessageType } from "@/stores/chatStore";
import { MessageSquare, User, Copy, Check } from "lucide-react";

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
      <div className={`flex-1 min-w-0 ${isUser ? "flex justify-end" : ""}`}>
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

          {/* Copy button — visible on hover for assistant messages */}
          {!isUser && message.content && (
            <button
              onClick={handleCopy}
              className="absolute -bottom-6 right-0 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-neutral-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-neutral-600 dark:hover:text-neutral-300"
              aria-label="Copy message"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied" : "Copy"}
            </button>
          )}
        </div>
      </div>
    </div>
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
