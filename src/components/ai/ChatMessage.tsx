/**
 * RegLayer — Chat Message Bubble
 *
 * Renders a single message (user or assistant). Assistant messages support
 * basic markdown-like formatting: **bold**, `code`, and line breaks.
 *
 * WHY NOT FULL MARKDOWN?
 *   A full markdown renderer (react-markdown + remark) adds ~40KB to the
 *   bundle. For the MVP, we support bold, inline code, code blocks, and
 *   line breaks — which covers 90% of LLM output formatting. We can add
 *   react-markdown later when we need tables, lists, and headings.
 */

"use client";

import type { ChatMessage as ChatMessageType } from "@/stores/chatStore";
import { MessageSquare, User } from "lucide-react";

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      {/* Avatar */}
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
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

      {/* Message content */}
      <div
        className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
          isUser
            ? "bg-accent text-white"
            : "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200"
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="whitespace-pre-wrap">
            <FormattedContent content={message.content} />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Lightweight formatter for assistant messages.
 * Handles: **bold**, `inline code`, ```code blocks```, and line breaks.
 * No external dependencies — just string splitting and regex.
 */
function FormattedContent({ content }: { content: string }) {
  if (!content) {
    // Streaming placeholder — animated thinking dots
    return <ThinkingIndicator />;
  }

  // Split by code blocks first (```...```)
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("```") && part.endsWith("```")) {
          // Code block
          const code = part.slice(3, -3).replace(/^\w*\n/, ""); // Remove language hint
          return (
            <pre
              key={i}
              className="my-2 overflow-x-auto rounded-md bg-neutral-900 p-3 text-xs text-neutral-100 dark:bg-neutral-950"
            >
              <code>{code}</code>
            </pre>
          );
        }
        // Inline formatting
        return <InlineFormat key={i} text={part} />;
      })}
    </>
  );
}

function InlineFormat({ text }: { text: string }) {
  // Bold: **text** and inline code: `code`
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={i} className="font-semibold">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code
              key={i}
              className="rounded bg-neutral-200 px-1 py-0.5 text-xs dark:bg-neutral-700"
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

/**
 * Animated thinking indicator — three bouncing dots.
 * Shows while waiting for the first token from the LLM.
 */
function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-1 py-1">
      <span className="h-2 w-2 rounded-full bg-neutral-400 animate-bounce dark:bg-neutral-500" style={{ animationDelay: "0ms" }} />
      <span className="h-2 w-2 rounded-full bg-neutral-400 animate-bounce dark:bg-neutral-500" style={{ animationDelay: "150ms" }} />
      <span className="h-2 w-2 rounded-full bg-neutral-400 animate-bounce dark:bg-neutral-500" style={{ animationDelay: "300ms" }} />
    </div>
  );
}
