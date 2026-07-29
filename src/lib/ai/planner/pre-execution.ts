/**
 * RegLayer — Pre-Execution Planner
 *
 * Decides what a request actually needs BEFORE any of it is paid for.
 *
 * WHY THIS GAP EXISTED: `planner/engine.ts` already contains task decomposition,
 * dependency ordering, and topological batching — and `generatePlan` is used by exactly
 * zero production paths. The chat route calls `classifyIntent` only, to pick a retrieval
 * preset. So every request, including "hi", performs a vector search, a memory query, a
 * profile query, and a model call.
 *
 * The decision that was missing is the first one: does this need a model at all?
 *
 * THE DETERMINISTIC PATH IS NOT MERELY AN OPTIMISATION.
 * "Which level is SC 1.4.3?" has exactly one correct answer, and
 * `safety/wcag-fact-check.ts` already holds ground truth for all 57 criteria. Answering
 * from that table is instant, free, and — the part that matters for a compliance
 * product — CANNOT HALLUCINATE. A model asked the same question can invent "SC 1.4.20".
 * Routing these to a lookup removes the failure mode rather than mitigating it.
 *
 * FALSE POSITIVES ARE THE REAL RISK. Answering "how do I fix 1.4.3?" from a lookup
 * table would be worse than any latency saved, so the deterministic path is deliberately
 * narrow: it fires only for attribute questions about a criterion that exists, and
 * declines anything asking for guidance, remediation, or judgement.
 */

import { lookupCriterion } from "@/lib/ai/safety/wcag-fact-check";
import { classifyIntent, type QueryIntent } from "./engine";

export type ExecutionStrategy =
  /** Answerable from authoritative data. No model call. */
  | "direct-answer"
  /** One model call, no retrieval — greetings, acknowledgements, meta questions. */
  | "single-pass"
  /** Retrieval-augmented model call. The default for substantive questions. */
  | "retrieval"
  /** Multi-step: decompose via `generatePlan`, then synthesise. */
  | "decomposed";

export type ModelTier = "fast" | "standard" | "advanced";

export interface ExecutionPlan {
  strategy: ExecutionStrategy;
  intent: QueryIntent;
  needsRetrieval: boolean;
  needsMemory: boolean;
  needsTools: boolean;
  tier: ModelTier;
  /** Populated only for `direct-answer`. */
  directAnswer?: string;
  /** Why this plan was chosen. Emitted to telemetry so routing is auditable. */
  reason: string;
}

// ── Deterministic answers ────────────────────────────────────────────────────

/** A criterion reference such as "1.4.3" or "SC 2.5.8". */
const CRITERION_REFERENCE = /\b(\d\.\d{1,2}\.\d{1,2})\b/;

/**
 * Questions that a lookup table can answer completely.
 * Each asks for a stored attribute, not an interpretation.
 */
const ATTRIBUTE_QUESTION = /\b(what|which)\s+(level|conformance|name|principle|guideline|version)\b|\bis\s+(?:sc\s+)?\d\.\d{1,2}\.\d{1,2}\s+(?:a\s+)?level\b/i;

/**
 * Anything implying judgement, remediation, or context.
 * Checked FIRST — the cost of wrongly short-circuiting these is a useless answer.
 */
const REQUIRES_REASONING = /\b(how|why|fix|remediat|implement|should|best|recommend|example|code|audit|our|my|compare|differ|impact|priorit)\w*/i;

export interface DirectAnswer {
  text: string;
  criterionId: string;
}

/**
 * Attempt to answer from the WCAG database alone.
 * Returns null whenever there is any doubt — declining is always safe.
 */
export function tryDirectAnswer(query: string): DirectAnswer | null {
  if (REQUIRES_REASONING.test(query)) return null;
  if (!ATTRIBUTE_QUESTION.test(query)) return null;

  const match = query.match(CRITERION_REFERENCE);
  if (!match) return null;

  const criterion = lookupCriterion(match[1]);
  // An unknown id is exactly the case that must reach a model with retrieval, so the
  // fact-checker can flag an invented criterion rather than a lookup silently saying no.
  if (!criterion) return null;

  return {
    criterionId: criterion.id,
    text:
      `**SC ${criterion.id} — ${criterion.name}** is a **Level ${criterion.level}** ` +
      `success criterion, introduced in WCAG ${criterion.version}.\n\n` +
      `It sits under the *${criterion.principle}* principle, in the *${criterion.guideline}* guideline.`,
  };
}

// ── Capability decisions ─────────────────────────────────────────────────────

/** Signals the user is asking about THEIR data, which only tools can supply. */
const OWN_DATA = /\b(my|our|we|us)\b|\b(scan|scans|violation|violations|site|sites|page|pages|score|dashboard|report)\b/i;

/** Signals a pure reference question, where personal memory adds tokens but no value. */
const REFERENCE_ONLY = /\b(wcag|sc|success criterion|criterion|guideline|eaa|section 508|ada|en 301)\b/i;

const TIER_BY_INTENT: Record<QueryIntent, ModelTier> = {
  conversational: "fast",
  lookup: "fast",
  comparison: "standard",
  analysis: "advanced",
  multi_step: "advanced",
};

/**
 * Produce an execution plan for a request.
 *
 * Pure and synchronous: planning must never cost a network call, or it becomes the
 * thing it exists to avoid.
 */
export function planRequest(query: string): ExecutionPlan {
  const intent = classifyIntent(query);

  const direct = tryDirectAnswer(query);
  if (direct) {
    return {
      strategy: "direct-answer",
      intent,
      needsRetrieval: false,
      needsMemory: false,
      needsTools: false,
      tier: "fast",
      directAnswer: direct.text,
      reason: `authoritative-lookup:${direct.criterionId}`,
    };
  }

  const mentionsOwnData = OWN_DATA.test(query);

  if (intent === "conversational") {
    return {
      strategy: "single-pass",
      intent,
      // A greeting does not need a vector search, and running one is pure waste.
      needsRetrieval: false,
      needsMemory: false,
      needsTools: false,
      tier: "fast",
      reason: "conversational-no-context-required",
    };
  }

  if (intent === "multi_step") {
    return {
      strategy: "decomposed",
      intent,
      needsRetrieval: true,
      needsMemory: true,
      needsTools: mentionsOwnData,
      tier: TIER_BY_INTENT[intent],
      reason: "multi-step-requires-decomposition",
    };
  }

  // Reference questions benefit from retrieval but not from personal memory: knowing
  // the user's tech stack does not change what a success criterion requires.
  const referenceOnly = REFERENCE_ONLY.test(query) && !mentionsOwnData;

  return {
    strategy: "retrieval",
    intent,
    needsRetrieval: true,
    needsMemory: !referenceOnly,
    needsTools: mentionsOwnData,
    tier: TIER_BY_INTENT[intent],
    reason: referenceOnly ? "reference-question" : "grounded-answer-required",
  };
}
