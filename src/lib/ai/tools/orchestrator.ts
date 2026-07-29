/**
 * RegLayer — Tool Orchestration Engine
 *
 * Reviewed against the existing implementation in `tools/definitions.ts`, which already
 * gets the hardest thing right: tools are built by a PER-REQUEST FACTORY with the
 * workspace baked into the WHERE clause, so cross-tenant reads are impossible by
 * construction rather than by check. This engine keeps that property and fixes what
 * sits around it.
 *
 * DEFECTS THIS ADDRESSES
 *
 * 1. TIMEOUT WITHOUT CANCELLATION. `Promise.race([fn(), timeout])` abandons the loser
 *    but does not stop it. A timed-out Prisma query keeps running and keeps its pool
 *    connection. Under load, timeouts accumulate into pool exhaustion — the timeout
 *    makes the outage arrive faster, not slower.
 *
 * 2. LEAKED TIMERS. The losing `setTimeout` was never cleared, so every successful tool
 *    call left a pending 10s timer holding a closure and keeping the event loop alive.
 *
 * 3. ERRORS AS SUCCESSFUL RESULTS. Tools returned `"Error fetching scans: " +
 *    error.message` as their RESULT. The model cannot distinguish "no data" from
 *    "failure", and raw driver text — schema names, SQL fragments — flowed into the
 *    model context and from there into user-visible answers.
 *
 * 4. NO AUTHORISATION BEYOND TENANCY. `triggerScan` both writes and costs money, yet
 *    was gated identically to a read. Tenancy answers "whose data", not "may this
 *    person do this".
 *
 * 5. NO CANCELLATION. Stopping a response aborted the HTTP stream while in-flight tools
 *    ran to completion — including billable ones.
 */

// ── Policy ───────────────────────────────────────────────────────────────────

/**
 * Reads are safe to retry; writes are not.
 *
 * This distinction is the single most important field here: it is what makes automatic
 * retry safe for a query and forbidden for a scan trigger.
 */
export type ToolKind = "read" | "write";

export type ToolCapability =
  | "scans:read"
  | "scans:write"
  | "reference:read";

export interface ToolPolicy {
  name: string;
  kind: ToolKind;
  capability: ToolCapability;
  timeoutMs: number;
  /** Total attempts including the first. Must be 1 for writes. */
  maxAttempts: number;
  /** Cache lifetime for deterministic results. 0 disables caching. */
  cacheTtlMs: number;
}

export const DEFAULT_TOOL_TIMEOUT_MS = 10_000;

/**
 * Guard against a policy that would retry a side-effecting tool.
 *
 * Encoded as a runtime check rather than a comment because the cost of getting it
 * wrong is duplicate billable work, and the mistake is a one-character edit.
 */
export function assertPolicySound(policy: ToolPolicy): void {
  if (policy.kind === "write" && policy.maxAttempts > 1) {
    throw new Error(
      `Tool "${policy.name}" is a write but allows ${policy.maxAttempts} attempts. ` +
      "Retrying a side-effecting tool duplicates its effect.",
    );
  }
}

// ── Result envelope ──────────────────────────────────────────────────────────

export type ToolFailureReason = "denied" | "timeout" | "cancelled" | "error";

export type ToolOutcome =
  | { ok: true; result: string; cached: boolean; attempts: number }
  | { ok: false; reason: ToolFailureReason; message: string; attempts: number };

/**
 * User- and model-safe failure text.
 *
 * Deliberately says nothing about the underlying cause. The detail belongs in logs,
 * where operators can see it; putting it in the model's context puts it one paraphrase
 * away from the end user.
 */
const FAILURE_MESSAGES: Record<ToolFailureReason, string> = {
  denied: "You do not have permission to use this capability.",
  timeout: "That lookup took too long. Try narrowing the request.",
  cancelled: "That lookup was cancelled.",
  error: "That lookup could not be completed.",
};

export function describeToolFailure(reason: ToolFailureReason): string {
  return FAILURE_MESSAGES[reason];
}

// ── Cache ────────────────────────────────────────────────────────────────────

interface CacheEntry {
  value: string;
  expiresAt: number;
}

/**
 * Tool result cache.
 *
 * TENANCY IS PART OF THE KEY, NOT AN AFTERTHOUGHT. A cache keyed on tool name and
 * arguments alone would serve one workspace's scan results to another — the exact
 * isolation the per-request factory exists to guarantee. `tenant` is a required
 * parameter so it cannot be forgotten at a call site.
 */
export class ToolCache {
  private readonly entries = new Map<string, CacheEntry>();

  constructor(private readonly now: () => number = Date.now) {}

  private key(tenant: string, tool: string, args: unknown): string {
    return `${tenant}::${tool}::${JSON.stringify(args ?? null)}`;
  }

  get(tenant: string, tool: string, args: unknown): string | null {
    const entry = this.entries.get(this.key(tenant, tool, args));
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(this.key(tenant, tool, args));
      return null;
    }
    return entry.value;
  }

  set(tenant: string, tool: string, args: unknown, value: string, ttlMs: number): void {
    if (ttlMs <= 0) return;
    this.entries.set(this.key(tenant, tool, args), {
      value,
      expiresAt: this.now() + ttlMs,
    });
  }

  get size(): number {
    return this.entries.size;
  }
}

// ── Execution ────────────────────────────────────────────────────────────────

export interface ExecuteToolOptions {
  policy: ToolPolicy;
  /** Capabilities granted to the caller. */
  granted: readonly ToolCapability[];
  /** Tenant identity — workspace when present, otherwise user. */
  tenant: string;
  args: unknown;
  /** Aborted when the user stops the response. */
  signal?: AbortSignal;
  cache?: ToolCache;
  /** Receives the caller's signal so slow work can actually be abandoned. */
  run: (signal: AbortSignal) => Promise<string>;
  /** Detail sink. Never reaches the model. */
  onError?: (error: unknown, attempt: number) => void;
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error
    && (error as { name?: string }).name === "AbortError";
}

export async function executeTool(options: ExecuteToolOptions): Promise<ToolOutcome> {
  const { policy, granted, tenant, args, signal, cache, run, onError } = options;
  assertPolicySound(policy);

  // Authorisation first: a denied call must perform no work and touch no cache.
  if (!granted.includes(policy.capability)) {
    return { ok: false, reason: "denied", message: describeToolFailure("denied"), attempts: 0 };
  }

  if (signal?.aborted) {
    return { ok: false, reason: "cancelled", message: describeToolFailure("cancelled"), attempts: 0 };
  }

  const cached = policy.cacheTtlMs > 0 ? cache?.get(tenant, policy.name, args) ?? null : null;
  if (cached !== null) {
    return { ok: true, result: cached, cached: true, attempts: 0 };
  }

  let attempts = 0;
  let lastReason: ToolFailureReason = "error";

  while (attempts < policy.maxAttempts) {
    attempts += 1;

    // A controller per attempt, linked to the caller's signal, so a deadline or a user
    // stop actually reaches the underlying work instead of merely being raced against.
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort();
    signal?.addEventListener("abort", abortFromCaller, { once: true });

    const timer = setTimeout(() => controller.abort(), policy.timeoutMs);

    try {
      const result = await run(controller.signal);
      cache?.set(tenant, policy.name, args, result, policy.cacheTtlMs);
      return { ok: true, result, cached: false, attempts };
    } catch (error) {
      onError?.(error, attempts);

      if (signal?.aborted) {
        lastReason = "cancelled";
        break; // The user stopped; retrying would ignore them.
      }
      lastReason = isAbortError(error) || controller.signal.aborted ? "timeout" : "error";
    } finally {
      // Both cleanups are mandatory. Leaving the timer pending was the original leak.
      clearTimeout(timer);
      signal?.removeEventListener("abort", abortFromCaller);
    }
  }

  return { ok: false, reason: lastReason, message: describeToolFailure(lastReason), attempts };
}

// ── Rendering for the model ──────────────────────────────────────────────────

const MAX_RESULT_CHARS = 2000;

/**
 * Render an outcome as the string the model receives.
 *
 * Failures are labelled explicitly so the model can tell "this lookup failed" from
 * "there is no data", which are different answers to the user.
 */
export function renderToolOutcome(outcome: ToolOutcome): string {
  if (!outcome.ok) {
    return `TOOL_FAILED(${outcome.reason}): ${outcome.message}`;
  }
  if (outcome.result.length <= MAX_RESULT_CHARS) return outcome.result;
  return outcome.result.slice(0, MAX_RESULT_CHARS)
    + "\n...[truncated — ask for specific details to see more]";
}
