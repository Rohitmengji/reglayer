/**
 * Human-readable explanations for a failed chat request.
 *
 * WHY THIS EXISTS: the chat hook previously rendered the raw response body into the
 * transcript. That body is server-generated text — a stack trace, a proxy's HTML error
 * page, or an internal message — none of which tells a user what to do next, and some
 * of which should not be shown at all. Every failure is mapped to a deliberate
 * sentence instead, and the response body is never rendered.
 *
 * The rate-limit case is the one worth real effort: "try again shortly" is unactionable
 * when the response already says exactly when the limit resets.
 */

/**
 * Seconds until the caller may retry, or null when the response does not say.
 *
 * Prefers the standard `Retry-After` header and falls back to `X-RateLimit-Reset`,
 * which this codebase already returns as epoch SECONDS.
 */
export function retryAfterSeconds(
  headers: Headers,
  now: number = Date.now(),
): number | null {
  const retryAfter = Number(headers.get("Retry-After"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.ceil(retryAfter);

  const resetAt = Number(headers.get("X-RateLimit-Reset"));
  if (!Number.isFinite(resetAt) || resetAt <= 0) return null;

  const seconds = Math.ceil((resetAt * 1000 - now) / 1000);
  // A reset already in the past means the caller can retry immediately, which is not
  // worth putting in a sentence.
  return seconds > 0 ? seconds : null;
}

/** Render a wait in the coarsest unit that stays honest. */
export function formatRetryWait(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

/**
 * Map a failed response to a sentence that tells the user what happened and what to
 * do about it. Never includes the response body.
 */
export function describeRequestFailure(
  status: number,
  headers: Headers,
  now: number = Date.now(),
): string {
  if (status === 401) {
    return "Your session has expired. Sign in again, then retry — your message is still here.";
  }

  if (status === 429) {
    const wait = retryAfterSeconds(headers, now);
    return wait
      ? `You have reached the message limit. You can send another message in ${formatRetryWait(wait)}.`
      : "You have reached the message limit. Wait a moment before sending another message.";
  }

  if (status === 503) {
    return "The AI service is unavailable right now. Nothing was lost — retry in a moment.";
  }

  if (status >= 500) {
    return "Something went wrong on our side. Retry to send this message again.";
  }

  return "This message could not be sent. Retry, or rephrase it if the problem continues.";
}
