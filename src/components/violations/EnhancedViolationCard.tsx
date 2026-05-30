"use client";

/**
 * RegLayer — Enhanced Violation Card (Status Tracking)
 *
 * WHY: The original ViolationCard has a basic status dropdown that posts to audit logs.
 *      This version uses the proper ViolationStatus enum, optimistic updates,
 *      verify-fix button, note dialog, and activity feed.
 *
 * WHAT: Full violation card with:
 *   - Status badge (color-coded, aria-labeled)
 *   - Status dropdown (with note dialog for WONT_FIX/ACCEPTABLE_RISK)
 *   - "Verify Fix" button (re-scans and confirms)
 *   - Activity feed (expandable status history)
 *
 * HOW: Wraps useViolationStatus() hook for optimistic state management.
 *      Uses shadcn Card/Badge/Button patterns for consistency.
 */

import { useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertTriangle,
  ExternalLink,
  CheckCircle2,
  Clock,
  XCircle,
  ShieldAlert,
  Shield,
  Scan,
  ChevronDown,
  History,
  Loader2,
} from "lucide-react";
import { useViolationStatus } from "@/hooks/use-violation-status";
import type { ViolationStatus } from "@/generated/prisma/client";

// ─────────────── Types ───────────────

export interface ViolationCardData {
  id: string;
  ruleId: string;
  impact: string;
  description: string;
  help: string;
  helpUrl: string | null;
  tags: string[];
  wcagCriteria: string | null;
  affectedElements: Array<{ html: string; target: string[]; failureSummary: string }>;
  status: ViolationStatus;
  statusNote: string | null;
  statusUpdatedAt: string | null;
  statusUpdatedBy: string | null;
  statusUpdatedByName: string | null;
  verifiedAt: string | null;
}

interface EnhancedViolationCardProps {
  violation: ViolationCardData;
  /** Optional callback when status changes (for parent list refresh) */
  onStatusChange?: (violationId: string, newStatus: ViolationStatus) => void;
}

// ─────────────── Status Config ───────────────

const STATUS_CONFIG: Record<
  string,
  { label: string; icon: typeof AlertTriangle; badgeClass: string; ariaLabel: string }
> = {
  OPEN: {
    label: "Open",
    icon: AlertTriangle,
    badgeClass: "bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-300",
    ariaLabel: "Status: Open — needs fixing",
  },
  IN_PROGRESS: {
    label: "In Progress",
    icon: Clock,
    badgeClass: "bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300",
    ariaLabel: "Status: In Progress — being worked on",
  },
  FIXED: {
    label: "Fixed",
    icon: CheckCircle2,
    badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300",
    ariaLabel: "Status: Fixed — awaiting verification",
  },
  VERIFIED: {
    label: "Verified",
    icon: CheckCircle2,
    badgeClass: "bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-300",
    ariaLabel: "Status: Verified — confirmed fixed by re-scan",
  },
  WONT_FIX: {
    label: "Won't Fix",
    icon: XCircle,
    badgeClass: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
    ariaLabel: "Status: Won't Fix — intentional decision",
  },
  ACCEPTABLE_RISK: {
    label: "Acceptable Risk",
    icon: Shield,
    badgeClass: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
    ariaLabel: "Status: Acceptable Risk — documented exception",
  },
};

const DROPDOWN_OPTIONS: Array<{ value: ViolationStatus; label: string; requiresNote: boolean }> = [
  { value: "OPEN" as ViolationStatus, label: "Open", requiresNote: false },
  { value: "IN_PROGRESS" as ViolationStatus, label: "In Progress", requiresNote: false },
  { value: "FIXED" as ViolationStatus, label: "Fixed", requiresNote: false },
  { value: "WONT_FIX" as ViolationStatus, label: "Won't Fix", requiresNote: true },
  { value: "ACCEPTABLE_RISK" as ViolationStatus, label: "Acceptable Risk", requiresNote: true },
];

// ─────────────── Main Component ───────────────

export function EnhancedViolationCard({ violation, onStatusChange }: EnhancedViolationCardProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<ViolationStatus | null>(null);
  const [noteText, setNoteText] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  const { state, isUpdating, isVerifying, error, updateStatus, verifyFix } = useViolationStatus(
    violation.id,
    {
      status: violation.status,
      statusNote: violation.statusNote,
      statusUpdatedAt: violation.statusUpdatedAt,
      statusUpdatedBy: violation.statusUpdatedBy,
      verifiedAt: violation.verifiedAt,
    },
    {
      onSuccess: (newStatus) => onStatusChange?.(violation.id, newStatus),
      onError: () => {}, // Error shown via `error` state
    }
  );

  const handleStatusSelect = useCallback(
    (newStatus: ViolationStatus) => {
      setDropdownOpen(false);
      const option = DROPDOWN_OPTIONS.find((o) => o.value === newStatus);
      if (option?.requiresNote) {
        setPendingStatus(newStatus);
        setNoteText("");
        setNoteDialogOpen(true);
      } else {
        updateStatus(newStatus);
      }
    },
    [updateStatus]
  );

  const handleNoteSubmit = useCallback(() => {
    if (!pendingStatus || noteText.trim().length < 10) return;
    updateStatus(pendingStatus, noteText.trim());
    setNoteDialogOpen(false);
    setPendingStatus(null);
    setNoteText("");
  }, [pendingStatus, noteText, updateStatus]);

  const handleVerify = useCallback(() => {
    verifyFix();
  }, [verifyFix]);

  const config = STATUS_CONFIG[state.status] ?? STATUS_CONFIG.OPEN;
  const StatusIcon = config.icon;

  const elements = Array.isArray(violation.affectedElements) ? violation.affectedElements : [];

  return (
    <Card
      className="border-l-4 border-l-transparent relative"
      style={{ borderLeftColor: getImpactColor(violation.impact) }}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1">
            <ShieldAlert
              className="mt-0.5 h-4 w-4 shrink-0"
              style={{ color: getImpactColor(violation.impact) }}
            />
            <div className="flex-1">
              <CardTitle className="text-sm font-medium">{violation.help}</CardTitle>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                {violation.description}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Impact Badge */}
            <Badge variant="outline" className="text-xs capitalize">
              {violation.impact}
            </Badge>

            {/* Status Badge */}
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${config.badgeClass}`}
              aria-label={config.ariaLabel}
              role="status"
            >
              <StatusIcon className="h-3 w-3" />
              {config.label}
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* WCAG Tags */}
        {violation.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {violation.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
            {violation.wcagCriteria && (
              <Badge variant="outline" className="text-xs font-mono">
                {violation.wcagCriteria}
              </Badge>
            )}
          </div>
        )}

        {/* Affected Elements */}
        {elements.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
              {elements.length} affected element{elements.length !== 1 ? "s" : ""}
            </p>
            {elements.slice(0, 2).map((node, i) => (
              <div key={i} className="rounded-md bg-neutral-50 dark:bg-neutral-800 p-2 font-mono text-xs overflow-x-auto">
                <code className="text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap break-all">
                  {node.html}
                </code>
              </div>
            ))}
            {elements.length > 2 && (
              <p className="text-xs text-neutral-500">+{elements.length - 2} more elements</p>
            )}
          </div>
        )}

        {/* Status Note (if WONT_FIX or ACCEPTABLE_RISK) */}
        {state.statusNote && (state.status === "WONT_FIX" || state.status === "ACCEPTABLE_RISK") && (
          <div className="rounded-md bg-neutral-50 dark:bg-neutral-800 px-3 py-2 text-xs text-neutral-600 dark:text-neutral-400 italic">
            Note: {state.statusNote}
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="rounded-md bg-red-50 dark:bg-red-900/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Action Bar */}
        <div className="flex items-center justify-between pt-2 border-t border-neutral-100 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            {/* Status Dropdown */}
            <div className="relative">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                disabled={isUpdating}
                className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-50"
                aria-label="Change status"
                aria-expanded={dropdownOpen}
                aria-haspopup="listbox"
              >
                {isUpdating ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
                Change Status
              </button>

              {dropdownOpen && (
                <div
                  className="absolute left-0 top-full mt-1 z-50 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg py-1 min-w-[160px]"
                  role="listbox"
                  aria-label="Status options"
                >
                  {DROPDOWN_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => handleStatusSelect(opt.value)}
                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-neutral-50 dark:hover:bg-neutral-800 ${
                        state.status === opt.value ? "bg-neutral-100 dark:bg-neutral-800 font-medium" : ""
                      }`}
                      role="option"
                      aria-selected={state.status === opt.value}
                    >
                      {opt.label}
                      {opt.requiresNote && <span className="text-neutral-400 ml-auto">(note)</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Verify Fix Button — only shown when FIXED */}
            {state.status === "FIXED" && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleVerify}
                disabled={isVerifying}
                className="gap-1.5 text-xs"
                aria-label="Verify fix by re-scanning"
              >
                {isVerifying ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Re-scanning...
                  </>
                ) : (
                  <>
                    <Scan className="h-3 w-3" />
                    Verify Fix
                  </>
                )}
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Help Link */}
            {violation.helpUrl && (
              <a
                href={violation.helpUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
              >
                Learn more
                <ExternalLink className="h-3 w-3" />
              </a>
            )}

            {/* History Toggle */}
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
              aria-expanded={showHistory}
              aria-label="Toggle status history"
            >
              <History className="h-3 w-3" />
              History
            </button>
          </div>
        </div>

        {/* Activity Feed (collapsed by default) */}
        {showHistory && (
          <div className="border-t border-neutral-100 dark:border-neutral-800 pt-2 space-y-1.5">
            {state.statusUpdatedAt ? (
              <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                <div className="w-1.5 h-1.5 rounded-full bg-neutral-400" />
                <span>
                  Status changed to <strong>{STATUS_CONFIG[state.status]?.label ?? state.status}</strong>
                  {violation.statusUpdatedByName && ` by ${violation.statusUpdatedByName}`}
                </span>
                <span className="ml-auto text-neutral-400">
                  {formatRelativeTime(state.statusUpdatedAt)}
                </span>
              </div>
            ) : (
              <p className="text-xs text-neutral-400 italic">No status changes yet</p>
            )}
            {state.verifiedAt && (
              <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                <span>Fix verified by re-scan</span>
                <span className="ml-auto text-neutral-400">
                  {formatRelativeTime(state.verifiedAt)}
                </span>
              </div>
            )}
          </div>
        )}
      </CardContent>

      {/* Note Dialog (modal for WONT_FIX / ACCEPTABLE_RISK) */}
      {noteDialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setNoteDialogOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="note-dialog-title"
        >
          <div
            className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-700 shadow-xl p-6 w-full max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="note-dialog-title" className="text-sm font-semibold text-neutral-900 dark:text-white mb-2">
              Add a reason
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4">
              Explain why this violation is being marked as &quot;{pendingStatus === "WONT_FIX" ? "Won't Fix" : "Acceptable Risk"}&quot;.
              This is required for compliance documentation.
            </p>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="e.g., Decorative image — alt text intentionally empty per design system guidelines"
              className="w-full rounded-md border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={3}
              minLength={10}
              autoFocus
            />
            <p className="mt-1 text-xs text-neutral-400">
              {noteText.trim().length}/10 characters minimum
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setNoteDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleNoteSubmit}
                disabled={noteText.trim().length < 10}
              >
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

// ─────────────── Helpers ───────────────

function getImpactColor(impact: string): string {
  switch (impact) {
    case "critical": return "#dc2626";
    case "serious": return "#ea580c";
    case "moderate": return "#ca8a04";
    case "minor": return "#2563eb";
    default: return "#6b7280";
  }
}

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(isoString).toLocaleDateString();
}
