import "server-only";

/**
 * Retry with exponential backoff.
 * Handles transient failures in external API calls (OpenAI, webhooks, etc.)
 *
 * Backoff formula: baseDelay * 2^attempt + jitter
 * Jitter prevents thundering herd on concurrent retries.
 */
interface RetryOptions {
  /** Maximum number of attempts (including the first) */
  maxAttempts?: number;
  /** Initial delay in ms before first retry */
  baseDelayMs?: number;
  /** Maximum delay between retries in ms */
  maxDelayMs?: number;
  /** Which error conditions should trigger a retry */
  retryIf?: (error: unknown) => boolean;
  /** Abort signal to cancel retries */
  signal?: AbortSignal;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, "signal">> = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  retryIf: isRetryableError,
};

/**
 * Default retry condition — retries on network errors, timeouts, and 5xx/429 responses.
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    // Network failures
    if (msg.includes("fetch failed") || msg.includes("econnreset") || msg.includes("timeout")) {
      return true;
    }
    // Rate limited
    if (msg.includes("429") || msg.includes("rate limit")) {
      return true;
    }
    // Server errors
    if (msg.includes("500") || msg.includes("502") || msg.includes("503") || msg.includes("504")) {
      return true;
    }
  }
  // OpenAI-specific: check status property
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = (error as { status: number }).status;
    return status === 429 || status >= 500;
  }
  return false;
}

/**
 * Execute a function with retry logic and exponential backoff.
 *
 * @example
 * const result = await withRetry(() => openai.chat.completions.create(...), {
 *   maxAttempts: 3,
 *   baseDelayMs: 1000,
 * });
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    try {
      if (options?.signal?.aborted) {
        throw new Error("Aborted");
      }
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry on final attempt or non-retryable errors
      if (attempt === opts.maxAttempts - 1 || !opts.retryIf(error)) {
        throw error;
      }

      // Exponential backoff with jitter
      const delay = Math.min(
        opts.baseDelayMs * Math.pow(2, attempt) + Math.random() * 200,
        opts.maxDelayMs
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
