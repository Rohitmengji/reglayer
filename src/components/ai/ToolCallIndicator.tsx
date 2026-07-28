"use client";

/**
 * RegLayer — Tool Call Indicator
 *
 * Shows inline tool invocation cards in chat messages (like ChatGPT's function calls).
 * Expandable to show arguments and results.
 */

import { useState } from "react";
import type { ToolCall } from "@/stores/chatStore";
import { ChevronDown, ChevronRight, Loader2, CheckCircle2, XCircle, Wrench } from "lucide-react";

const TOOL_LABELS: Record<string, string> = {
  getRecentScans: "Looking up recent scans",
  getViolationsForScan: "Fetching violation details",
  explainWcag: "Explaining WCAG criterion",
  searchViolations: "Searching violations",
  scan_website: "Scanning website",
};

interface ToolCallIndicatorProps {
  toolCalls: ToolCall[];
}

export function ToolCallIndicator({ toolCalls }: ToolCallIndicatorProps) {
  if (!toolCalls.length) return null;

  return (
    <div className="space-y-1.5 mb-2">
      {toolCalls.map((tc) => (
        <ToolCallCard key={tc.id} toolCall={tc} />
      ))}
    </div>
  );
}

function ToolCallCard({ toolCall }: { toolCall: ToolCall }) {
  const [expanded, setExpanded] = useState(false);
  const label = TOOL_LABELS[toolCall.name] ?? toolCall.name;

  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
      >
        {toolCall.status === "running" ? (
          <Loader2 className="h-3 w-3 animate-spin text-blue-500 shrink-0" />
        ) : toolCall.status === "completed" ? (
          <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
        ) : (
          <XCircle className="h-3 w-3 text-red-500 shrink-0" />
        )}
        <Wrench className="h-3 w-3 text-muted-foreground shrink-0" />
        <span className="font-medium text-neutral-700 dark:text-neutral-300">{label}</span>
        {toolCall.durationMs != null && (
          <span className="text-muted-foreground ml-auto mr-1">{toolCall.durationMs}ms</span>
        )}
        {expanded ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-2 border-t border-neutral-200 dark:border-neutral-700">
          {/* Arguments */}
          {Object.keys(toolCall.args).length > 0 && (
            <div className="mt-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Input</p>
              <pre className="text-[11px] bg-white dark:bg-neutral-900 rounded p-2 overflow-x-auto">
                {JSON.stringify(toolCall.args, null, 2)}
              </pre>
            </div>
          )}
          {/* Result */}
          {toolCall.result && (
            <div className="mt-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Output</p>
              <pre className="text-[11px] bg-white dark:bg-neutral-900 rounded p-2 overflow-x-auto max-h-40">
                {toolCall.result.length > 500
                  ? toolCall.result.slice(0, 500) + "..."
                  : toolCall.result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
