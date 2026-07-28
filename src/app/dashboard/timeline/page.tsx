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

  const fetchEvents = useCallback(async (pageNum: number, append: boolean) => {
    if (pageNum === 1) setLoading(true);
    else setLoadingMore(true);

    try {
      const params = new URLSearchParams({ page: String(pageNum), limit: "30" });
      if (activeFilter) params.set("type", activeFilter);

      const res = await fetch(`/api/ai/timeline?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const items = data.events ?? [];
        if (append) {
          setEvents((prev) => [...prev, ...items]);
        } else {
          setEvents(items);
        }
        setHasMore(items.length >= 30);
      }
    } catch { /* silent */ }
    finally {
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
            Every AI action in your workspace — chat, scans, agents, workflows, decisions — in chronological order.
          </p>
        </div>

        {/* Filters */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <button
            onClick={() => changeFilter(null)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
              !activeFilter
                ? "bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900"
                : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200"
            }`}
          >
            All
          </button>
          {Object.entries(TYPE_CONFIG).map(([type, cfg]) => {
            const Icon = cfg.icon;
            return (
              <button
                key={type}
                onClick={() => changeFilter(type)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors flex items-center gap-1 ${
                  activeFilter === type
                    ? "bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900"
                    : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200"
                }`}
              >
                <Icon className="h-3 w-3" /> {cfg.label}
              </button>
            );
          })}
        </div>

        {/* Timeline */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : events.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Activity className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <h3 className="font-medium">No activity yet</h3>
              <p className="text-sm text-muted-foreground mt-1">
                AI actions will appear here as you use chat, run agents, and execute workflows.
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
                  {loadingMore ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <ChevronDown className="h-3.5 w-3.5 mr-1" />}
                  Load More
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
