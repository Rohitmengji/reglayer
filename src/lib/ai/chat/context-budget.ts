/**
 * RegLayer — Context Budget Engine
 *
 * WHY THIS EXISTS: the chat route's only protection was
 *
 *     const estimatedTokens = messages.reduce((a, m) => a + m.content.length, 0) / 4;
 *     if (estimatedTokens > 100_000) { keep system + last 10 }
 *
 * which has three problems. The threshold is hardcoded and ignores the per-model
 * `contextWindow` in the provider registry (32k for ollama-mistral, 1M for Gemini), so
 * it is simultaneously far too strict and far too loose depending on routing. It never
 * fires in practice because the request schema caps history at 50 messages first — and
 * that cap rejects with a hard 400 rather than degrading. And when it does fire it
 * keeps a fixed `slice(-10)`, which can sever a user question from its answer.
 *
 * DESIGN PRINCIPLES
 *
 * 1. TURNS ARE ATOMIC. A user question and the answer to it are included or dropped
 *    together. Half a turn is worse than no turn: the model sees a question that was
 *    apparently never answered, or an answer to a question it cannot see.
 *
 * 2. NEVER SILENTLY EXCEED. Budget is derived from the routed model's real window,
 *    minus the reserved output, minus a margin for estimator error.
 *
 * 3. RECENCY IS THE FLOOR, RELEVANCE IS THE FILL. The most recent turns are always
 *    kept — conversation is anaphoric and dropping them breaks pronoun resolution.
 *    Older turns compete on relevance for whatever budget remains.
 *
 * 4. CHRONOLOGY IS PRESERVED. Selection may be out of order; output never is.
 */

export type ContextRole = "system" | "user" | "assistant";

export interface ContextMessage {
  role: ContextRole;
  content: string;
}

/**
 * Rough token estimate.
 *
 * ~4 characters per token is the standard English approximation. It is DELIBERATELY
 * conservative rather than exact: a real tokenizer in the hot path costs latency on
 * every request, and the safety margin below absorbs the error. Over-estimating is the
 * safe direction — it wastes a little window, where under-estimating is a hard failure.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface BudgetConfig {
  /** The routed model's real context window. */
  contextWindow: number;
  /** Tokens reserved for the completion. */
  reserveOutputTokens: number;
  /** Fraction held back to absorb estimator error. Default 10%. */
  safetyMarginRatio?: number;
}

/** Tokens available for everything sent TO the model. */
export function inputBudgetFor(config: BudgetConfig): number {
  const margin = config.safetyMarginRatio ?? 0.1;
  const usable = config.contextWindow * (1 - margin) - config.reserveOutputTokens;
  return Math.max(0, Math.floor(usable));
}

// ── Turn grouping ────────────────────────────────────────────────────────────

export interface Turn {
  /** Index of the first message of this turn in the original history. */
  startIndex: number;
  messages: ContextMessage[];
  tokens: number;
}

/**
 * Group a flat history into atomic turns.
 *
 * A turn is a user message plus every assistant message that follows it. Leading
 * assistant messages with no preceding user message form their own turn so that
 * nothing is silently discarded.
 */
export function groupIntoTurns(
  history: readonly ContextMessage[],
  countTokens: (text: string) => number = estimateTokens,
): Turn[] {
  const turns: Turn[] = [];

  for (const [index, message] of history.entries()) {
    const startsNewTurn = message.role === "user" || turns.length === 0;
    if (startsNewTurn) {
      turns.push({ startIndex: index, messages: [message], tokens: countTokens(message.content) });
      continue;
    }
    const current = turns[turns.length - 1];
    current.messages.push(message);
    current.tokens += countTokens(message.content);
  }

  return turns;
}

// ── Relevance ranking ────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "is", "are", "was", "were", "be", "been",
  "to", "of", "in", "on", "for", "with", "as", "at", "by", "from", "it", "this",
  "that", "these", "those", "i", "you", "we", "they", "do", "does", "did", "can",
  "could", "should", "would", "will", "what", "how", "why", "me", "my", "your",
]);

function contentTerms(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9.]+/)
      .filter((term) => term.length > 2 && !STOP_WORDS.has(term)),
  );
}

/**
 * Score how relevant a turn is to the current question.
 *
 * Deliberately lexical rather than embedding-based: this runs on every request, and a
 * network call to an embedding model would add latency to the exact path we are trying
 * to make cheaper. Overlap of RARE terms is a strong signal in this domain — shared
 * tokens like "1.4.3", "contrast", or "aria-label" almost always indicate genuine
 * topical continuity.
 *
 * Returns 0..1.
 */
export function scoreRelevance(query: string, text: string): number {
  const queryTerms = contentTerms(query);
  if (queryTerms.size === 0) return 0;

  const textTerms = contentTerms(text);
  let overlap = 0;
  for (const term of queryTerms) {
    if (textTerms.has(term)) {
      // Identifiers like "1.4.3" or "aria-label" are far more discriminating than
      // ordinary words, so they carry more weight.
      overlap += /[0-9.\-]/.test(term) ? 2 : 1;
    }
  }

  return Math.min(1, overlap / queryTerms.size);
}

// ── Selection ────────────────────────────────────────────────────────────────

export interface SelectContextInput {
  /** Fully assembled system prompt. Mandatory and never trimmed. */
  system: string;
  /** Conversation history, oldest first, excluding the system message. */
  history: readonly ContextMessage[];
  budget: BudgetConfig;
  /** Most recent turns that are always kept, for anaphora. Default 2. */
  pinnedRecentTurns?: number;
  countTokens?: (text: string) => number;
}

export interface SelectContextResult {
  messages: ContextMessage[];
  usedTokens: number;
  inputBudget: number;
  /** Turns excluded from context — the input to summarisation. */
  droppedTurns: Turn[];
  /**
   * True when the mandatory floor (system + latest turn) does not fit.
   * The caller MUST treat this as an error rather than sending a truncated prompt.
   */
  overflow: boolean;
}

export function selectContext(input: SelectContextInput): SelectContextResult {
  const countTokens = input.countTokens ?? estimateTokens;
  const inputBudget = inputBudgetFor(input.budget);
  const pinnedCount = input.pinnedRecentTurns ?? 2;

  const systemTokens = countTokens(input.system);
  const turns = groupIntoTurns(input.history, countTokens);

  // The floor is the system prompt plus the turn being answered. If that does not fit,
  // no amount of trimming helps and pretending otherwise produces a confidently wrong
  // answer built on a mangled prompt.
  const latestTurn = turns[turns.length - 1];
  const floorTokens = systemTokens + (latestTurn?.tokens ?? 0);
  if (floorTokens > inputBudget) {
    return {
      messages: [
        { role: "system", content: input.system },
        ...(latestTurn?.messages ?? []),
      ],
      usedTokens: floorTokens,
      inputBudget,
      droppedTurns: turns.slice(0, -1),
      overflow: true,
    };
  }

  const selected = new Set<number>();
  let used = systemTokens;

  // 1. Pin the most recent turns. Conversation is anaphoric — "fix that one" is
  //    meaningless without the turn it refers to.
  const pinnedStart = Math.max(0, turns.length - Math.max(1, pinnedCount));
  for (let i = turns.length - 1; i >= pinnedStart; i -= 1) {
    if (used + turns[i].tokens > inputBudget) break;
    selected.add(i);
    used += turns[i].tokens;
  }

  // 2. Fill remaining budget with the most RELEVANT older turns rather than simply the
  //    next-most-recent. A question asked twenty turns ago can matter more than small
  //    talk from two turns ago.
  const query = latestTurn?.messages.map((m) => m.content).join(" ") ?? "";
  const candidates = turns
    .map((turn, index) => ({ index, turn }))
    .filter(({ index }) => !selected.has(index))
    .map(({ index, turn }) => ({
      index,
      turn,
      score: scoreRelevance(query, turn.messages.map((m) => m.content).join(" ")),
    }))
    // Ties break toward recency, which is the better prior when relevance is equal.
    .sort((a, b) => (b.score - a.score) || (b.index - a.index));

  for (const candidate of candidates) {
    if (used + candidate.turn.tokens > inputBudget) continue;
    selected.add(candidate.index);
    used += candidate.turn.tokens;
  }

  // 3. Emit in chronological order. Selection may be relevance-ordered; the transcript
  //    handed to the model never is.
  const orderedIndices = [...selected].sort((a, b) => a - b);
  const messages: ContextMessage[] = [
    { role: "system", content: input.system },
    ...orderedIndices.flatMap((i) => turns[i].messages),
  ];

  return {
    messages,
    usedTokens: used,
    inputBudget,
    droppedTurns: turns.filter((_, i) => !selected.has(i)),
    overflow: false,
  };
}
