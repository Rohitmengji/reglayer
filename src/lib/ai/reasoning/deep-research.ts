/**
 * RegLayer — Deep Research Mode
 *
 * Multi-step iterative research pipeline that investigates complex compliance
 * questions across multiple sources, discovers follow-up questions from initial
 * findings, and produces a comprehensive report with citations.
 *
 * DIFFERENCE FROM QUERY PLANNER:
 *   Query Planner: decompose → execute once → answer (fast, for chat)
 *   Deep Research: decompose → search → discover → search again → report (thorough)
 *
 * THE LOOP:
 *   1. Plan research questions from user's query
 *   2. For each question: search → extract findings → discover follow-ups
 *   3. Repeat with follow-up questions (max 3 iterations)
 *   4. Synthesize all findings into structured report with citations
 *
 * INSPIRED BY:
 *   - Perplexity Deep Research (iterative web search + synthesis)
 *   - OpenAI Deep Research (multi-step investigation)
 *   - Google Gemini Deep Research (explore → synthesize → report)
 *   - Academic systematic reviews (protocol → search → extract → synthesize)
 */

import "server-only";

import { complete, getDefaultModelId } from "@/lib/ai/gateway";
import type { ModelId } from "@/lib/ai/gateway/types";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DeepResearchConfig {
  /** Max research iterations (follow-up rounds). Default: 3 */
  maxIterations?: number;
  /** Max research questions per iteration. Default: 5 */
  maxQuestionsPerIteration?: number;
  /** Max total findings before stopping. Default: 20 */
  maxFindings?: number;
  /** Include timeline in report. Default: true */
  includeTimeline?: boolean;
  /** Search executor — injected by caller for decoupling */
  searchFn?: (query: string) => Promise<SearchResult[]>;
}

export interface SearchResult {
  content: string;
  source: string;
  relevance: number;
}

export interface ResearchFinding {
  id: string;
  question: string;
  finding: string;
  source: string;
  confidence: number;
  iteration: number;
}

export interface ResearchReport {
  /** The original research question */
  query: string;
  /** Executive summary (2-3 sentences) */
  summary: string;
  /** Findings organized by topic */
  sections: ReportSection[];
  /** Timeline of events (if applicable) */
  timeline: TimelineEvent[];
  /** Actionable recommendations */
  recommendations: string[];
  /** All citations */
  citations: Citation[];
  /** Research metadata */
  metadata: {
    iterations: number;
    questionsExplored: number;
    findingsCount: number;
    totalTokens: number;
    totalCostUsd: number;
    durationMs: number;
  };
}

export interface ReportSection {
  title: string;
  content: string;
  findings: ResearchFinding[];
}

export interface TimelineEvent {
  date: string;
  event: string;
  significance: string;
}

export interface Citation {
  id: number;
  source: string;
  content: string;
  usedIn: string[];
}

// ── Main Entry Point ──────────────────────────────────────────────────────────

/**
 * Run a deep research investigation on a complex question.
 */
export async function deepResearch(
  query: string,
  context?: string,
  config?: DeepResearchConfig,
): Promise<ResearchReport> {
  const startTime = Date.now();
  const maxIter = config?.maxIterations ?? 3;
  const maxQPerIter = config?.maxQuestionsPerIteration ?? 5;
  const maxFindings = config?.maxFindings ?? 20;
  const searchFn = config?.searchFn ?? defaultSearch;
  const model = getDefaultModelId() as ModelId;

  if (!model) {
    return emptyReport(query);
  }

  let totalTokens = 0;
  let totalCost = 0;
  const allFindings: ResearchFinding[] = [];
  const exploredQuestions = new Set<string>();

  // ── Step 1: Plan initial research questions ─────────────────────────────

  const planResult = await complete({
    model,
    messages: [{
      role: "user",
      content: `You are a research planner for accessibility compliance. Break this complex question into ${maxQPerIter} specific, searchable sub-questions.

Research question: "${query}"
${context ? `\nContext:\n${context.slice(0, 1000)}` : ""}

Respond with ONLY a JSON array of strings (the sub-questions):`,
    }],
    temperature: 0.5,
    maxTokens: 300,
    metadata: { feature: "deep-research-plan" },
  });

  totalTokens += planResult?.usage.totalTokens ?? 0;
  totalCost += planResult?.cost.totalCost ?? 0;

  let questions = parseStringArray(planResult?.content);
  if (questions.length === 0) {
    questions = [query]; // fallback to original
  }

  // ── Step 2: Iterative research loop ─────────────────────────────────────

  for (let iteration = 0; iteration < maxIter && allFindings.length < maxFindings; iteration++) {
    const newQuestions = questions.filter((q) => !exploredQuestions.has(q)).slice(0, maxQPerIter);
    if (newQuestions.length === 0) break;

    for (const question of newQuestions) {
      if (allFindings.length >= maxFindings) break;
      exploredQuestions.add(question);

      // Search
      const searchResults = await searchFn(question);

      // Extract findings from search results
      if (searchResults.length > 0) {
        const extractResult = await complete({
          model,
          messages: [{
            role: "user",
            content: `Extract key findings from these search results for the question: "${question}"

Results:
${searchResults.slice(0, 5).map((r, i) => `[${i + 1}] (${r.source}) ${r.content.slice(0, 400)}`).join("\n\n")}

Respond with ONLY a JSON array:
[{ "finding": "key fact or insight", "source": "which result [N]", "confidence": 0.0-1.0 }]`,
          }],
          temperature: 0.2,
          maxTokens: 400,
          metadata: { feature: "deep-research-extract" },
        });

        totalTokens += extractResult?.usage.totalTokens ?? 0;
        totalCost += extractResult?.cost.totalCost ?? 0;

        const extracted = parseFindings(extractResult?.content);
        for (const f of extracted) {
          allFindings.push({
            id: `f${allFindings.length + 1}`,
            question,
            finding: f.finding,
            source: f.source,
            confidence: f.confidence,
            iteration,
          });
        }
      }
    }

    // Discover follow-up questions from findings
    if (iteration < maxIter - 1 && allFindings.length > 0 && allFindings.length < maxFindings) {
      const followUpResult = await complete({
        model,
        messages: [{
          role: "user",
          content: `Based on these research findings, what follow-up questions should we investigate next?

Original question: "${query}"

Findings so far:
${allFindings.slice(-10).map((f) => `- ${f.finding}`).join("\n")}

Already explored:
${[...exploredQuestions].join(", ")}

Suggest 2-3 NEW follow-up questions (not already explored). Respond with ONLY a JSON array of strings:`,
        }],
        temperature: 0.6,
        maxTokens: 200,
        metadata: { feature: "deep-research-followup" },
      });

      totalTokens += followUpResult?.usage.totalTokens ?? 0;
      totalCost += followUpResult?.cost.totalCost ?? 0;

      questions = parseStringArray(followUpResult?.content);
    }
  }

  // ── Step 3: Synthesize report ───────────────────────────────────────────

  const report = await synthesizeReport(query, allFindings, model, config);
  totalTokens += report.tokens;
  totalCost += report.cost;

  return {
    ...report.report,
    metadata: {
      iterations: [...new Set(allFindings.map((f) => f.iteration))].length,
      questionsExplored: exploredQuestions.size,
      findingsCount: allFindings.length,
      totalTokens,
      totalCostUsd: totalCost,
      durationMs: Date.now() - startTime,
    },
  };
}

// ── Report Synthesis ──────────────────────────────────────────────────────────

async function synthesizeReport(
  query: string,
  findings: ResearchFinding[],
  model: ModelId,
  config?: DeepResearchConfig,
): Promise<{ report: Omit<ResearchReport, "metadata">; tokens: number; cost: number }> {
  if (findings.length === 0) {
    return {
      report: {
        query,
        summary: "No findings were discovered during research.",
        sections: [],
        timeline: [],
        recommendations: [],
        citations: [],
      },
      tokens: 0,
      cost: 0,
    };
  }

  const findingsText = findings
    .map((f, i) => `[${i + 1}] ${f.finding} (source: ${f.source}, confidence: ${f.confidence})`)
    .join("\n");

  const timelineInstruction = config?.includeTimeline !== false
    ? '\n  "timeline": [{ "date": "YYYY-MM", "event": "...", "significance": "..." }],'
    : "";

  const result = await complete({
    model,
    messages: [{
      role: "user",
      content: `Synthesize these ${findings.length} research findings into a comprehensive report.

Research question: "${query}"

Findings:
${findingsText}

Write a structured report as JSON:
{
  "summary": "2-3 sentence executive summary",
  "sections": [
    { "title": "Topic area", "content": "Detailed analysis with [N] citation references" }
  ],${timelineInstruction}
  "recommendations": ["Actionable recommendation 1", "..."],
  "citations": [
    { "id": 1, "source": "...", "content": "key quote or fact" }
  ]
}`,
    }],
    temperature: 0.3,
    maxTokens: 2000,
    metadata: { feature: "deep-research-synthesize" },
  });

  const tokens = result?.usage.totalTokens ?? 0;
  const cost = result?.cost.totalCost ?? 0;

  try {
    const match = result?.content?.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON");
    const parsed = JSON.parse(match[0]);

    return {
      report: {
        query,
        summary: parsed.summary ?? "",
        sections: (parsed.sections ?? []).map((s: Record<string, unknown>) => ({
          title: s.title ?? "",
          content: s.content ?? "",
          findings: findings.filter((f) => String(s.content ?? "").includes(f.finding.slice(0, 30))),
        })),
        timeline: parsed.timeline ?? [],
        recommendations: parsed.recommendations ?? [],
        citations: (parsed.citations ?? []).map((c: Record<string, unknown>, i: number) => ({
          id: (c.id as number) ?? i + 1,
          source: (c.source as string) ?? "",
          content: (c.content as string) ?? "",
          usedIn: [],
        })),
      },
      tokens,
      cost,
    };
  } catch {
    return {
      report: {
        query,
        summary: result?.content?.slice(0, 200) ?? "Synthesis failed.",
        sections: [{ title: "Research Findings", content: result?.content ?? "", findings }],
        timeline: [],
        recommendations: [],
        citations: findings.map((f, i) => ({ id: i + 1, source: f.source, content: f.finding.slice(0, 100), usedIn: [] })),
      },
      tokens,
      cost,
    };
  }
}

// ── Default Search (stub) ─────────────────────────────────────────────────────

async function defaultSearch(_query: string): Promise<SearchResult[]> {
  // In production, this would call hybridSearch + searchKnowledge + web search.
  // Callers inject their own searchFn via config to avoid circular imports.
  return [];
}

// ── Report Formatting ─────────────────────────────────────────────────────────

/**
 * Format a research report as markdown for display.
 */
export function formatReport(report: ResearchReport): string {
  const lines: string[] = [];

  lines.push(`# Research Report\n`);
  lines.push(`**Question:** ${report.query}\n`);
  lines.push(`## Executive Summary\n${report.summary}\n`);

  for (const section of report.sections) {
    lines.push(`## ${section.title}\n${section.content}\n`);
  }

  if (report.timeline.length > 0) {
    lines.push(`## Timeline\n`);
    for (const event of report.timeline) {
      lines.push(`- **${event.date}**: ${event.event} — *${event.significance}*`);
    }
    lines.push("");
  }

  if (report.recommendations.length > 0) {
    lines.push(`## Recommendations\n`);
    for (const rec of report.recommendations) {
      lines.push(`- ${rec}`);
    }
    lines.push("");
  }

  if (report.citations.length > 0) {
    lines.push(`## Citations\n`);
    for (const cite of report.citations) {
      lines.push(`[${cite.id}] ${cite.source}: ${cite.content}`);
    }
    lines.push("");
  }

  lines.push(`---\n*Research: ${report.metadata.questionsExplored} questions explored, ${report.metadata.findingsCount} findings, ${report.metadata.iterations} iterations, ${report.metadata.durationMs}ms, $${report.metadata.totalCostUsd.toFixed(4)}*`);

  return lines.join("\n");
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseStringArray(content: string | undefined): string[] {
  if (!content) return [];
  try {
    const match = content.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const arr = JSON.parse(match[0]);
    return Array.isArray(arr) ? arr.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

function parseFindings(content: string | undefined): { finding: string; source: string; confidence: number }[] {
  if (!content) return [];
  try {
    const match = content.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const arr = JSON.parse(match[0]);
    return Array.isArray(arr) ? arr.filter((f) => f.finding) : [];
  } catch {
    return [];
  }
}

function emptyReport(query: string): ResearchReport {
  return {
    query,
    summary: "AI unavailable for deep research.",
    sections: [],
    timeline: [],
    recommendations: [],
    citations: [],
    metadata: { iterations: 0, questionsExplored: 0, findingsCount: 0, totalTokens: 0, totalCostUsd: 0, durationMs: 0 },
  };
}
