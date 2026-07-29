/**
 * RegLayer — Queued Prompt List
 *
 * WHY: A prompt submitted during generation is accepted but not yet running. If that
 *      state is invisible, the user cannot tell whether their message was captured,
 *      lost, or ignored — the exact ambiguity a queue exists to remove.
 *
 * The list answers the three questions a waiting user actually has:
 *      What is happening?   — the header states running / paused and how many.
 *      What happens next?   — position, with the head of the queue named "Next".
 *      How long?            — per-prompt and total estimates, shown only when honest.
 *
 * SCOPE: Prompts here have NOT started generating. Once a prompt starts it becomes a
 *        real message in the transcript and can only be stopped, never edited in place.
 */

"use client";

import { useRef, useState } from "react";
import type { QueuedPrompt } from "@/stores/chatStore";
import {
  estimateTotalWaitMs,
  estimateWaitMs,
  formatWait,
  type QueueStatus,
} from "@/lib/ai/chat/queue";
import { Check, Clock, Pause, Pencil, Play, Trash2, X } from "lucide-react";

/** Stable id of the composer, used to park focus when the queue empties. */
export const COMPOSER_ID = "chat-composer";

interface QueuedPromptsProps {
  prompts: QueuedPrompt[];
  onEdit: (id: string, content: string) => void;
  onRemove: (id: string) => void;
  onPause: () => void;
  onResume: () => void;
  onClear: () => void;
  /** Rolling average run duration. Null suppresses wait estimates entirely. */
  avgRunMs?: number | null;
  queueStatus?: QueueStatus;
}

export function QueuedPrompts({
  prompts,
  onEdit,
  onRemove,
  onPause,
  onResume,
  onClear,
  avgRunMs = null,
  queueStatus = "idle",
}: QueuedPromptsProps) {
  const removeRefs = useRef(new Map<string, HTMLButtonElement>());
  const [confirmingClear, setConfirmingClear] = useState(false);

  if (prompts.length === 0) return null;

  // A paused queue is not counting down, so any wait estimate would be a lie.
  const showWait = queueStatus === "running" && avgRunMs !== null;
  const totalWait = showWait ? estimateTotalWaitMs(prompts.length, avgRunMs) : null;

  /**
   * Removing a row destroys the focused element. Without this, focus falls back to
   * <body> and a keyboard user loses their place in the list entirely.
   */
  const handleRemove = (id: string, index: number) => {
    const nextFocusId = prompts[index + 1]?.id ?? prompts[index - 1]?.id ?? null;
    onRemove(id);
    requestAnimationFrame(() => {
      if (nextFocusId) {
        removeRefs.current.get(nextFocusId)?.focus();
        return;
      }
      // Last prompt removed: this list unmounts, so park focus on the composer.
      document.getElementById(COMPOSER_ID)?.focus();
    });
  };

  const handleClear = () => {
    onClear();
    setConfirmingClear(false);
    requestAnimationFrame(() => document.getElementById(COMPOSER_ID)?.focus());
  };

  return (
    <section
      className="border-t border-neutral-200 px-4 py-2.5 dark:border-neutral-800"
      aria-label="Queued prompts"
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <Clock className="h-3 w-3 text-neutral-400" aria-hidden="true" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          Queued
        </span>
        <span className="text-[10px] text-neutral-400 tabular-nums">{prompts.length}</span>

        {queueStatus === "paused" && (
          <span className="text-[10px] font-medium text-amber-600 dark:text-amber-500">
            · paused
          </span>
        )}
        {totalWait !== null && (
          <span className="text-[10px] tabular-nums text-neutral-400">
            · {formatWait(totalWait)} total
          </span>
        )}

        <div className="ml-auto flex items-center gap-0.5">
          {queueStatus === "running" && (
            <HeaderButton onClick={onPause} label="Pause queue after the current answer">
              <Pause className="h-3 w-3" aria-hidden="true" />
            </HeaderButton>
          )}
          {queueStatus === "paused" && (
            <HeaderButton onClick={onResume} label="Resume queue">
              <Play className="h-3 w-3" aria-hidden="true" />
            </HeaderButton>
          )}

          {confirmingClear ? (
            <>
              <button
                onClick={handleClear}
                className="rounded px-1.5 py-0.5 text-[10px] font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
              >
                Discard {prompts.length}
              </button>
              <HeaderButton onClick={() => setConfirmingClear(false)} label="Keep queued prompts">
                <X className="h-3 w-3" aria-hidden="true" />
              </HeaderButton>
            </>
          ) : (
            <HeaderButton
              onClick={() => setConfirmingClear(true)}
              label={`Clear all ${prompts.length} queued prompts`}
            >
              <Trash2 className="h-3 w-3" aria-hidden="true" />
            </HeaderButton>
          )}
        </div>
      </div>

      <ul className="space-y-1.5">
        {prompts.map((prompt, index) => (
          <QueuedPromptRow
            key={prompt.id}
            prompt={prompt}
            position={index + 1}
            total={prompts.length}
            waitMs={showWait ? estimateWaitMs(index, avgRunMs) : null}
            onEdit={onEdit}
            onRemove={() => handleRemove(prompt.id, index)}
            registerRemoveRef={(el) => {
              if (el) removeRefs.current.set(prompt.id, el);
              else removeRefs.current.delete(prompt.id);
            }}
          />
        ))}
      </ul>
    </section>
  );
}

function HeaderButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-200/60 hover:text-neutral-700 dark:hover:bg-neutral-700 dark:hover:text-neutral-200"
      title={label}
      aria-label={label}
    >
      {children}
    </button>
  );
}

function QueuedPromptRow({
  prompt,
  position,
  total,
  waitMs,
  onEdit,
  onRemove,
  registerRemoveRef,
}: {
  prompt: QueuedPrompt;
  position: number;
  total: number;
  waitMs: number | null;
  onEdit: (id: string, content: string) => void;
  onRemove: () => void;
  registerRemoveRef: (el: HTMLButtonElement | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(prompt.content);
  const editRef = useRef<HTMLTextAreaElement>(null);

  // Screen readers get the full context a sighted user gets from layout alone.
  const describe = `Queued prompt ${position} of ${total}: ${prompt.content}`;

  const commit = () => {
    if (draft.trim() && draft.trim() !== prompt.content) {
      onEdit(prompt.id, draft);
    }
    setEditing(false);
  };

  const cancel = () => {
    setDraft(prompt.content);
    setEditing(false);
  };

  if (editing) {
    return (
      <li className="flex items-start gap-1.5 rounded-lg border border-accent/30 bg-accent/5 px-2.5 py-1.5">
        <textarea
          ref={editRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commit(); }
            // Escape belongs to the editor here; without this it would also close the
            // whole chat panel and discard the edit as a side effect.
            if (e.key === "Escape") { e.stopPropagation(); cancel(); }
          }}
          rows={Math.min(4, draft.split("\n").length)}
          className="flex-1 resize-none bg-transparent text-[12px] text-neutral-800 focus:outline-none dark:text-neutral-200"
          aria-label={`Edit queued prompt ${position} of ${total}. Enter to save, Escape to cancel.`}
        />
        <button
          onClick={commit}
          className="rounded p-1 text-neutral-500 hover:bg-neutral-200/60 hover:text-accent dark:hover:bg-neutral-700"
          title="Save"
          aria-label={`Save queued prompt ${position}`}
        >
          <Check className="h-3 w-3" />
        </button>
        <button
          onClick={cancel}
          className="rounded p-1 text-neutral-500 hover:bg-neutral-200/60 dark:hover:bg-neutral-700"
          title="Cancel edit"
          aria-label={`Cancel editing queued prompt ${position}`}
        >
          <X className="h-3 w-3" />
        </button>
      </li>
    );
  }

  return (
    <li className="group flex items-start gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 dark:border-neutral-700 dark:bg-neutral-800/50">
      <span
        className="mt-0.5 shrink-0 text-[10px] font-medium tabular-nums text-neutral-400"
        aria-hidden="true"
      >
        {position === 1 ? "Next" : `#${position}`}
      </span>
      <p className="flex-1 truncate text-[12px] text-neutral-700 dark:text-neutral-300">
        <span className="sr-only">{describe}</span>
        <span aria-hidden="true">{prompt.content}</span>
      </p>
      {waitMs !== null && (
        <span
          className="mt-0.5 shrink-0 text-[10px] tabular-nums text-neutral-400"
          title="Estimated time until this prompt starts"
        >
          <span className="sr-only">Starts in about </span>
          {formatWait(waitMs)}
        </span>
      )}
      <button
        onClick={() => {
          setEditing(true);
          // Entering edit mode without focus forces a keyboard user to hunt for the field.
          requestAnimationFrame(() => editRef.current?.focus());
        }}
        className="shrink-0 rounded p-1 text-neutral-400 opacity-0 transition-opacity hover:bg-neutral-200/60 hover:text-neutral-700 focus-visible:opacity-100 group-hover:opacity-100 dark:hover:bg-neutral-700"
        title="Edit queued prompt"
        aria-label={`Edit queued prompt ${position} of ${total}`}
      >
        <Pencil className="h-3 w-3" />
      </button>
      <button
        ref={registerRemoveRef}
        onClick={onRemove}
        className="shrink-0 rounded p-1 text-neutral-400 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 focus-visible:opacity-100 group-hover:opacity-100 dark:hover:bg-red-950/30"
        title="Remove from queue"
        aria-label={`Remove queued prompt ${position} of ${total}`}
      >
        <X className="h-3 w-3" />
      </button>
    </li>
  );
}
