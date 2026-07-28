"use client";

/**
 * RegLayer — Proactive Suggestions Card
 *
 * Shows AI-generated actionable suggestions on the dashboard.
 * Dismissible, prioritized, with direct action links.
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Sparkles, AlertTriangle, Shield, TrendingUp, Zap, Lightbulb,
  X, ChevronRight, Loader2,
} from "lucide-react";

interface Suggestion {
  id: string;
  title: string;
  description: string;
  category: "risk" | "compliance" | "performance" | "action" | "insight";
  priority: "critical" | "high" | "medium" | "low";
  actionLabel?: string;
  actionHref?: string;
  dismissible: boolean;
}

const CATEGORY_CONFIG = {
  risk: { icon: AlertTriangle, color: "text-red-500", bg: "bg-red-50 dark:bg-red-950/30", border: "border-red-200 dark:border-red-800" },
  compliance: { icon: Shield, color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-950/30", border: "border-blue-200 dark:border-blue-800" },
  performance: { icon: TrendingUp, color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950/30", border: "border-emerald-200 dark:border-emerald-800" },
  action: { icon: Zap, color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-950/30", border: "border-amber-200 dark:border-amber-800" },
  insight: { icon: Lightbulb, color: "text-violet-500", bg: "bg-violet-50 dark:bg-violet-950/30", border: "border-violet-200 dark:border-violet-800" },
};

const PRIORITY_INDICATOR = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-amber-400",
  low: "bg-neutral-300 dark:bg-neutral-600",
};

export function ProactiveSuggestions() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const stored = localStorage.getItem("reglayer-dismissed-suggestions");
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });

  useEffect(() => {
    fetch("/api/ai/suggestions")
      .then((r) => r.ok ? r.json() : { suggestions: [] })
      .then((data) => setSuggestions(data.suggestions ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleDismiss = (id: string) => {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    try { localStorage.setItem("reglayer-dismissed-suggestions", JSON.stringify([...next])); } catch {}
  };

  const visible = suggestions.filter((s) => !dismissed.has(s.id));

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span>Loading suggestions...</span>
      </div>
    );
  }

  if (visible.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 mb-2">
        <Sparkles className="h-4 w-4 text-accent" />
        <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">AI Suggestions</h3>
      </div>

      {visible.map((suggestion) => {
        const cfg = CATEGORY_CONFIG[suggestion.category];
        const Icon = cfg.icon;

        return (
          <div
            key={suggestion.id}
            className={`relative rounded-lg border ${cfg.border} ${cfg.bg} p-3 transition-all hover:shadow-sm group`}
          >
            {/* Priority indicator */}
            <div className={`absolute top-3 left-0 w-1 h-5 rounded-r ${PRIORITY_INDICATOR[suggestion.priority]}`} />

            <div className="flex items-start gap-3 pl-2">
              <Icon className={`h-4 w-4 ${cfg.color} mt-0.5 shrink-0`} />
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                  {suggestion.title}
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                  {suggestion.description}
                </p>
                {suggestion.actionLabel && suggestion.actionHref && (
                  <Link
                    href={suggestion.actionHref}
                    className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-accent hover:underline"
                  >
                    {suggestion.actionLabel}
                    <ChevronRight className="h-3 w-3" />
                  </Link>
                )}
              </div>
              {suggestion.dismissible && (
                <button
                  onClick={() => handleDismiss(suggestion.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700"
                  title="Dismiss"
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
