"use client";

/**
 * RegLayer — AI Activity Timeline
 *
 * WHY: Users need a single chronological view of ALL AI actions in their workspace:
 *      chat conversations, agent runs, scans, workflow executions, decisions, alerts.
 * WHAT: Filterable, infinite-scroll timeline with activity cards.
 * HOW: Fetches /api/ai/timeline with filters, renders grouped-by-day entries.
 *
 * INSPIRED BY: GitHub Activity feed, Linear's activity timeline, Notion's page history
 */

import { useState, useEffect, useCallback } from "react";
import * as Sentry from "@sentry/nextjs";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FeatureGate } from "@/components/ui/feature-gate";
import {
  Activity, MessageSquare, Bot, Scan, Workflow, Shield,
  Brain, Clock, Loader2, ChevronDown, Zap,
  AlertTriangle, CheckCircle2, XCircle,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TimelineEvent {
  id: string;
  type: "chat" | "agent" | "scan" | "workflow" | "decision" | "alert" | "knowledge";
  action: string;
  title: string;
  description: string;
  metadata: Record<string, unknown>;
  actor: string;
  status: "success" | "error" | "pending" | "info";
  createdAt: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_CONFIG = {
  chat: { icon: MessageSquare, color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-950/30", label: "Chat" },
  agent: { icon: Bot, color: "text-violet-500", bg: "bg-violet-50 dark:bg-violet-950/30", label: "Agent" },
  scan: { icon: Scan, color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950/30", label: "Scan" },
  workflow: { icon: Workflow, color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-950/30", label: "Workflow" },
  decision: { icon: Shield, color: "text-rose-500", bg: "bg-rose-50 dark:bg-rose-950/30", label: "Decision" },
  alert: { icon: AlertTriangle, color: "text-orange-500", bg: "bg-orange-50 dark:bg-orange-950/30", label: "Alert" },
  knowledge: { icon: Brain, color: "text-cyan-500", bg: "bg-cyan-50 dark:bg-cyan-950/30", label: "Knowledge" },
};

// The API (/api/ai/timeline) currently only sources chat, agent, and scan events.
// Only render filters for types the server can actually return — offering
// workflow/decision/alert/knowledge would always show a misleading empty state.
const FILTERABLE_TYPES = ["chat", "agent", "scan"] as const;

const STATUS_ICONS = {
  success: CheckCircle2,
  error: XCircle,
  pending: Clock,
  info: Zap,
};

// ── Component ─────────────────────────────────────────────────────────────────

function TimelinePageInner() {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async (pageNum: number, append: boolean) => {
    if (pageNum === 1) setLoading(true);
    else setLoadingMore(true);

    try {
      const params = new URLSearchParams({ page: String(pageNum), limit: "30" });
      if (activeFilter) params.set("type", activeFilter);

      const res = await fetch(`/api/ai/timeline?${params.toString()}`);
      if (!res.ok) {
        throw new Error(res.status === 429 ? "Rate limited — try again shortly." : "Could not load activity.");
      }
      const data = await res.json();
      const items = data.events ?? [];
      if (append) {
        setEvents((prev) => [...prev, ...items]);
      } else {
        setEvents(items);
      }
      // Trust the server's hasMore rather than re-deriving it from a length
      // heuristic — the server knows whether more rows exist upstream.
      setHasMore(Boolean(data.hasMore));
      setError(null);
    } catch (err) {
      Sentry.captureException(err);
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [activeFilter]);

  useEffect(() => {
    // Initial + filter-change fetch. `fetchEvents` calls `setLoading` synchronously,
    // which the new `react-hooks/set-state-in-effect` rule flags — but data fetching
    // on mount / dep-change is a legitimate use of an effect. Matches the pattern
    // used in dashboard/ai-costs and dashboard/remediation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchEvents(1, false);
  }, [fetchEvents]);

  const changeFilter = (next: string | null) => {
    setActiveFilter(next);
    setPage(1);
  };

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchEvents(next, true);
  };

  // Group events by date
  const groupedEvents = events.reduce<Record<string, TimelineEvent[]>>((acc, event) => {
    const date = new Date(event.createdAt).toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
    if (!acc[date]) acc[date] = [];
    acc[date].push(event);
    return acc;
  }, {});

  return (
    <AppShell>
      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
              <Activity className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">AI Timeline</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1 ml-11">
            Every AI action in your workspace — chat, scans, and agent runs — in chronological order.
          </p>
        </div>

        {/* Filters */}
        <div
          role="group"
          aria-label="Filter activity by type"
          tabIndex={0}
          className="flex gap-1.5 overflow-x-auto pb-1"
        >
          <button
            type="button"
            onClick={() => changeFilter(null)}
            aria-pressed={!activeFilter}
            className={`px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
              !activeFilter
                ? "bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 ring-2 ring-offset-1 ring-neutral-900 dark:ring-neutral-100"
                : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200"
            }`}
          >
            All
          </button>
          {FILTERABLE_TYPES.map((type) => {
            const cfg = TYPE_CONFIG[type];
            const Icon = cfg.icon;
            const active = activeFilter === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => changeFilter(type)}
                aria-pressed={active}
                className={`px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors flex items-center gap-1 ${
                  active
                    ? "bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 ring-2 ring-offset-1 ring-neutral-900 dark:ring-neutral-100"
                    : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200"
                }`}
              >
                <Icon className="h-3 w-3" aria-hidden="true" /> {cfg.label}
              </button>
            );
          })}
        </div>

        {/* Screen-reader announcement of load/filter results — not visually rendered */}
        <p className="sr-only" role="status" aria-live="polite">
          {loading
            ? "Loading activity"
            : error
              ? error
              : `${events.length} ${events.length === 1 ? "activity" : "activities"} shown${activeFilter ? ` for ${TYPE_CONFIG[activeFilter as keyof typeof TYPE_CONFIG]?.label ?? activeFilter}` : ""}`}
        </p>

        {/* Timeline */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden="true" />
            <span className="sr-only">Loading activity</span>
          </div>
        ) : error ? (
          <Card className="border-dashed border-red-200 dark:border-red-900">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center" role="alert">
              <AlertTriangle className="h-10 w-10 text-red-400 mb-3" aria-hidden="true" />
              <h3 className="font-medium">Couldn&apos;t load activity</h3>
              <p className="text-sm text-muted-foreground mt-1">{error}</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => fetchEvents(1, false)}>
                Retry
              </Button>
            </CardContent>
          </Card>
        ) : events.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Activity className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <h3 className="font-medium">No activity yet</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {activeFilter
                  ? `No ${TYPE_CONFIG[activeFilter as keyof typeof TYPE_CONFIG]?.label.toLowerCase() ?? activeFilter} activity yet.`
                  : "AI actions will appear here as you use chat, run agents, and execute scans."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedEvents).map(([date, dayEvents]) => (
              <div key={date}>
                {/* Date header */}
                <div className="sticky top-0 z-10 bg-white/80 dark:bg-neutral-950/80 backdrop-blur-sm py-2 mb-3">
                  <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {date}
                  </h2>
                </div>

                {/* Events for this day */}
                <div className="relative pl-6 border-l-2 border-neutral-200 dark:border-neutral-700 space-y-4">
                  {dayEvents.map((event) => {
                    const cfg = TYPE_CONFIG[event.type];
                    const Icon = cfg.icon;
                    const StatusIcon = STATUS_ICONS[event.status];

                    return (
                      <div key={event.id} className="relative group">
                        {/* Timeline dot */}
                        <div className={`absolute -left-[25px] top-2 w-4 h-4 rounded-full border-2 border-white dark:border-neutral-950 ${cfg.bg} flex items-center justify-center`}>
                          <Icon className={`h-2 w-2 ${cfg.color}`} />
                        </div>

                        {/* Event card */}
                        <Card className="hover:shadow-sm transition-shadow">
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge variant="outline" className={`text-[9px] ${cfg.color}`}>
                                    {cfg.label}
                                  </Badge>
                                  <StatusIcon className={`h-3 w-3 ${
                                    event.status === "success" ? "text-green-500" :
                                    event.status === "error" ? "text-red-500" :
                                    event.status === "pending" ? "text-amber-500" :
                                    "text-blue-500"
                                  }`} />
                                </div>
                                <h3 className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                                  {event.title}
                                </h3>
                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                  {event.description}
                                </p>
                                {/* Metadata pills */}
                                {event.metadata && Object.keys(event.metadata).length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-2">
                                    {Object.entries(event.metadata).slice(0, 4).map(([key, val]) => (
                                      <span key={key} className="px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-800 rounded text-[10px] text-muted-foreground">
                                        {key}: {String(val)}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div className="text-[10px] text-muted-foreground whitespace-nowrap">
                                {new Date(event.createdAt).toLocaleTimeString("en-US", {
                                  hour: "numeric",
                                  minute: "2-digit",
                                })}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Load More */}
            {hasMore && (
              <div className="flex justify-center pt-4">
                <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none mr-1" aria-hidden="true" /> : <ChevronDown className="h-3.5 w-3.5 mr-1" aria-hidden="true" />}
                  {loadingMore ? "Loading more…" : "Load More"}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default function TimelinePage() {
  return (
    <FeatureGate feature="timeline">
      <TimelinePageInner />
    </FeatureGate>
  );
}
