/**
 * RegLayer — Memory Policy
 *
 * Pure decision logic for what may be remembered, how memories compete, and how they
 * are rendered into a prompt. Kept free of Prisma so every rule is testable in
 * isolation — these are the decisions that carry privacy and security consequences,
 * and they should not require a database to verify.
 *
 * THREE DEFECTS THIS ADDRESSES
 *
 * 1. INJECTION. Memory values are user-authored text written into the SYSTEM prompt
 *    inside <user_memory> tags. A value containing the closing tag escapes its envelope
 *    and the remainder is read as system instruction. Retrieved context was already
 *    hardened against this; memory was not.
 *
 * 2. CONFLICT. `setMemory` upserts unconditionally, so a pattern-matched guess
 *    (confidence 0.7) silently overwrites something the user stated outright
 *    (confidence 1.0). Inference must never outrank a direct statement.
 *
 * 3. DECAY. The service header claims "confidence decays over time for inferred
 *    memories". No implementation exists — a guess made once was trusted forever.
 */

export type MemoryScope = "USER" | "WORKSPACE" | "SYSTEM";

export interface MemoryLike {
  key: string;
  value: string;
  scope: MemoryScope;
  confidence: number;
  source: string | null;
  updatedAt: Date;
}

// ── What must never be remembered ────────────────────────────────────────────

/**
 * Patterns that must never reach durable storage.
 *
 * WHY A DENY LIST AND NOT A CLASSIFIER: this runs on every message and must be
 * deterministic and auditable. A probabilistic classifier that is wrong 1% of the time
 * is wrong about credentials 1% of the time, and there is no acceptable rate for
 * persisting a secret.
 *
 * This is a floor, not a guarantee — see `NEVER_REMEMBER_LIMITS` in the design notes.
 */
const FORBIDDEN_VALUE_PATTERNS: readonly { name: string; pattern: RegExp }[] = [
  { name: "email", pattern: /[\w.+-]+@[\w-]+\.[\w.]+/ },
  { name: "credit-card", pattern: /\b(?:\d[ -]?){13,19}\b/ },
  { name: "national-id", pattern: /\b\d{3}-\d{2}-\d{4}\b/ },
  { name: "api-key", pattern: /\b(?:sk|pk|ghp|gho|xox[baprs])[-_][A-Za-z0-9_-]{16,}/ },
  { name: "bearer-token", pattern: /\bBearer\s+[A-Za-z0-9._-]{20,}/i },
  { name: "private-key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "password", pattern: /\b(?:password|passwd|secret|api[_ -]?key)\s*[:=]\s*\S+/i },
  { name: "phone", pattern: /\b\+?\d[\d\s().-]{8,}\d\b/ },
  { name: "ip-address", pattern: /\b\d{1,3}(?:\.\d{1,3}){3}\b/ },
];

export interface RememberDecision {
  ok: boolean;
  /** Which rule refused it, for audit and user-facing explanation. */
  reason?: string;
}

/** Longest value worth persisting. Anything larger is prose, not a fact. */
export const MAX_MEMORY_VALUE_LENGTH = 200;

export function shouldRemember(value: string): RememberDecision {
  const trimmed = value.trim();
  if (trimmed.length === 0) return { ok: false, reason: "empty" };

  // A long value is a symptom: the extractor captured a sentence rather than a fact,
  // and sentences are where incidental personal data hides.
  if (trimmed.length > MAX_MEMORY_VALUE_LENGTH) return { ok: false, reason: "too-long" };

  for (const { name, pattern } of FORBIDDEN_VALUE_PATTERNS) {
    if (pattern.test(trimmed)) return { ok: false, reason: name };
  }

  return { ok: true };
}

// ── Injection hardening ──────────────────────────────────────────────────────

/**
 * Neutralise anything that could close the memory envelope or open a new one.
 *
 * Angle brackets are stripped rather than entity-encoded: the model reads the prompt as
 * text, so `&lt;` would be visible noise, whereas removing the bracket removes the
 * capability without changing the meaning of a legitimate value.
 */
export function sanitizeMemoryValue(value: string): string {
  return value
    .replace(/[<>]/g, "")
    // Collapse newlines so a value cannot fabricate new prompt sections.
    .replace(/\s*[\r\n]+\s*/g, " ")
    .trim();
}

// ── Scoring ──────────────────────────────────────────────────────────────────

/** Days for an inferred memory's confidence to halve. */
export const INFERRED_HALF_LIFE_DAYS = 60;

/**
 * Confidence adjusted for age.
 *
 * Only INFERRED memories decay. Something the user stated outright does not become less
 * true because time passed — it becomes wrong only when contradicted, which is the
 * conflict rule's job, not decay's.
 */
export function effectiveConfidence(memory: MemoryLike, now: Date = new Date()): number {
  if (memory.source !== "inferred") return memory.confidence;

  const ageDays = Math.max(0, (now.getTime() - memory.updatedAt.getTime()) / 86_400_000);
  return memory.confidence * Math.pow(0.5, ageDays / INFERRED_HALF_LIFE_DAYS);
}

/** Below this, an inferred memory is too stale to influence a response. */
export const MIN_USABLE_CONFIDENCE = 0.25;

const SCOPE_WEIGHT: Record<MemoryScope, number> = {
  // A deliberate workspace decision outranks a personal inference: it represents an
  // agreement, and violating it in a compliance recommendation is the costlier error.
  WORKSPACE: 1.2,
  USER: 1.0,
  SYSTEM: 0.9,
};

export function scoreMemory(memory: MemoryLike, now: Date = new Date()): number {
  return effectiveConfidence(memory, now) * SCOPE_WEIGHT[memory.scope];
}

// ── Conflict resolution ──────────────────────────────────────────────────────

export type ConflictOutcome = "accept" | "reject";

/**
 * Decide whether an incoming write may replace an existing memory.
 *
 * RULE: a direct statement always beats an inference, regardless of recency. The
 * previous behaviour was a blind upsert, so a regex guess overwrote something the user
 * had explicitly told the assistant — and the user had no way to see it happen.
 *
 * Between writes of equal standing, the newer one wins: people change their minds, and
 * the most recent statement is the best available evidence of current intent.
 */
export function resolveConflict(
  existing: Pick<MemoryLike, "value" | "source" | "confidence"> | null,
  incoming: Pick<MemoryLike, "value" | "source" | "confidence">,
): ConflictOutcome {
  if (!existing) return "accept";
  if (existing.value === incoming.value) return "accept";

  const existingIsStated = existing.source !== "inferred";
  const incomingIsStated = incoming.source !== "inferred";

  // Inference must never silently override an explicit statement.
  if (existingIsStated && !incomingIsStated) return "reject";
  if (!existingIsStated && incomingIsStated) return "accept";

  // Same standing: require the newcomer to be at least as confident.
  return incoming.confidence >= existing.confidence ? "accept" : "reject";
}

// ── Prompt rendering ─────────────────────────────────────────────────────────

/** Token ceiling for the whole memory block. */
export const MEMORY_TOKEN_BUDGET = 400;

const estimateTokens = (text: string) => Math.ceil(text.length / 4);

/**
 * Select the memories worth spending context on.
 *
 * Ordering was previously `updatedAt desc` with no relevance or confidence weighting
 * and no token ceiling, so 50 stale guesses could crowd out the conversation on every
 * single request. Selection is now score-ranked and budget-bounded.
 */
export function selectMemoriesForPrompt(
  memories: readonly MemoryLike[],
  options: { tokenBudget?: number; now?: Date } = {},
): MemoryLike[] {
  const budget = options.tokenBudget ?? MEMORY_TOKEN_BUDGET;
  const now = options.now ?? new Date();

  const ranked = memories
    .filter((memory) => effectiveConfidence(memory, now) >= MIN_USABLE_CONFIDENCE)
    .map((memory) => ({ memory, score: scoreMemory(memory, now) }))
    .sort((a, b) => b.score - a.score);

  const chosen: MemoryLike[] = [];
  let used = 0;

  for (const { memory } of ranked) {
    const cost = estimateTokens(`- ${memory.key}: ${sanitizeMemoryValue(memory.value)}\n`);
    if (used + cost > budget) continue;
    chosen.push(memory);
    used += cost;
  }

  return chosen;
}
