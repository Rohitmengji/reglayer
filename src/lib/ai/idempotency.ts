/**
 * RegLayer — AI tool idempotency
 *
 * WHY: Tool calls that spend money or launch work must not run twice for the same
 *      logical request. The chat endpoint is not idempotent — a client retry after a
 *      dropped connection, a user hitting "regenerate", or the model deciding to call
 *      a tool twice in one turn all re-execute the tool. For `triggerScan` that means
 *      a duplicate browser launch, a duplicate crawl, and a duplicate bill.
 *
 *      This mattered less while tool calling was broken. It became live the moment
 *      the schemas were fixed, which is why it lands now.
 *
 * WHAT: A short-window dedup guard keyed on (scope, operation, arguments). The first
 *       caller executes and caches the result; concurrent or repeated callers within
 *       the window receive the cached result instead of triggering the work again.
 *
 * HOW: Redis SET NX for the claim (atomic across serverless isolates) plus a result
 *      cache. Deliberately NOT a general HTTP Idempotency-Key layer — that needs the
 *      client to mint and send keys. This guards the specific operations that cost
 *      money, with no client changes required.
 *
 * DESIGN NOTE — fail open, not closed:
 *      When Redis is unavailable, cacheSetNX returns true and we execute normally.
 *      Losing dedup degrades to today's behaviour (a possible duplicate scan); failing
 *      closed would mean the assistant refuses to work whenever Redis blips. For this
 *      trade-off the cost of a rare duplicate is lower than the cost of an outage.
 */
import "server-only";

import { cacheGet, cacheSet, cacheSetNX, cacheDel } from "@/lib/cache/redis";
import { logger } from "@/lib/telemetry/logger";

/**
 * How long a completed result stays replayable.
 * Long enough to absorb a retry storm or an impatient user; short enough that
 * "scan this URL again" a minute later still does real work.
 */
const RESULT_TTL_SEC = 90;

/** How long a claim is held while the operation is still running. */
const CLAIM_TTL_SEC = 120;

interface IdempotencyScope {
  workspaceId: string | null;
  userId: string;
}

/** Stable, collision-resistant key from the operation and its arguments. */
function buildKey(scope: IdempotencyScope, operation: string, args: unknown): string {
  const tenant = scope.workspaceId ?? `user:${scope.userId}`;
  // JSON.stringify of a flat, schema-validated tool argument object is stable enough
  // here — these are small objects with primitive values produced by Zod parsing.
  const fingerprint = JSON.stringify(args ?? {});
  return `idem:${operation}:${tenant}:${fingerprint}`;
}

export interface IdempotentOutcome<T> {
  result: T;
  /** True when the result was replayed rather than freshly computed. */
  deduplicated: boolean;
}

/**
 * Execute `fn` at most once per (scope, operation, args) within the dedup window.
 *
 * Returns the cached result for repeat callers. If a first caller is still in flight,
 * later callers wait briefly for its result rather than starting duplicate work.
 */
export async function withIdempotency<T>(
  scope: IdempotencyScope,
  operation: string,
  args: unknown,
  fn: () => Promise<T>,
): Promise<IdempotentOutcome<T>> {
  const key = buildKey(scope, operation, args);
  const resultKey = `${key}:result`;

  // Fast path: a completed result already exists.
  const cached = await cacheGet<T>(resultKey);
  if (cached !== null && cached !== undefined) {
    logger.info("ai.idempotency.replay", { operation, tenant: scope.workspaceId ?? scope.userId });
    return { result: cached, deduplicated: true };
  }

  // Claim the operation. Only one caller wins.
  const claimed = await cacheSetNX(key, Date.now(), CLAIM_TTL_SEC);

  if (!claimed) {
    // Someone else is running it. Poll briefly for their result rather than
    // duplicating an expensive operation.
    const replayed = await waitForResult<T>(resultKey);
    if (replayed !== null) {
      logger.info("ai.idempotency.joined", { operation, tenant: scope.workspaceId ?? scope.userId });
      return { result: replayed, deduplicated: true };
    }
    // The in-flight caller failed or is slower than our patience. Fall through and
    // execute: a duplicate is better than returning nothing to the user.
  }

  try {
    const result = await fn();
    await cacheSet(resultKey, result, RESULT_TTL_SEC);
    return { result, deduplicated: false };
  } catch (error) {
    // Release the claim so a genuine retry can proceed immediately. Holding it would
    // make one transient failure suppress every retry for the whole window.
    await cacheDel(key);
    throw error;
  }
}

/** Poll for another caller's result. Short by design — this blocks a user's request. */
async function waitForResult<T>(resultKey: string): Promise<T | null> {
  const ATTEMPTS = 10;
  const INTERVAL_MS = 300;

  for (let i = 0; i < ATTEMPTS; i++) {
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
    const value = await cacheGet<T>(resultKey);
    if (value !== null && value !== undefined) return value;
  }
  return null;
}
