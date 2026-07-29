/**
 * RegLayer — Chat Telemetry
 *
 * WHY: the chat runtime's most important signals originate in the BROWSER — queue
 * depth, time to first token, whether a stream was interrupted, whether the user
 * abandoned a response — and there was no path for them to reach the server. The one
 * helper built for this, `trackStreamInterruption`, is defined in
 * `telemetry/metrics.ts` and called from nowhere.
 *
 * The consequence is that every failure mode added to the queue engine (pause,
 * interruption, persistence failure, retry) is invisible in production. We can see that
 * chat is slow; we cannot see that 4% of streams die before `done`.
 *
 * TWO DESIGN CONSTRAINTS DRIVE THIS FILE
 *
 * 1. CARDINALITY IS A PRODUCTION RISK, NOT A STYLE CHOICE. A label carrying free-form
 *    text — a prompt, an error message, a URL — creates one time series per distinct
 *    value and can take down a metrics backend. Event names and label VALUES are
 *    therefore closed unions, and anything unrecognised is dropped rather than passed
 *    through.
 *
 * 2. TELEMETRY MUST NEVER COST THE USER ANYTHING. Events are batched, sent
 *    fire-and-forget, and flushed with `keepalive` on page hide so the final events of
 *    an abandoned session still arrive. A failure to report is never surfaced.
 */

export const CHAT_EVENTS = [
  /** A run began. Denominator for completion rate. */
  "run.started",
  /** Terminal outcomes. These four must sum to `run.started` in a healthy system. */
  "run.completed",
  "run.failed",
  "run.cancelled",
  "run.interrupted",
  /** A prompt joined the queue, or was refused. */
  "queue.enqueued",
  "queue.rejected",
  /** The queue stopped and now needs a human decision. */
  "queue.paused",
  "queue.resumed",
  "queue.cleared",
  /** Durability write failed after exhausting retries. */
  "persist.failed",
  /** User asked to re-run a turn. */
  "run.retried",
] as const;

export type ChatEventName = (typeof CHAT_EVENTS)[number];

export const CHAT_MEASUREMENTS = [
  /** Time to first token — what a user actually experiences as "fast". */
  "ttft_ms",
  /** Full run duration. */
  "run_duration_ms",
  /** Pending prompts at the moment a run started. */
  "queue_depth",
] as const;

export type ChatMeasurementName = (typeof CHAT_MEASUREMENTS)[number];

/**
 * Every permitted label value, exhaustively.
 *
 * Deliberately a value allow-list rather than a key allow-list: permitting an arbitrary
 * value under a known key is the same cardinality bomb, just better disguised.
 */
export const CHAT_LABEL_VALUES = [
  "failed", "cancelled", "interrupted", "persistence", "user",
  "duplicate", "full", "empty",
] as const;

export type ChatLabelValue = (typeof CHAT_LABEL_VALUES)[number];

export interface ChatEvent {
  name: ChatEventName;
  reason?: ChatLabelValue;
}

export interface ChatMeasurement {
  name: ChatMeasurementName;
  value: number;
}

export type ChatSignal =
  | ({ kind: "event" } & ChatEvent)
  | ({ kind: "measurement" } & ChatMeasurement);

const EVENT_NAMES = new Set<string>(CHAT_EVENTS);
const MEASUREMENT_NAMES = new Set<string>(CHAT_MEASUREMENTS);
const LABEL_VALUES = new Set<string>(CHAT_LABEL_VALUES);

/**
 * Reject anything that could inflate cardinality or carry user content.
 *
 * Applied on BOTH sides of the wire. Client-side validation keeps bad data off the
 * network; server-side validation is what actually protects the metrics backend,
 * because the client is not a trust boundary.
 */
export function isValidSignal(signal: unknown): signal is ChatSignal {
  if (typeof signal !== "object" || signal === null) return false;
  const candidate = signal as Record<string, unknown>;

  if (candidate.kind === "event") {
    if (typeof candidate.name !== "string" || !EVENT_NAMES.has(candidate.name)) return false;
    if (candidate.reason === undefined) return true;
    return typeof candidate.reason === "string" && LABEL_VALUES.has(candidate.reason);
  }

  if (candidate.kind === "measurement") {
    if (typeof candidate.name !== "string" || !MEASUREMENT_NAMES.has(candidate.name)) return false;
    // Non-finite values corrupt histogram aggregation; negatives are nonsense for
    // every measurement defined here.
    return typeof candidate.value === "number"
      && Number.isFinite(candidate.value)
      && candidate.value >= 0;
  }

  return false;
}

// ── Emitter ──────────────────────────────────────────────────────────────────

const ENDPOINT = "/api/telemetry/chat";
const BATCH_INTERVAL_MS = 5_000;
/** Hard cap so a runaway loop cannot grow the buffer without bound. */
const MAX_BATCH = 50;

/**
 * Default scheduler.
 *
 * MUST be a wrapper, not a bare `setTimeout` reference. Storing the global on an
 * instance and calling it as `this.schedule(...)` sets the receiver to the instance,
 * and browsers require the global object as the receiver for timer functions — the
 * result is a `TypeError: Illegal invocation` at runtime. Node and jsdom are lenient
 * about this, so unit tests that inject a fake scheduler never reach the failure.
 */
const defaultSchedule = (fn: () => void, ms: number) => setTimeout(fn, ms);
const defaultCancel = (handle: ReturnType<typeof setTimeout>) => clearTimeout(handle);

/**
 * Batching, best-effort telemetry emitter.
 *
 * Injectable transport and scheduler so the batching rules can be tested without a
 * network or real timers.
 */
export class ChatTelemetry {
  private buffer: ChatSignal[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly send: (signals: ChatSignal[]) => void,
    private readonly intervalMs: number = BATCH_INTERVAL_MS,
    private readonly schedule: (fn: () => void, ms: number) => ReturnType<typeof setTimeout> = defaultSchedule,
    private readonly cancel: (h: ReturnType<typeof setTimeout>) => void = defaultCancel,
  ) {}

  event(name: ChatEventName, reason?: ChatLabelValue): void {
    this.enqueue({ kind: "event", name, ...(reason ? { reason } : {}) });
  }

  measure(name: ChatMeasurementName, value: number): void {
    this.enqueue({ kind: "measurement", name, value });
  }

  private enqueue(signal: ChatSignal): void {
    // Validate before buffering: a malformed signal should never occupy a slot that a
    // valid one could use.
    if (!isValidSignal(signal)) return;

    this.buffer.push(signal);
    if (this.buffer.length >= MAX_BATCH) {
      this.flush();
      return;
    }
    if (this.timer === null) {
      this.timer = this.schedule(() => { this.timer = null; this.flush(); }, this.intervalMs);
    }
  }

  /** Send whatever is buffered. Safe to call repeatedly. */
  flush(): void {
    if (this.timer !== null) {
      this.cancel(this.timer);
      this.timer = null;
    }
    if (this.buffer.length === 0) return;

    const batch = this.buffer;
    this.buffer = [];
    try {
      this.send(batch);
    } catch {
      // Telemetry must never surface a failure to the user, and must never retry into
      // a loop — dropped metrics are strictly preferable to a degraded session.
    }
  }

  get pending(): number {
    return this.buffer.length;
  }
}

/** Default browser transport: fire-and-forget, survives page unload. */
export function browserTransport(signals: ChatSignal[]): void {
  if (typeof fetch !== "function") return;
  void fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signals }),
    // Allows the request to outlive the page, so the last events of an abandoned
    // session — the ones that define the abandonment metric — still arrive.
    keepalive: true,
  }).catch(() => {});
}
