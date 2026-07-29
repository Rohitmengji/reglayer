/**
 * RegLayer — Streaming Markdown Stabilisation
 *
 * THE FLICKER THIS FIXES: the message formatter splits content with
 * `/(```[\s\S]*?```)/g`, which requires BOTH fences to be present. While a code block is
 * still streaming, the opening fence has arrived and the closing one has not, so the
 * partially-written code renders as ordinary paragraph text with literal backticks —
 * and then snaps into a dark, bordered code block with a header bar the instant the
 * closing fence lands.
 *
 * That is the worst kind of layout shift: it happens late, it moves everything below it,
 * and it is guaranteed on every answer containing code — which for an accessibility
 * assistant is most of them.
 *
 * THE FIX: while streaming, close the fence virtually. The block renders as a code block
 * from its first character and simply grows, so nothing reflows when the real fence
 * arrives.
 *
 * SCOPE DISCIPLINE: only structural, block-level markers are repaired. Guessing at
 * incomplete inline markers (`**bo`) risks hiding characters the user actually typed,
 * and the visual cost of a briefly-literal asterisk is a few pixels, not a reflow.
 */

const FENCE = "```";

/** Number of fence markers in the text. Odd means one is still open. */
function countFences(content: string): number {
  let count = 0;
  let index = content.indexOf(FENCE);
  while (index !== -1) {
    count += 1;
    index = content.indexOf(FENCE, index + FENCE.length);
  }
  return count;
}

export function hasUnterminatedFence(content: string): boolean {
  return countFences(content) % 2 === 1;
}

/**
 * Make partially-streamed markdown safe to render.
 *
 * Returns `content` unchanged once streaming has finished, so the final DOM is always
 * produced from exactly what the model sent — the stabilisation is a transient display
 * concern and must never alter stored or copied text.
 */
export function stabilizeStreamingMarkdown(content: string, isStreaming: boolean): string {
  if (!isStreaming || !content) return content;

  if (hasUnterminatedFence(content)) {
    // A newline before the fence guards the case where the stream stopped mid-line,
    // which would otherwise glue the closing fence onto a line of code.
    return content.endsWith("\n") ? `${content}${FENCE}` : `${content}\n${FENCE}`;
  }

  return content;
}

// ── Token coalescing ─────────────────────────────────────────────────────────

/**
 * Batches streamed tokens so the UI updates at frame rate rather than token rate.
 *
 * WHY: each token previously triggered a store write, which re-rendered every message
 * AND — because the store is persisted — serialised the entire conversation to
 * localStorage. A 2,000-character answer arriving in ~500 chunks meant ~500 full
 * re-parses of a growing string and ~500 JSON serialisations of the whole history, all
 * on the main thread. The visible symptom is jank on exactly the devices least able to
 * absorb it.
 *
 * Flushing on a timer rather than per token keeps the perceived typing effect — human
 * reading speed is far below 500 updates/second — while cutting the work by an order of
 * magnitude.
 */
/**
 * Default scheduler.
 *
 * MUST be a wrapper, not a bare `setTimeout` reference. Storing the global on an
 * instance and invoking it as `this.schedule(...)` sets the receiver to the instance,
 * which browsers reject with `TypeError: Illegal invocation` for timer functions.
 */
const defaultSchedule = (fn: () => void, ms: number) => setTimeout(fn, ms);
const defaultCancel = (handle: ReturnType<typeof setTimeout>) => clearTimeout(handle);

export class TokenBuffer {
  private pending = "";
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly flushFn: (chunk: string) => void,
    private readonly intervalMs = 16,
    private readonly schedule: (fn: () => void, ms: number) => ReturnType<typeof setTimeout> = defaultSchedule,
    private readonly cancel: (handle: ReturnType<typeof setTimeout>) => void = defaultCancel,
  ) {}

  push(chunk: string): void {
    if (!chunk) return;
    this.pending += chunk;
    if (this.timer !== null) return;

    this.timer = this.schedule(() => {
      this.timer = null;
      this.flush();
    }, this.intervalMs);
  }

  /**
   * Emit whatever is buffered immediately.
   *
   * MUST be called when the stream ends. Without it the final tokens sit in the buffer
   * until a timer that may never be given the chance to run — the message would be
   * silently truncated at the point the last flush happened.
   */
  flush(): void {
    if (this.timer !== null) {
      this.cancel(this.timer);
      this.timer = null;
    }
    if (!this.pending) return;

    const chunk = this.pending;
    this.pending = "";
    this.flushFn(chunk);
  }

  /** Drop buffered output and stop. Used when a run is abandoned. */
  discard(): void {
    if (this.timer !== null) {
      this.cancel(this.timer);
      this.timer = null;
    }
    this.pending = "";
  }

  get buffered(): string {
    return this.pending;
  }
}
