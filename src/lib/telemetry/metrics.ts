/**
 * Observability Metrics Module — counters, histograms, gauges.
 *
 * WHY: Can't answer "what's the p95 AI latency?" or "cache hit ratio?"
 *      without quantitative metrics. Sentry handles errors, not metrics.
 * WHAT: Lightweight metrics collection with periodic flush to console/Sentry.
 * HOW: In-memory counters with labels, flushed every 60s.
 *      Designed for Vercel serverless (no persistent state between invocations).
 */

interface MetricEntry {
  name: string;
  type: "counter" | "histogram" | "gauge";
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

const buffer: MetricEntry[] = [];
const FLUSH_INTERVAL = 60_000;
let flushTimer: ReturnType<typeof setInterval> | null = null;

function ensureFlushTimer() {
  if (flushTimer) return;
  flushTimer = setInterval(flush, FLUSH_INTERVAL);
  // Don't keep process alive for metrics
  if (typeof flushTimer === "object" && "unref" in flushTimer) {
    (flushTimer as NodeJS.Timeout).unref();
  }
}

/**
 * Increment a counter metric.
 */
export function incrementCounter(name: string, labels: Record<string, string> = {}, value = 1): void {
  buffer.push({ name, type: "counter", value, labels, timestamp: Date.now() });
  ensureFlushTimer();
}

/**
 * Record a histogram observation (e.g., latency, token count).
 */
export function recordHistogram(name: string, value: number, labels: Record<string, string> = {}): void {
  buffer.push({ name, type: "histogram", value, labels, timestamp: Date.now() });
  ensureFlushTimer();
}

/**
 * Set a gauge value (e.g., active connections, queue depth).
 */
export function setGauge(name: string, value: number, labels: Record<string, string> = {}): void {
  buffer.push({ name, type: "gauge", value, labels, timestamp: Date.now() });
  ensureFlushTimer();
}

// ── Pre-defined metric helpers ───────────────────────────────────────────────

/** Track AI request latency (ms) */
export function trackAILatency(model: string, latencyMs: number, cached: boolean): void {
  recordHistogram("ai.request.latency_ms", latencyMs, { model, cached: String(cached) });
  incrementCounter("ai.request.count", { model, cached: String(cached) });
}

/** Track cache hit/miss */
export function trackCacheResult(layer: string, hit: boolean): void {
  incrementCounter("cache.lookup", { layer, result: hit ? "hit" : "miss" });
}

/** Track scan duration */
export function trackScanDuration(durationMs: number, region: string): void {
  recordHistogram("scan.duration_ms", durationMs, { region });
  incrementCounter("scan.count", { region });
}

/** Track token usage */
export function trackTokenUsage(model: string, inputTokens: number, outputTokens: number): void {
  recordHistogram("ai.tokens.input", inputTokens, { model });
  recordHistogram("ai.tokens.output", outputTokens, { model });
}

/** Track streaming interruptions */
export function trackStreamInterruption(reason: string): void {
  incrementCounter("ai.stream.interruption", { reason });
}

/** Track feature usage */
export function trackFeatureUsage(feature: string, action: string): void {
  incrementCounter("feature.usage", { feature, action });
}

// ── Flush ────────────────────────────────────────────────────────────────────

/**
 * Flush buffered metrics. In production, this would send to a metrics backend
 * (Datadog, Prometheus, CloudWatch). Currently logs structured JSON for
 * log-based metrics (Vercel Logs → Datadog integration).
 */
export function flush(): void {
  if (buffer.length === 0) return;

  const batch = buffer.splice(0, buffer.length);

  // Aggregate counters
  const counters = new Map<string, { name: string; labels: Record<string, string>; total: number }>();
  const histograms = new Map<string, number[]>();

  for (const entry of batch) {
    const key = `${entry.name}:${JSON.stringify(entry.labels)}`;
    if (entry.type === "counter") {
      const existing = counters.get(key);
      if (existing) {
        existing.total += entry.value;
      } else {
        counters.set(key, { name: entry.name, labels: entry.labels, total: entry.value });
      }
    } else if (entry.type === "histogram") {
      const existing = histograms.get(key) || [];
      existing.push(entry.value);
      histograms.set(key, existing);
    }
  }

  // Log aggregated metrics as structured JSON (parseable by log aggregators)
  for (const [, counter] of counters) {
    console.log(JSON.stringify({
      _metric: true,
      type: "counter",
      name: counter.name,
      value: counter.total,
      labels: counter.labels,
      ts: Date.now(),
    }));
  }

  for (const [key, values] of histograms) {
    const sorted = values.sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
    const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? 0;
    const name = key.split(":")[0];
    console.log(JSON.stringify({
      _metric: true,
      type: "histogram",
      name,
      count: values.length,
      p50,
      p95,
      p99,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      ts: Date.now(),
    }));
  }
}
