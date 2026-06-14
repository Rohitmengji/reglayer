"use client";

/**
 * ---------------------------------------------------------
 * RegLayer — Violation Card Component
 * ---------------------------------------------------------
 *
 * WHY: Each accessibility violation needs a clear, actionable
 * display that developers can understand and act on.
 *
 * WHAT:
 * - Rule name and description
 * - Impact badge (critical/serious/moderate/minor) with color
 * - WCAG criteria tags
 * - Affected element count
 * - Expandable details: HTML snippets, CSS selectors, fix guidance
 * - Link to axe-core documentation
 *
 * HOW:
 * - Receives AccessibilityViolation as prop
 * - Impact badge uses color-coded Badge component
 * - Collapsible panel for element details (click to expand)
 * - Code blocks rendered in monospace for HTML snippets
 * ---------------------------------------------------------
 */

import { useState, useRef, useEffect, useId } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AccessibilityViolation } from "@/lib/types";
import { AlertTriangle, ExternalLink, CheckCircle2, Clock, XCircle, MinusCircle } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";

interface ViolationCardProps {
  violation: AccessibilityViolation;
}

export function ViolationCard({ violation }: ViolationCardProps) {
  const { t } = useI18n();
  return (
    <Card className="border-l-4 border-l-transparent" style={{
      borderLeftColor: getImpactColor(violation.impact),
    }}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0"
              style={{ color: getImpactColor(violation.impact) }}
            />
            <div>
              <CardTitle className="text-sm font-medium">
                {violation.help}
              </CardTitle>
              <p className="mt-1 text-xs text-neutral-500">
                {violation.description}
              </p>
            </div>
          </div>
          <Badge variant={violation.impact}>
            {violation.impact}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {/* WCAG Tags */}
        <div className="mb-3 flex flex-wrap gap-1">
          {violation.wcagTags.map((tag) => (
            <Badge key={tag} variant="outline" className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>

        {/* Affected Nodes */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
            {t("violationCard.affectedElements", { count: String(violation.nodes.length) })}
          </p>
          {violation.nodes.slice(0, 3).map((node, i) => (
            <div
              key={i}
              className="rounded-md bg-neutral-50 dark:bg-neutral-800 p-2 font-mono text-xs"
            >
              <code className="text-neutral-700 dark:text-neutral-300">{node.html}</code>
              {node.failureSummary && (
                <p className="mt-1 font-sans text-neutral-500 dark:text-neutral-400">
                  {node.failureSummary}
                </p>
              )}
            </div>
          ))}
          {violation.nodes.length > 3 && (
            <p className="text-xs text-neutral-500">
              {t("violationCard.moreElements", { count: String(violation.nodes.length - 3) })}
            </p>
          )}
        </div>

        {/* Help Link + Remediation */}
        <div className="mt-3 flex items-center justify-between">
          <a
            href={violation.helpUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
          >
            {t("violationCard.learnMore")}
            <ExternalLink className="h-3 w-3" />
          </a>
          <RemediationStatus violationId={violation.id} />
        </div>
      </CardContent>
    </Card>
  );
}

const STATUS_OPTIONS = [
  { value: "open", label: "Open", icon: AlertTriangle, color: "text-neutral-500" },
  { value: "in-progress", label: "In Progress", icon: Clock, color: "text-blue-600" },
  { value: "fixed", label: "Fixed", icon: CheckCircle2, color: "text-green-600" },
  { value: "ignored", label: "Ignored", icon: MinusCircle, color: "text-neutral-500 dark:text-neutral-400" },
  { value: "wont-fix", label: "Won't Fix", icon: XCircle, color: "text-red-400" },
] as const;

function RemediationStatus({ violationId }: { violationId: string }) {
  const [status, setStatus] = useState("open");
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const listboxId = `${baseId}-status-listbox`;
  const optionId = (i: number) => `${baseId}-status-option-${i}`;

  const selectedIndex = STATUS_OPTIONS.findIndex((s) => s.value === status);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Seed focused option when opening.
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: seed the focused option when the listbox opens
      setFocusedIndex(selectedIndex >= 0 ? selectedIndex : 0);
    }
  }, [open, selectedIndex]);

  // Keep focused option in view.
  useEffect(() => {
    if (!open || focusedIndex < 0) return;
    const el = listRef.current?.querySelector(`#${CSS.escape(`${baseId}-status-option-${focusedIndex}`)}`);
    el?.scrollIntoView({ block: "nearest" });
  }, [open, focusedIndex, baseId]);

  async function handleChange(newStatus: string) {
    setStatus(newStatus);
    setOpen(false);
    triggerRef.current?.focus();
    await fetch("/api/violations/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ violationId, status: newStatus }),
    }).catch(() => {});
  }

  function closeAndRestore() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setFocusedIndex((i) => Math.min(i + 1, STATUS_OPTIONS.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setFocusedIndex((i) => Math.max(i - 1, 0));
        break;
      case "Home":
        e.preventDefault();
        setFocusedIndex(0);
        break;
      case "End":
        e.preventDefault();
        setFocusedIndex(STATUS_OPTIONS.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (focusedIndex >= 0) handleChange(STATUS_OPTIONS[focusedIndex].value);
        break;
      case "Escape":
        e.preventDefault();
        closeAndRestore();
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  }

  const current = STATUS_OPTIONS.find((s) => s.value === status) || STATUS_OPTIONS[0];
  const Icon = current.icon;

  return (
    <div className="relative" ref={ref}>
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label="Change remediation status"
        aria-activedescendant={open && focusedIndex >= 0 ? optionId(focusedIndex) : undefined}
        className={`inline-flex items-center gap-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 px-2 py-1 text-xs font-medium transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800 ${current.color}`}
      >
        <Icon className="h-3 w-3" />
        {current.label}
      </button>
      {open && (
        <div
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label="Remediation status"
          className="absolute right-0 top-full mt-1 z-50 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg py-1 min-w-35"
        >
          {STATUS_OPTIONS.map((opt, i) => {
            const OptIcon = opt.icon;
            const isSelected = opt.value === status;
            const isFocused = i === focusedIndex;
            return (
              <div
                key={opt.value}
                id={optionId(i)}
                role="option"
                aria-selected={isSelected}
                onClick={() => handleChange(opt.value)}
                onMouseEnter={() => setFocusedIndex(i)}
                className={`flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-xs hover:bg-neutral-50 dark:hover:bg-neutral-800 ${isFocused ? "bg-neutral-50 dark:bg-neutral-800" : ""} ${opt.color}`}
              >
                <OptIcon className="h-3 w-3" />
                {opt.label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function getImpactColor(impact: string): string {
  switch (impact) {
    case "critical":
      return "#dc2626";
    case "serious":
      return "#ea580c";
    case "moderate":
      return "#ca8a04";
    case "minor":
      return "#2563eb";
    default:
      return "#6b7280";
  }
}
