"use client";

/**
 * RegLayer — AI Explainability Panel
 *
 * Shows the full provenance chain for an AI response:
 * - Which model was used
 * - What documents were retrieved
 * - Which tools were called
 * - Whether cache was hit
 * - Cost and latency
 * - Guardrails status
 *
 * INSPIRED BY: Perplexity's source cards, Claude's thinking blocks
 */

import { useState } from "react";
import type { MessageLineage } from "@/stores/chatStore";
import {
  Brain, Database, Shield, Zap, Clock, DollarSign,
  ChevronDown, ChevronUp, Cpu, Search, CheckCircle2, AlertTriangle,
} from "lucide-react";

interface ExplainabilityPanelProps {
  lineage: MessageLineage;
}

export function ExplainabilityPanel({ lineage }: ExplainabilityPanelProps) {
  const [expanded, setExpanded] = useState(false);

  // An answer is "grounded" when the retrieval pipeline actually returned context.
  // The server already computes this (isRAGAugmented) — it just never reached the user.
  const isGrounded = lineage.documentsRetrieved > 0;
  const warnings = lineage.guardrailsWarned ?? [];
  const hasWarnings = warnings.length > 0;

  return (
    <div className="mt-2">
      {/*
        WHY THIS IS ALWAYS VISIBLE, NOT BEHIND THE EXPANDER:
        A fact-check warning (e.g. a fabricated WCAG criterion) is the highest-stakes
        signal this product produces. It used to render only inside the collapsed
        panel, so the one thing a user most needs to see required a deliberate click.
        Streaming means we cannot retract the text — the least we can do is label it.
      */}
      {hasWarnings && (
        <div
          role="status"
          className="mb-1.5 flex items-start gap-1.5 rounded-md border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/30 px-2 py-1.5 text-[11px] text-amber-800 dark:text-amber-200"
        >
          <AlertTriangle className="h-3 w-3 mt-px shrink-0" aria-hidden="true" />
          <span>
            <span className="font-medium">Automated check flagged this answer</span>
            {" — "}
            {warnings.includes("wcag-fact-check") || warnings.includes("wcag-hallucination")
              ? "it may cite a standard incorrectly. Verify against the source before relying on it."
              : "review before relying on it."}
          </span>
        </div>
      )}

      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
      >
        <Brain className="h-3 w-3" aria-hidden="true" />
        <span>
          {lineage.model.split("/").pop()} · {lineage.cached ? "cached" : `${lineage.latencyMs}ms`}
          {" · "}
          {/*
            Grounding is stated in BOTH directions on purpose. Previously the source
            count appeared only when sources existed, so a grounded answer and a purely
            model-generated one looked identical. For a compliance tool that difference
            is the difference between citable and not — absence of a signal is not a signal.
          */}
          {isGrounded ? (
            <span className="text-emerald-600 dark:text-emerald-400">
              grounded in {lineage.documentsRetrieved} source{lineage.documentsRetrieved === 1 ? "" : "s"}
            </span>
          ) : (
            <span className="text-neutral-500 dark:text-neutral-400">
              general guidance — not from your data
            </span>
          )}
        </span>
        {expanded ? <ChevronUp className="h-3 w-3" aria-hidden="true" /> : <ChevronDown className="h-3 w-3" aria-hidden="true" />}
      </button>

      {expanded && (
        <div className="mt-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 p-3 space-y-3">
          {/* Model & Provider */}
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <Cpu className="h-3 w-3 text-blue-500" />
              <span className="font-medium">{lineage.model}</span>
            </div>
            <span className="text-muted-foreground">via {lineage.provider}</span>
          </div>

          {/* Metrics Row */}
          <div className="grid grid-cols-4 gap-2">
            <MetricBadge
              icon={Clock}
              label="Latency"
              value={`${lineage.latencyMs}ms`}
              color="text-amber-500"
            />
            <MetricBadge
              icon={Zap}
              label="Tokens"
              value={lineage.totalTokens.toLocaleString()}
              color="text-blue-500"
            />
            <MetricBadge
              icon={DollarSign}
              label="Cost"
              value={`$${lineage.costUsd.toFixed(4)}`}
              color="text-emerald-500"
            />
            <MetricBadge
              icon={Database}
              label="Sources"
              value={String(lineage.documentsRetrieved)}
              color="text-violet-500"
            />
          </div>

          {/* Retrieval Sources */}
          {lineage.retrievalSources.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
                <Search className="h-2.5 w-2.5" /> Retrieval Pipeline
              </p>
              <div className="flex flex-wrap gap-1.5">
                {lineage.retrievalSources.map((src) => (
                  <span
                    key={src}
                    className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[10px]"
                  >
                    {src.replace("retrieve-", "")}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Tools Called */}
          {lineage.toolsCalled.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
                <Zap className="h-2.5 w-2.5" /> Tools Used
              </p>
              <div className="flex flex-wrap gap-1.5">
                {lineage.toolsCalled.map((tool) => (
                  <span
                    key={tool}
                    className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-[10px]"
                  >
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Guardrails */}
          {(lineage.guardrailsPassed.length > 0 || (lineage.guardrailsWarned?.length ?? 0) > 0) && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
                <Shield className="h-2.5 w-2.5" /> Guardrails
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(lineage.guardrailsWarned ?? []).map((guard) => (
                  <span
                    key={guard}
                    className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-[10px] flex items-center gap-0.5"
                  >
                    <AlertTriangle className="h-2.5 w-2.5" /> {guard}
                  </span>
                ))}
                {lineage.guardrailsPassed.map((guard) => (
                  <span
                    key={guard}
                    className="px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-[10px] flex items-center gap-0.5"
                  >
                    <CheckCircle2 className="h-2.5 w-2.5" /> {guard}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Cache Status */}
          {lineage.cached && (
            <div className="flex items-center gap-1.5 text-[11px] text-green-600 dark:text-green-400">
              <Zap className="h-3 w-3" />
              <span>Response served from cache</span>
            </div>
          )}

          {/* Trace ID */}
          <p className="text-[10px] text-muted-foreground font-mono">
            Trace: {lineage.traceId}
          </p>
        </div>
      )}
    </div>
  );
}

function MetricBadge({ icon: Icon, label, value, color }: {
  icon: typeof Clock;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="flex flex-col items-center p-1.5 rounded-md bg-white dark:bg-neutral-900">
      <Icon className={`h-3 w-3 ${color} mb-0.5`} />
      <span className="text-[11px] font-medium">{value}</span>
      <span className="text-[9px] text-muted-foreground">{label}</span>
    </div>
  );
}
