/**
 * RegLayer — Query Planning Engine
 *
 * Decomposes complex user questions into a structured execution plan,
 * then orchestrates multiple retrieval strategies and synthesizes results.
 *
 * INSTEAD OF:
 *   User → RAG → Answer (single-pass, misses nuance)
 *
 * WE DO:
 *   Question → Intent Detection → Plan → Execute Steps → Merge → Synthesize
 *
 * WHY THIS MATTERS:
 *   "Compare our checkout page's accessibility with last month's scan,
 *    identify regressions, and suggest which WCAG criteria we're failing
 *    under the EAA"
 *
 *   Single-pass RAG: retrieves ~5 similar violations, misses the comparison,
 *   regression detection, regulation mapping, and temporal context.
 *
 *   Query Planner: decomposes into 4 sub-queries, runs each against the right
 *   data source (scans, violations, graph, regulations), merges, synthesizes.
 *
 * ARCHITECTURE:
 *   ┌─────────────┐
 *   │   Question   │
 *   └──────┬──────┘
 *          ▼
 *   ┌─────────────┐
 *   │   Classify   │  Intent: comparison | lookup | analysis | multi-step
 *   └──────┬──────┘
 *          ▼
 *   ┌─────────────┐
 *   │    Plan      │  Decompose into sub-queries with data sources
 *   └──────┬──────┘
 *          ▼
 *   ┌─────────────┐
 *   │   Execute    │  Run each step (hybrid search, graph, DB, LLM)
 *   │   (parallel) │
 *   └──────┬──────┘
 *          ▼
 *   ┌─────────────┐
 *   │   Merge      │  Combine results, resolve conflicts, deduplicate
 *   └──────┬──────┘
 *          ▼
 *   ┌─────────────┐
 *   │ Synthesize   │  LLM generates final answer from merged context
 *   └─────────────┘
 *
 * INSPIRED BY:
 *   - Perplexity (decompose → search → synthesize with citations)
 *   - OpenAI Deep Research (multi-step planning + execution)
 *   - Google Gemini Deep Research (iterative research loops)
 *   - LlamaIndex SubQuestionQueryEngine
 *   - Self-Ask (Ofir Press et al., 2022)
 */

import "server-only";

import { complete } from "@/lib/ai/gateway";
import type { ModelId } from "@/lib/ai/gateway/types";

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * User intent — what kind of question is being asked.
 * Determines which planning strategy to use.
 */
export type QueryIntent =
  | "lookup"       // Simple fact retrieval: "What is WCAG 1.4.3?"
  | "comparison"   // Compare two things: "Compare scan A vs scan B"
  | "analysis"     // Deep analysis: "Why is our score dropping?"
  | "multi_step"   // Complex multi-part: "Find violations, group by criteria, suggest fixes"
  | "conversational"; // Casual/follow-up: "Thanks" / "Can you explain more?"

/**
 * A data source the planner can target.
 */
export type DataSource =
  | "violations"   // Hybrid search over violations
  | "scans"        // Scan history and scores
  | "graph"        // Knowledge graph traversal
  | "knowledge"    // Uploaded documents (knowledge base)
  | "regulations"  // WCAG/ADA/EAA regulation lookup
  | "llm";         // Direct LLM knowledge (no retrieval needed)

/**
 * A single step in the execution plan.
 */
export interface PlanStep {
  id: string;
  query: string;           // The sub-query to execute
  source: DataSource;       // Where to search
  dependsOn?: string[];     // Step IDs this depends on (for sequential execution)
  reason: string;           // Why this step is needed (for debugging/observability)
}

/**
 * The full execution plan for a user query.
 */
export interface QueryPlan {
  originalQuery: string;
  intent: QueryIntent;
  steps: PlanStep[];
  synthesisPrompt: string;  // Instructions for final answer synthesis
}

/**
 * Result of executing a single plan step.
 */
export interface StepResult {
  stepId: string;
  source: DataSource;
  data: string;             // Retrieved context (formatted text)
  success: boolean;
  latencyMs: number;
}

/**
 * Final merged context ready for LLM synthesis.
 */
export interface PlanExecutionResult {
  plan: QueryPlan;
  stepResults: StepResult[];
  mergedContext: string;
  totalLatencyMs: number;
}

// ── Intent Classification ─────────────────────────────────────────────────────

/**
 * Classify the user's intent from their query.
 * Fast heuristic — no LLM call needed for most cases.
 */
export function classifyIntent(query: string): QueryIntent {
  const lower = query.toLowerCase().trim();

  // Conversational (short, generic)
  if (lower.length < 15 || /^(hi|hello|hey|thanks|ok|yes|no|sure|got it)\b/.test(lower)) {
    return "conversational";
  }

  // Comparison signals
  if (/\b(compare|versus|vs\.?|differ|between|better|worse|before.*after|after.*before|regression|improved|dropped)\b/.test(lower)) {
    return "comparison";
  }

  // Analysis signals
  if (/\b(why|trend|pattern|root cause|analysis|explain why|deep dive|investigate|correlat|recurring)\b/.test(lower)) {
    return "analysis";
  }

  // Multi-step signals (multiple actions or conjunctions)
  const actionWords = lower.match(/\b(find|list|show|get|check|scan|fix|group|rank|prioritize|suggest|recommend|generate|create|compare|analyze)\b/g);
  if (actionWords && actionWords.length >= 2) {
    return "multi_step";
  }

  // Compound questions (and/then/also)
  if (/\b(and then|and also|first.*then|after that|additionally)\b/.test(lower)) {
    return "multi_step";
  }

  return "lookup";
}

// ── Plan Generation ───────────────────────────────────────────────────────────

/**
 * Generate an execution plan for a query based on its intent.
 *
 * For simple lookups, returns a single step.
 * For complex queries, decomposes into multiple parallel/sequential steps.
 */
export async function generatePlan(query: string): Promise<QueryPlan> {
  const intent = classifyIntent(query);

  // Fast path: simple intents don't need LLM planning
  if (intent === "conversational") {
    return {
      originalQuery: query,
      intent,
      steps: [{ id: "s1", query, source: "llm", reason: "Conversational response — no retrieval needed" }],
      synthesisPrompt: "Respond naturally to the user's message.",
    };
  }

  if (intent === "lookup") {
    return generateLookupPlan(query);
  }

  // Complex intents: use LLM to decompose
  return generateLLMPlan(query, intent);
}

/**
 * Generate a plan for simple lookup queries.
 * Heuristic-based — no LLM call needed.
 */
function generateLookupPlan(query: string): QueryPlan {
  const lower = query.toLowerCase();
  const steps: PlanStep[] = [];

  // Determine which data sources are relevant
  if (/\b(wcag|criterion|criteria|sc \d|regulation|ada|eaa|section 508|en 301)\b/.test(lower)) {
    steps.push({ id: "s1", query, source: "regulations", reason: "Query references specific regulations or WCAG criteria" });
  }

  if (/\b(violation|issue|problem|error|fail|broken|missing|wrong)\b/.test(lower)) {
    steps.push({ id: "s2", query, source: "violations", reason: "Query asks about accessibility violations" });
  }

  if (/\b(scan|score|result|status|history|last|recent|previous)\b/.test(lower)) {
    steps.push({ id: "s3", query, source: "scans", reason: "Query references scan data or history" });
  }

  if (/\b(site|page|url|domain|checkout|homepage|login)\b/.test(lower)) {
    steps.push({ id: "s4", query, source: "graph", reason: "Query references specific site/page — graph traversal for relationships" });
  }

  if (/\b(policy|document|guide|standard|internal)\b/.test(lower)) {
    steps.push({ id: "s5", query, source: "knowledge", reason: "Query references internal documents or policies" });
  }

  // Default: violations + llm if nothing specific matched
  if (steps.length === 0) {
    steps.push(
      { id: "s1", query, source: "violations", reason: "Default: search violations for relevant context" },
      { id: "s2", query, source: "llm", reason: "Supplement with LLM's WCAG knowledge" },
    );
  }

  return {
    originalQuery: query,
    intent: "lookup",
    steps,
    synthesisPrompt: "Answer the user's question using the retrieved context. Cite specific data when available.",
  };
}

/**
 * Use LLM to decompose a complex query into sub-queries.
 * Only called for comparison, analysis, and multi-step intents.
 */
async function generateLLMPlan(query: string, intent: QueryIntent): Promise<QueryPlan> {
  const response = await complete({
    model: "gpt-4o-mini" as ModelId,
    messages: [{
      role: "user",
      content: `You are a query planner for an accessibility compliance platform. Decompose this user question into 2-5 sub-queries that can be executed independently.

Available data sources:
- "violations": Search accessibility violations by description, rule ID, or WCAG criteria
- "scans": Look up scan history, scores, and completion status
- "graph": Traverse relationships (site→scan→violation→WCAG criterion→regulation)
- "knowledge": Search uploaded company documents and policies
- "regulations": Look up WCAG criteria, ADA, EAA, Section 508 requirements
- "llm": Use general knowledge (no data retrieval needed)

User question: "${query}"
Intent type: ${intent}

Respond with ONLY a JSON object:
{
  "steps": [
    { "id": "s1", "query": "sub-query text", "source": "violations", "reason": "why this step", "dependsOn": [] },
    { "id": "s2", "query": "...", "source": "scans", "reason": "...", "dependsOn": ["s1"] }
  ],
  "synthesisPrompt": "Instructions for combining results into a final answer"
}`,
    }],
    temperature: 0.3,
    maxTokens: 500,
    metadata: { feature: "query-planner" },
  });

  if (!response) {
    // Fallback: single-step plan
    return {
      originalQuery: query,
      intent,
      steps: [{ id: "s1", query, source: "violations", reason: "Fallback: LLM planner unavailable" }],
      synthesisPrompt: "Answer the user's question with available context.",
    };
  }

  try {
    const match = response.content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON in response");

    const parsed = JSON.parse(match[0]) as { steps: PlanStep[]; synthesisPrompt: string };

    // Validate and sanitize
    const validSources: DataSource[] = ["violations", "scans", "graph", "knowledge", "regulations", "llm"];
    const steps = parsed.steps
      .filter((s) => validSources.includes(s.source) && s.query && s.id)
      .slice(0, 5); // cap at 5 steps

    return {
      originalQuery: query,
      intent,
      steps: steps.length > 0 ? steps : [{ id: "s1", query, source: "violations", reason: "Fallback" }],
      synthesisPrompt: parsed.synthesisPrompt || "Synthesize a comprehensive answer from all retrieved data.",
    };
  } catch {
    return {
      originalQuery: query,
      intent,
      steps: [{ id: "s1", query, source: "violations", reason: "Fallback: plan parsing failed" }],
      synthesisPrompt: "Answer the user's question with available context.",
    };
  }
}

// ── Plan Execution ────────────────────────────────────────────────────────────

/**
 * Execute a query plan by running each step against its data source.
 *
 * Steps without dependencies run in parallel.
 * Steps with dependencies wait for their prerequisites.
 *
 * Each step calls the appropriate retrieval function and returns
 * formatted text context for LLM synthesis.
 */
export async function executePlan(
  plan: QueryPlan,
  executors: StepExecutors,
): Promise<PlanExecutionResult> {
  const startTime = Date.now();
  const results = new Map<string, StepResult>();

  // Group steps by dependency level
  const levels = topologicalSort(plan.steps);

  for (const level of levels) {
    // Execute all steps in this level in parallel
    const levelResults = await Promise.all(
      level.map(async (step) => {
        const stepStart = Date.now();

        try {
          // Gather context from dependencies
          const depContext = (step.dependsOn ?? [])
            .map((depId) => results.get(depId)?.data ?? "")
            .filter(Boolean)
            .join("\n\n");

          const enrichedQuery = depContext
            ? `${step.query}\n\nContext from previous steps:\n${depContext}`
            : step.query;

          const executor = executors[step.source];
          const data = executor
            ? await executor(enrichedQuery)
            : `[No executor for source "${step.source}"]`;

          return {
            stepId: step.id,
            source: step.source,
            data,
            success: true,
            latencyMs: Date.now() - stepStart,
          };
        } catch (err) {
          return {
            stepId: step.id,
            source: step.source,
            data: `[Error: ${err instanceof Error ? err.message : "step failed"}]`,
            success: false,
            latencyMs: Date.now() - stepStart,
          };
        }
      }),
    );

    for (const result of levelResults) {
      results.set(result.stepId, result);
    }
  }

  // Merge all step results into a single context string
  const stepResults = Array.from(results.values());
  const mergedContext = stepResults
    .filter((r) => r.success && r.data.length > 0)
    .map((r) => `## Source: ${r.source}\n${r.data}`)
    .join("\n\n---\n\n");

  return {
    plan,
    stepResults,
    mergedContext,
    totalLatencyMs: Date.now() - startTime,
  };
}

/**
 * Map of data source → executor function.
 * Callers inject these so the planner stays decoupled from retrieval implementations.
 */
export type StepExecutors = Partial<Record<DataSource, (query: string) => Promise<string>>>;

// ── Topological Sort ──────────────────────────────────────────────────────────

/**
 * Sort plan steps into execution levels respecting dependencies.
 * Steps at the same level can run in parallel.
 */
export function topologicalSort(steps: PlanStep[]): PlanStep[][] {
  const levels: PlanStep[][] = [];
  const resolved = new Set<string>();
  let remaining = [...steps];

  // Safety: max 10 iterations to prevent infinite loops
  for (let i = 0; i < 10 && remaining.length > 0; i++) {
    const level: PlanStep[] = [];
    const stillRemaining: PlanStep[] = [];

    for (const step of remaining) {
      const deps = step.dependsOn ?? [];
      if (deps.every((d) => resolved.has(d))) {
        level.push(step);
      } else {
        stillRemaining.push(step);
      }
    }

    if (level.length === 0) {
      // Circular dependency — force remaining into last level
      levels.push(stillRemaining);
      break;
    }

    levels.push(level);
    for (const step of level) {
      resolved.add(step.id);
    }
    remaining = stillRemaining;
  }

  return levels;
}

// ── Synthesis ─────────────────────────────────────────────────────────────────

/**
 * Format the execution result into context for LLM synthesis.
 * Includes the plan's synthesis prompt + merged data from all steps.
 */
export function buildSynthesisContext(result: PlanExecutionResult): string {
  const header = `You executed a ${result.plan.steps.length}-step research plan to answer: "${result.plan.originalQuery}"`;

  const stepSummary = result.stepResults
    .map((r) => `- Step ${r.stepId} (${r.source}): ${r.success ? "✓" : "✗"} ${r.latencyMs}ms`)
    .join("\n");

  return [
    header,
    "",
    "## Execution Summary",
    stepSummary,
    "",
    "## Retrieved Data",
    result.mergedContext,
    "",
    "## Synthesis Instructions",
    result.plan.synthesisPrompt,
  ].join("\n");
}
