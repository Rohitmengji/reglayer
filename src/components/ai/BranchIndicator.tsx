"use client";

/**
 * RegLayer — Conversation Branch Indicator
 *
 * Shows fork points in conversation (where user edited + resent).
 * Allows navigating between branches of the conversation tree.
 *
 * INSPIRED BY: ChatGPT's < 1/3 > branch navigation arrows
 */

import { useState } from "react";
import { GitBranch, ChevronLeft, ChevronRight } from "lucide-react";
import type { ChatMessage } from "@/stores/chatStore";

interface BranchIndicatorProps {
  message: ChatMessage;
  /** Number of versions for this position in the conversation */
  totalVersions: number;
  /** Current version index (0-based) */
  currentVersion: number;
  /** Navigate to a different version */
  onSwitchVersion: (index: number) => void;
}

export function BranchIndicator({ totalVersions, currentVersion, onSwitchVersion }: BranchIndicatorProps) {
  if (totalVersions <= 1) return null;

  return (
    <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-1">
      <GitBranch className="h-3 w-3" />
      <button
        onClick={() => onSwitchVersion(Math.max(0, currentVersion - 1))}
        disabled={currentVersion === 0}
        className="p-0.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-30"
      >
        <ChevronLeft className="h-3 w-3" />
      </button>
      <span className="font-mono">{currentVersion + 1}/{totalVersions}</span>
      <button
        onClick={() => onSwitchVersion(Math.min(totalVersions - 1, currentVersion + 1))}
        disabled={currentVersion === totalVersions - 1}
        className="p-0.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-30"
      >
        <ChevronRight className="h-3 w-3" />
      </button>
    </div>
  );
}

/**
 * Conversation Tree Manager
 *
 * Tracks edit history to enable branch navigation.
 * Each time a user edits a message, a new branch is created.
 */
export interface ConversationBranch {
  id: string;
  parentMessageId: string;
  messages: ChatMessage[];
  createdAt: number;
}

export function useConversationBranches() {
  const [branches, setBranches] = useState<Map<string, ConversationBranch[]>>(new Map());

  const recordBranch = (parentMessageId: string, branchMessages: ChatMessage[]) => {
    setBranches((prev) => {
      const next = new Map(prev);
      const existing = next.get(parentMessageId) ?? [];
      existing.push({
        id: crypto.randomUUID(),
        parentMessageId,
        messages: branchMessages,
        createdAt: Date.now(),
      });
      next.set(parentMessageId, existing);
      return next;
    });
  };

  const getBranches = (parentMessageId: string): ConversationBranch[] => {
    return branches.get(parentMessageId) ?? [];
  };

  const getBranchCount = (parentMessageId: string): number => {
    return (branches.get(parentMessageId)?.length ?? 0) + 1; // +1 for current
  };

  return { recordBranch, getBranches, getBranchCount };
}
