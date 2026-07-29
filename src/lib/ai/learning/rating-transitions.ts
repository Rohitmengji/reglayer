/**
 * RegLayer — Chat rating transition detection
 *
 * WHY: In-app thumbs up/down were written to ChatMessage.feedback and nowhere else,
 *      while the learning and intelligence engines read FeedbackEntry — a table only
 *      /api/v1/evaluate (the public API) ever wrote to. Every rating from a real user
 *      was stored and never read by the system built to learn from it, so quality
 *      scoring fell back to a hardcoded constant.
 *
 * WHAT: Pure helpers that decide which ratings in a conversation save are NEW, and
 *       forward only those to the learning system.
 *
 * HOW:  A diff, not a scan. The client debounces and re-sends the entire conversation
 *       on every save, so "this message has a rating" is not the same as "this message
 *       was just rated". Recording on presence would create a duplicate FeedbackEntry
 *       per save and poison the very metrics this bridge exists to feed.
 *
 * Lives in lib/ rather than the route because Next.js route modules have a constrained
 * export contract — arbitrary named exports there are a build hazard — and because a
 * pure function is far easier to test than an HTTP handler.
 */

/** The subset of a saved chat message this module needs. */
export interface RatedMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  feedback: number;
}

export interface RatingTransition {
  messageId: string;
  rating: number;
  /** The assistant text that was rated. */
  response: string;
  /** The user turn immediately before it — without this a rating has no subject. */
  query: string;
}

/** Caps so a single rating row can never balloon from a long conversation. */
const MAX_RESPONSE_CHARS = 4000;
const MAX_QUERY_CHARS = 2000;

/**
 * Find messages whose rating actually CHANGED in this save.
 *
 * Clearing a rating (x → 0) is intentionally NOT recorded: it is a retraction, not
 * a judgement, and there is nothing to learn from it.
 */
export function collectRatingTransitions(
  messages: RatedMessage[],
  previousById: Map<string, number>,
): RatingTransition[] {
  const transitions: RatingTransition[] = [];

  messages.forEach((m, i) => {
    if (m.role !== "assistant") return;
    if (m.feedback === 0) return;
    if ((previousById.get(m.id) ?? 0) === m.feedback) return;

    // Walk back for the user turn this answer responded to.
    let query = "";
    for (let j = i - 1; j >= 0; j--) {
      if (messages[j].role === "user") { query = messages[j].content; break; }
    }

    transitions.push({
      messageId: m.id,
      rating: m.feedback,
      response: m.content.slice(0, MAX_RESPONSE_CHARS),
      query: query.slice(0, MAX_QUERY_CHARS),
    });
  });

  return transitions;
}

/**
 * Forward new ratings into the learning system (FeedbackEntry → PromptImprovement).
 *
 * Failures are swallowed on purpose: a rating is worth strictly less than the user's
 * conversation, so this must never surface as a save error or slow the response.
 */
export async function recordRatingTransitions(
  transitions: RatingTransition[],
  userId: string,
  workspaceId?: string,
): Promise<void> {
  if (transitions.length === 0) return;

  try {
    const { recordFeedback } = await import("@/lib/ai/learning/service");

    await Promise.allSettled(
      transitions.map((t) =>
        recordFeedback({
          userId,
          workspaceId,
          feature: "chat",
          rating: t.rating,
          messageId: t.messageId,
          query: t.query,
          response: t.response,
          category: t.rating < 0 ? "unhelpful" : "helpful",
        }),
      ),
    );
  } catch {
    // Never block or fail the conversation save.
  }
}
