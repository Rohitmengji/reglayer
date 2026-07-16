/**
 * RegLayer — Data Lineage Tracker
 *
 * Every AI answer carries a complete provenance chain showing exactly
 * HOW it was produced: which prompt, what was retrieved, which agent,
 * which model, what tools were called, and what guardrails ran.
 *
 * WHY: Enterprise compliance requires auditability. When a legal team
 * asks "why did the AI say we're ADA compliant?", you need to show:
 *   - The exact prompt template (version 3 of chat-rag)
 *   - The 5 violations retrieved from scan #abc (via hybrid search)
 *   - The graph path: site→scan→violation→WCAG 1.4.3
 *   - The model: gpt-4o-mini (temperature 0.3)
 *   - The guardrails that passed (no hallucination detected)
 *   - The user profile that personalized the response
 *
 * ARCHITECTURE:
 *   Each AI response gets a LineageTrace attached. The trace is:
 *   1. Built incrementally as the pipeline runs
 *   2. Stored with the response for audit
 *   3. Displayed in the UI as an expandable provenance chain
 *   4. Queryable via API for compliance reporting
 *
 * INSPIRED BY:
 *   - MLflow (model lineage tracking)
 *   - OpenLineage (data pipeline provenance)
 *   - LangSmith (LLM call tracing)
 *   - Weights & Biases (experiment tracking)
 *   - Anthropic's trace logging
 */

import "server-only";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LineageTrace {
  /** Unique trace ID for this response */
  traceId: string;
  /** When the trace started */
  timestamp: string;
  /** Total pipeline duration */
  totalMs: number;

  /** The stages that produced this response, in order */
  stages: LineageStage[];

  /** Summary for quick display */
  summary: LineageSummary;
}

export interface LineageStage {
  /** Stage name */
  name: string;
  /** Stage category */
  category: "input" | "retrieval" | "processing" | "generation" | "validation" | "output";
  /** Duration of this stage */
  durationMs: number;
  /** What this stage produced/consumed */
  details: Record<string, unknown>;
  /** Whether this stage succeeded */
  success: boolean;
  /** Optional error message */
  error?: string;
}

export interface LineageSummary {
  promptId: string;
  promptVersion: number;
  model: string;
  provider: string;
  retrievalSources: string[];
  documentsRetrieved: number;
  toolsCalled: string[];
  guardrailsPassed: string[];
  guardrailsWarned: string[];
  cached: boolean;
  totalTokens: number;
  costUsd: number;
}

// ── Trace Builder ─────────────────────────────────────────────────────────────

/**
 * Builder for constructing lineage traces incrementally.
 * Each pipeline stage calls addStage() as it runs.
 */
export class LineageBuilder {
  private traceId: string;
  private startTime: number;
  private stages: LineageStage[] = [];
  private summaryData: Partial<LineageSummary> = {};

  constructor(traceId?: string) {
    this.traceId = traceId ?? generateTraceId();
    this.startTime = Date.now();
  }

  /** Add a pipeline stage to the trace */
  addStage(stage: Omit<LineageStage, "durationMs"> & { durationMs?: number }): this {
    this.stages.push({
      durationMs: 0,
      ...stage,
    });
    return this;
  }

  /** Record the input query */
  recordInput(query: string, userId: string, workspaceId: string): this {
    this.addStage({
      name: "user-input",
      category: "input",
      success: true,
      details: {
        query: query.slice(0, 200),
        userId,
        workspaceId,
        queryLength: query.length,
      },
    });
    return this;
  }

  /** Record cache check result */
  recordCache(hit: boolean, layer?: string, durationMs?: number): this {
    this.addStage({
      name: "cache-check",
      category: "retrieval",
      durationMs,
      success: true,
      details: { hit, layer: layer ?? "none" },
    });
    this.summaryData.cached = hit;
    return this;
  }

  /** Record retrieval results */
  recordRetrieval(opts: {
    source: string;
    resultCount: number;
    durationMs: number;
    details?: Record<string, unknown>;
  }): this {
    this.addStage({
      name: `retrieve-${opts.source}`,
      category: "retrieval",
      durationMs: opts.durationMs,
      success: true,
      details: {
        source: opts.source,
        resultCount: opts.resultCount,
        ...opts.details,
      },
    });

    if (!this.summaryData.retrievalSources) this.summaryData.retrievalSources = [];
    this.summaryData.retrievalSources.push(opts.source);
    this.summaryData.documentsRetrieved = (this.summaryData.documentsRetrieved ?? 0) + opts.resultCount;
    return this;
  }

  /** Record context compression */
  recordCompression(opts: {
    inputTokens: number;
    outputTokens: number;
    chunksIn: number;
    chunksOut: number;
    durationMs: number;
  }): this {
    this.addStage({
      name: "context-compression",
      category: "processing",
      durationMs: opts.durationMs,
      success: true,
      details: {
        inputTokens: opts.inputTokens,
        outputTokens: opts.outputTokens,
        ratio: opts.inputTokens > 0 ? (opts.outputTokens / opts.inputTokens).toFixed(2) : "N/A",
        chunksIn: opts.chunksIn,
        chunksOut: opts.chunksOut,
      },
    });
    return this;
  }

  /** Record prompt selection */
  recordPrompt(promptId: string, version: number): this {
    this.addStage({
      name: "prompt-selection",
      category: "processing",
      success: true,
      details: { promptId, version },
    });
    this.summaryData.promptId = promptId;
    this.summaryData.promptVersion = version;
    return this;
  }

  /** Record LLM generation */
  recordGeneration(opts: {
    model: string;
    provider: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    durationMs: number;
    temperature: number;
  }): this {
    this.addStage({
      name: "llm-generation",
      category: "generation",
      durationMs: opts.durationMs,
      success: true,
      details: {
        model: opts.model,
        provider: opts.provider,
        inputTokens: opts.inputTokens,
        outputTokens: opts.outputTokens,
        costUsd: opts.costUsd,
        temperature: opts.temperature,
      },
    });
    this.summaryData.model = opts.model;
    this.summaryData.provider = opts.provider;
    this.summaryData.totalTokens = opts.inputTokens + opts.outputTokens;
    this.summaryData.costUsd = opts.costUsd;
    return this;
  }

  /** Record tool calls */
  recordToolCall(toolName: string, durationMs: number, success: boolean, result?: string): this {
    this.addStage({
      name: `tool-${toolName}`,
      category: "generation",
      durationMs,
      success,
      details: { tool: toolName, resultPreview: result?.slice(0, 100) },
    });
    if (!this.summaryData.toolsCalled) this.summaryData.toolsCalled = [];
    this.summaryData.toolsCalled.push(toolName);
    return this;
  }

  /** Record guardrail results */
  recordGuardrails(results: Array<{ guardId: string; severity: string; reason?: string }>): this {
    const passed: string[] = [];
    const warned: string[] = [];

    for (const r of results) {
      if (r.severity === "pass") passed.push(r.guardId);
      else if (r.severity === "warn") warned.push(r.guardId);
    }

    this.addStage({
      name: "guardrails",
      category: "validation",
      success: true,
      details: {
        total: results.length,
        passed: passed.length,
        warned: warned.length,
        warnings: results.filter((r) => r.severity === "warn").map((r) => `${r.guardId}: ${r.reason}`),
      },
    });

    this.summaryData.guardrailsPassed = passed;
    this.summaryData.guardrailsWarned = warned;
    return this;
  }

  /** Record agent delegation */
  recordAgentHandoff(fromAgent: string, toAgent: string, task: string): this {
    this.addStage({
      name: `handoff-${fromAgent}-to-${toAgent}`,
      category: "processing",
      success: true,
      details: { from: fromAgent, to: toAgent, task: task.slice(0, 100) },
    });
    return this;
  }

  /** Record the final output */
  recordOutput(responseLength: number): this {
    this.addStage({
      name: "response-delivered",
      category: "output",
      success: true,
      details: { responseLength },
    });
    return this;
  }

  /** Build the final trace */
  build(): LineageTrace {
    const totalMs = Date.now() - this.startTime;

    return {
      traceId: this.traceId,
      timestamp: new Date(this.startTime).toISOString(),
      totalMs,
      stages: this.stages,
      summary: {
        promptId: this.summaryData.promptId ?? "unknown",
        promptVersion: this.summaryData.promptVersion ?? 0,
        model: this.summaryData.model ?? "unknown",
        provider: this.summaryData.provider ?? "unknown",
        retrievalSources: this.summaryData.retrievalSources ?? [],
        documentsRetrieved: this.summaryData.documentsRetrieved ?? 0,
        toolsCalled: this.summaryData.toolsCalled ?? [],
        guardrailsPassed: this.summaryData.guardrailsPassed ?? [],
        guardrailsWarned: this.summaryData.guardrailsWarned ?? [],
        cached: this.summaryData.cached ?? false,
        totalTokens: this.summaryData.totalTokens ?? 0,
        costUsd: this.summaryData.costUsd ?? 0,
      },
    };
  }

  /** Get the trace ID (for attaching to response headers) */
  getTraceId(): string {
    return this.traceId;
  }
}

// ── Display Formatting ────────────────────────────────────────────────────────

/**
 * Format a lineage trace as a human-readable provenance chain.
 * Used in the UI's "How was this answer generated?" expandable section.
 */
export function formatLineageChain(trace: LineageTrace): string {
  const lines: string[] = [
    `Trace: ${trace.traceId}`,
    `Time: ${trace.timestamp} (${trace.totalMs}ms)`,
    "",
    "Pipeline:",
  ];

  for (const stage of trace.stages) {
    const icon = stage.success ? "✓" : "✗";
    const duration = stage.durationMs > 0 ? ` (${stage.durationMs}ms)` : "";
    const category = `[${stage.category}]`;
    lines.push(`  ${icon} ${category.padEnd(14)} ${stage.name}${duration}`);

    // Show key details
    for (const [key, value] of Object.entries(stage.details)) {
      if (value !== undefined && value !== null && value !== "") {
        const displayValue = typeof value === "object" ? JSON.stringify(value) : String(value);
        if (displayValue.length < 80) {
          lines.push(`                     ${key}: ${displayValue}`);
        }
      }
    }
  }

  lines.push("");
  lines.push("Summary:");
  lines.push(`  Model: ${trace.summary.model} (${trace.summary.provider})`);
  lines.push(`  Prompt: ${trace.summary.promptId} v${trace.summary.promptVersion}`);
  if (trace.summary.retrievalSources.length > 0) {
    lines.push(`  Sources: ${trace.summary.retrievalSources.join(", ")} (${trace.summary.documentsRetrieved} docs)`);
  }
  if (trace.summary.toolsCalled.length > 0) {
    lines.push(`  Tools: ${trace.summary.toolsCalled.join(", ")}`);
  }
  lines.push(`  Guardrails: ${trace.summary.guardrailsPassed.length} passed, ${trace.summary.guardrailsWarned.length} warned`);
  lines.push(`  Tokens: ${trace.summary.totalTokens} | Cost: $${trace.summary.costUsd.toFixed(4)}`);
  if (trace.summary.cached) lines.push(`  Cache: HIT`);

  return lines.join("\n");
}

/**
 * Compact summary for API response headers.
 */
export function traceToHeaders(trace: LineageTrace): Record<string, string> {
  return {
    "X-Trace-Id": trace.traceId,
    "X-Model": trace.summary.model,
    "X-Prompt": `${trace.summary.promptId}@v${trace.summary.promptVersion}`,
    "X-Sources": trace.summary.retrievalSources.join(",") || "none",
    "X-Tokens": String(trace.summary.totalTokens),
    "X-Cost-Usd": trace.summary.costUsd.toFixed(6),
    "X-Latency-Ms": String(trace.totalMs),
    "X-Cached": String(trace.summary.cached),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateTraceId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `tr_${timestamp}_${random}`;
}
