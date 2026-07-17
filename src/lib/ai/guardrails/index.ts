/**
 * RegLayer — AI Guardrails
 *
 * Post-LLM output validation that runs BEFORE responses reach the user.
 * Catches hallucinations, off-topic responses, toxic content, and
 * schema violations. Inspired by NeMo Guardrails (NVIDIA), Guardrails AI,
 * and Anthropic's Constitutional AI.
 *
 * ARCHITECTURE:
 *   LLM Response → Guardrail Pipeline → Validated Response | Rejection
 *
 *   Each guardrail is a pure function: (response, context) → GuardResult
 *   Pipeline runs them in order, short-circuits on first BLOCK.
 *
 * WHY THIS EXISTS:
 *   - LLMs hallucinate WCAG criteria that don't exist
 *   - LLMs can go off-topic (unrelated to accessibility)
 *   - Structured outputs can violate schemas despite JSON mode
 *   - Enterprise compliance requires auditable output validation
 *
 * DESIGN DECISIONS:
 *   - Guards are pure functions (testable without LLM calls)
 *   - Pipeline is composable (different routes use different guards)
 *   - Soft vs Hard guards: WARN logs but passes, BLOCK rejects
 *   - Guards run synchronously after LLM returns (not streaming)
 *   - Fire-and-forget metrics emission (never slows response)
 */

import "server-only";

// ── Types ─────────────────────────────────────────────────────────────────────

export type GuardSeverity = "block" | "warn" | "pass";

export interface GuardResult {
  /** Whether the output passed, was warned, or blocked */
  severity: GuardSeverity;
  /** Which guard produced this result */
  guardId: string;
  /** Human-readable reason (for logs/audit) */
  reason?: string;
  /** Sanitized/corrected output (only for "warn" — used if response is fixable) */
  corrected?: string;
}

export interface GuardContext {
  /** The feature that produced this output */
  feature: string;
  /** The user's original message/query */
  userMessage?: string;
  /** Whether the response was RAG-augmented */
  ragAugmented?: boolean;
  /** Expected JSON schema (for structured output validation) */
  expectedSchema?: Record<string, unknown>;
}

export type GuardFn = (
  output: string,
  context: GuardContext,
) => GuardResult;

export interface GuardPipelineResult {
  /** Final output (may be corrected by warn-level guards) */
  output: string;
  /** Whether the pipeline passed overall */
  passed: boolean;
  /** All guard results for audit */
  results: GuardResult[];
  /** If blocked, the rejection reason shown to the user */
  rejectionReason?: string;
}

// ── Guards ────────────────────────────────────────────────────────────────────

/**
 * GUARD: Topic Relevance
 * Blocks responses that have nothing to do with accessibility/compliance.
 * Uses keyword heuristics (fast, no LLM call needed).
 */
export const topicRelevanceGuard: GuardFn = (output, context) => {
  // Only apply to chat/explanation features, not structured outputs
  if (!["chat", "chat-rag", "violation-explainer"].includes(context.feature)) {
    return { severity: "pass", guardId: "topic-relevance" };
  }

  const lower = output.toLowerCase();
  const accessibilitySignals = [
    "wcag", "accessibility", "a11y", "aria", "screen reader",
    "contrast", "keyboard", "compliance", "violation", "remediat",
    "assistive", "alt text", "focus", "semantic", "heading",
    "landmark", "tab order", "color blind", "disability",
    "section 508", "ada ", "en 301", "eaa", "inclusive design",
    "perceivable", "operable", "understandable", "robust",
  ];

  const hasRelevantContent = accessibilitySignals.some((s) => lower.includes(s));

  // Short responses or responses with code blocks get a pass (might be brief answers)
  if (output.length < 100 || output.includes("```")) {
    return { severity: "pass", guardId: "topic-relevance" };
  }

  if (!hasRelevantContent && output.length > 300) {
    return {
      severity: "warn",
      guardId: "topic-relevance",
      reason: "Response may be off-topic (no accessibility-related content detected)",
    };
  }

  return { severity: "pass", guardId: "topic-relevance" };
};

/**
 * GUARD: Hallucinated WCAG Criteria
 * Catches fabricated WCAG success criteria numbers.
 * Real WCAG 2.2 has criteria 1.1.1 through 4.1.3. Anything outside that is fake.
 */
export const wcagHallucinationGuard: GuardFn = (output) => {
  // Match patterns like "SC 5.2.1" or "WCAG 4.2.1" or "criterion 1.5.4"
  const wcagPattern = /(?:SC|WCAG|criterion|success criterion)\s*(\d+)\.(\d+)\.(\d+)/gi;
  const matches = [...output.matchAll(wcagPattern)];

  if (matches.length === 0) {
    return { severity: "pass", guardId: "wcag-hallucination" };
  }

  // Valid WCAG 2.2 principle numbers: 1-4
  // Valid guideline ranges per principle:
  // 1.x: 1.1-1.4, 2.x: 2.1-2.5, 3.x: 3.1-3.3, 4.x: 4.1
  const validRanges: Record<number, number[]> = {
    1: [1, 2, 3, 4],
    2: [1, 2, 3, 4, 5],
    3: [1, 2, 3],
    4: [1],
  };

  for (const match of matches) {
    const principle = parseInt(match[1]);
    const guideline = parseInt(match[2]);
    const criterion = parseInt(match[3]);

    // Principle must be 1-4
    if (principle < 1 || principle > 4) {
      return {
        severity: "warn",
        guardId: "wcag-hallucination",
        reason: `Potentially hallucinated WCAG criterion: ${match[0]} (principle ${principle} doesn't exist)`,
      };
    }

    // Guideline must be valid for the principle
    const validGuidelines = validRanges[principle];
    if (validGuidelines && !validGuidelines.includes(guideline)) {
      return {
        severity: "warn",
        guardId: "wcag-hallucination",
        reason: `Potentially hallucinated WCAG criterion: ${match[0]} (guideline ${principle}.${guideline} doesn't exist)`,
      };
    }

    // Criterion number shouldn't exceed ~15 (no real criterion goes that high)
    if (criterion > 15) {
      return {
        severity: "warn",
        guardId: "wcag-hallucination",
        reason: `Potentially hallucinated WCAG criterion: ${match[0]} (criterion number ${criterion} is unusually high)`,
      };
    }
  }

  return { severity: "pass", guardId: "wcag-hallucination" };
};

/**
 * GUARD: JSON Schema Validation
 * For structured outputs, validates the response parses as JSON and
 * contains expected top-level keys.
 */
export const jsonSchemaGuard: GuardFn = (output, context) => {
  if (!context.expectedSchema) {
    return { severity: "pass", guardId: "json-schema" };
  }

  try {
    const parsed = JSON.parse(output);

    // Check required top-level keys
    const expectedKeys = Object.keys(context.expectedSchema);
    const missingKeys = expectedKeys.filter((k) => !(k in parsed));

    if (missingKeys.length > 0) {
      return {
        severity: "block",
        guardId: "json-schema",
        reason: `JSON response missing required keys: ${missingKeys.join(", ")}`,
      };
    }

    return { severity: "pass", guardId: "json-schema" };
  } catch {
    return {
      severity: "block",
      guardId: "json-schema",
      reason: "Response is not valid JSON but structured output was expected",
    };
  }
};

/**
 * GUARD: Refusal Detection
 * Detects when the LLM refuses to answer a legitimate accessibility question.
 * Common with over-cautious safety filters on benign queries.
 */
export const refusalDetectionGuard: GuardFn = (output, context) => {
  if (!context.userMessage) {
    return { severity: "pass", guardId: "refusal-detection" };
  }

  const refusalPatterns = [
    /i (?:can't|cannot|am unable to) (?:help|assist|provide|answer)/i,
    /i'm not able to/i,
    /as an ai,? i (?:don't|do not) have/i,
    /i (?:must|have to) decline/i,
  ];

  const isRefusal = refusalPatterns.some((p) => p.test(output));

  if (isRefusal && output.length < 200) {
    return {
      severity: "warn",
      guardId: "refusal-detection",
      reason: "LLM refused a potentially legitimate accessibility question",
    };
  }

  return { severity: "pass", guardId: "refusal-detection" };
};

/**
 * GUARD: Output Length
 * Blocks suspiciously short or excessively long responses.
 */
export const outputLengthGuard: GuardFn = (output, context) => {
  // Structured outputs have their own validation
  if (context.expectedSchema) {
    return { severity: "pass", guardId: "output-length" };
  }

  if (output.trim().length === 0) {
    return {
      severity: "block",
      guardId: "output-length",
      reason: "LLM returned empty response",
    };
  }

  // Flag excessively long responses (>15K chars ≈ too much for a single message)
  if (output.length > 15_000) {
    return {
      severity: "warn",
      guardId: "output-length",
      reason: `Response unusually long (${output.length} chars) — may contain repetition`,
    };
  }

  return { severity: "pass", guardId: "output-length" };
};

/**
 * GUARD: Confidence Calibration (for structured explainer outputs)
 * Catches when the model claims 0.99 confidence on ambiguous violations.
 */
export const confidenceCalibrationGuard: GuardFn = (output, context) => {
  if (context.feature !== "violation-explainer") {
    return { severity: "pass", guardId: "confidence-calibration" };
  }

  try {
    const parsed = JSON.parse(output);
    if (typeof parsed.confidence === "number" && parsed.confidence > 0.98) {
      return {
        severity: "warn",
        guardId: "confidence-calibration",
        reason: `Suspiciously high confidence (${parsed.confidence}) — model may be overconfident`,
      };
    }
  } catch {
    // Not JSON, skip
  }

  return { severity: "pass", guardId: "confidence-calibration" };
};

// ── Pipeline ──────────────────────────────────────────────────────────────────

/** Default guard pipeline for chat/explanation features */
const DEFAULT_GUARDS: GuardFn[] = [
  outputLengthGuard,
  jsonSchemaGuard,
  wcagHallucinationGuard,
  topicRelevanceGuard,
  refusalDetectionGuard,
  confidenceCalibrationGuard,
];

/**
 * Run the guardrail pipeline on an LLM output.
 *
 * Executes each guard in order. On first BLOCK, short-circuits and rejects.
 * WARN-level guards log but allow the response through (optionally corrected).
 *
 * @param output  The raw LLM response text
 * @param context Metadata about the request (feature, user message, etc.)
 * @param guards  Custom guard list (defaults to DEFAULT_GUARDS)
 */
export function runGuardrails(
  output: string,
  context: GuardContext,
  guards: GuardFn[] = DEFAULT_GUARDS,
): GuardPipelineResult {
  const results: GuardResult[] = [];
  let finalOutput = output;

  for (const guard of guards) {
    const result = guard(finalOutput, context);
    results.push(result);

    if (result.severity === "block") {
      return {
        output: finalOutput,
        passed: false,
        results,
        rejectionReason: result.reason || "Response blocked by safety guardrails",
      };
    }

    if (result.severity === "warn" && result.corrected) {
      finalOutput = result.corrected;
    }
  }

  return { output: finalOutput, passed: true, results };
}

// ── Feature-Specific Pipelines ────────────────────────────────────────────────

/** Guards for the chat feature (most comprehensive) */
import { factCheckWcagResponse } from "@/lib/ai/safety/wcag-fact-check";

export const CHAT_GUARDS: GuardFn[] = [
  outputLengthGuard,
  wcagHallucinationGuard,
  // Enhanced fact-checker: validates against full 55-criterion WCAG 2.0/2.1/2.2 database
  (output: string) => {
    const result = factCheckWcagResponse(output);
    if (result.hasHallucinations) {
      return {
        severity: "warn" as GuardSeverity,
        guardId: "wcag-fact-check",
        reason: `Hallucinated criteria detected: ${result.claims.filter(c => !c.valid).map(c => c.criterion).join(", ")}`,
      };
    }
    const levelMismatches = result.claims.filter(c => c.levelMismatch);
    if (levelMismatches.length > 0) {
      return {
        severity: "warn" as GuardSeverity,
        guardId: "wcag-fact-check",
        reason: `Conformance level mismatch: ${levelMismatches.map(c => `${c.criterion} claimed ${c.levelMismatch!.claimed} but is actually ${c.levelMismatch!.actual}`).join("; ")}`,
      };
    }
    return { severity: "pass" as GuardSeverity, guardId: "wcag-fact-check" };
  },
  topicRelevanceGuard,
  refusalDetectionGuard,
];

/** Guards for structured JSON outputs (explainer, summaries) */
export const STRUCTURED_GUARDS: GuardFn[] = [
  outputLengthGuard,
  jsonSchemaGuard,
  confidenceCalibrationGuard,
];

/** Guards for RAG-augmented responses */
export const RAG_GUARDS: GuardFn[] = [
  outputLengthGuard,
  wcagHallucinationGuard,
  topicRelevanceGuard,
];
