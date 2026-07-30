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
  Brain, Shield, Zap,
  ChevronDown, ChevronUp, Cpu, Search, CheckCircle2, AlertTriangle,
} from "lucide-react";
import { InfoHint } from "@/components/ui/info-hint";

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
        <div className="mt-1.5 space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-2 text-[11px] dark:border-neutral-700 dark:bg-neutral-800/50">
          {/*
            DENSE BY DESIGN. This panel sits under every answer in a 420px drawer, so
            its height is borrowed from the thing the user actually came for. The old
            layout spent ~90px on a four-tile grid that stacked icon/value/label three
            deep to show four numbers, then repeated the model and latency that the
            collapsed trigger above already states. Detail belongs here; repetition
            does not.
          */}
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <Cpu className="h-3 w-3 shrink-0 text-blue-500" aria-hidden="true" />
            <span className="font-medium">{lineage.model}</span>
            <span className="text-muted-foreground">via {lineage.provider}</span>
          </div>

          <p className="text-muted-foreground">
            {lineage.latencyMs.toLocaleString()} ms
            {" · "}
            {lineage.totalTokens.toLocaleString()} tokens
            {/*
              Cost is shown only when we actually have one. The chat route records
              costUsd: 0 at stream start and never revises it, so printing "$0.0000"
              here asserted that a paid model call was free. An omitted figure is
              honest about not knowing; a zero is not.
            */}
            {lineage.costUsd > 0 && ` · ${formatCost(lineage.costUsd)}`}
            {" · "}
            {lineage.documentsRetrieved} source{lineage.documentsRetrieved === 1 ? "" : "s"}
          </p>

          {/* Retrieval Sources */}
          {lineage.retrievalSources.length > 0 && (
            <p className="flex flex-wrap items-center gap-1 text-[10px]">
              <Search className="h-2.5 w-2.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="sr-only">Retrieval pipeline:</span>
              {lineage.retrievalSources.map((src) => (
                <span
                  key={src}
                  className="rounded-full bg-blue-100 px-1.5 py-0.5 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                >
                  {src.replace("retrieve-", "")}
                </span>
              ))}
            </p>
          )}

          {/* Tools Called */}
          {lineage.toolsCalled.length > 0 && (
            <p className="flex flex-wrap items-center gap-1 text-[10px]">
              <Zap className="h-2.5 w-2.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="sr-only">Tools used:</span>
              {lineage.toolsCalled.map((tool) => (
                <span
                  key={tool}
                  className="rounded-full bg-amber-100 px-1.5 py-0.5 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                >
                  {tool}
                </span>
              ))}
            </p>
          )}

          {/*
            Guardrails: failures are pills, passes are a sentence.
            Every check passing is the normal case, and rendering it as five green
            badges wrapped over three rows gave the loudest treatment in the panel to
            the least informative state — while burying the one row that means
            something. The names are still listed, just not shouted.
          */}
          {(hasWarnings || lineage.guardrailsPassed.length > 0) && (
            <div className="space-y-1">
              {hasWarnings && (
                <p className="flex flex-wrap items-center gap-1 text-[10px]">
                  <Shield className="h-2.5 w-2.5 shrink-0 text-amber-600" aria-hidden="true" />
                  <span className="sr-only">Checks that flagged this answer:</span>
                  {warnings.map((guard) => (
                    <span
                      key={guard}
                      className="flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                    >
                      <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" /> {guard}
                    </span>
                  ))}
                </p>
              )}
              {lineage.guardrailsPassed.length > 0 && (
                <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <CheckCircle2 className="h-2.5 w-2.5 shrink-0 text-emerald-500" aria-hidden="true" />
                  <span>
                    {lineage.guardrailsPassed.length} check
                    {lineage.guardrailsPassed.length === 1 ? "" : "s"} passed
                  </span>
                  {/*
                    The names sit behind a hint rather than inline. Spelled out they run
                    to ~100 characters and wrap onto a second line purely to report that
                    nothing happened. InfoHint is used instead of a `title` attribute
                    because it opens on keyboard focus as well as hover and is wired up
                    with aria-describedby; a native title reaches neither keyboard nor
                    touch users.
                  */}
                  <InfoHint
                    side="top"
                    label="Which checks passed"
                    content={lineage.guardrailsPassed.join(", ")}
                  />
                </p>
              )}
            </div>
          )}

          {/* Cache Status */}
          {lineage.cached && (
            <p className="flex items-center gap-1.5 text-[11px] text-green-600 dark:text-green-400">
              <Zap className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span>Response served from cache</span>
            </p>
          )}

          {/* Trace ID — a support artefact, so it gets the quietest treatment. */}
          <p className="truncate font-mono text-[10px] text-muted-foreground/70" title={lineage.traceId}>
            {lineage.traceId}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * A single chat turn costs a fraction of a cent, so `toFixed(4)` rendered "$0.0000"
 * on essentially every answer — a number that looks like a bug rather than a cost.
 */
function formatCost(usd: number): string {
  return usd < 0.0001 ? "<$0.0001" : `$${usd.toFixed(4)}`;
}
