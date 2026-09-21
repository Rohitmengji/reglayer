import "server-only";
import type { CrawlAttempt, CrawlJobScope } from "@/lib/scanner/crawler/page-checkpoint";
import { claimCrawlAttempt, renewCrawlAttempt, finishCrawlAttempt } from "./crawlAttemptService";

type Outcome = Parameters<typeof finishCrawlAttempt>[1];
type Options = { signal?: AbortSignal; leaseSeconds?: number; renewalIntervalMs?: number };
type Context = { attempt: CrawlAttempt; signal: AbortSignal };

export async function runOwnedCrawlAttempt(
  scope: Pick<CrawlJobScope, "workspaceId" | "jobId">,
  execute: (context: Context) => Promise<Outcome>,
  options: Options = {},
): Promise<Outcome | { status: "busy" }> {
  const leaseSeconds = options.leaseSeconds ?? 60;
  const renewalIntervalMs = options.renewalIntervalMs ?? Math.floor(leaseSeconds * 1000 / 3);
  if (!Number.isInteger(leaseSeconds) || leaseSeconds < 5 || leaseSeconds > 300 ||
      !Number.isInteger(renewalIntervalMs) || renewalIntervalMs < 100 || renewalIntervalMs > leaseSeconds * 1000 / 3) {
    throw new Error("Invalid crawl lease renewal timing.");
  }
  options.signal?.throwIfAborted();
  const controller = new AbortController();
  const shutdown = () => controller.abort(options.signal?.reason ?? new Error("Crawl executor stopped."));
  options.signal?.addEventListener("abort", shutdown, { once: true });
  let renewalTimer: ReturnType<typeof setTimeout> | undefined;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let renewing: Promise<void> | undefined;
  let settling = false;
  let rejectAborted!: (reason: unknown) => void;
  const aborted = new Promise<never>((_, reject) => { rejectAborted = reject; });
  void aborted.catch(() => {});
  const onAbort = () => rejectAborted(controller.signal.reason);
  controller.signal.addEventListener("abort", onAbort, { once: true });
  const wait = <Result>(operation: Promise<Result>) => Promise.race([operation, aborted]);
  const usableLeaseMs = leaseSeconds * 1000 - Math.max(1000, leaseSeconds * 100);

  function armWatchdog(requestStartedAt: number) {
    clearTimeout(watchdog);
    const remaining = usableLeaseMs - (performance.now() - requestStartedAt);
    if (remaining <= 0) controller.abort(new Error("Crawl lease confirmation arrived too late."));
    else watchdog = setTimeout(() => controller.abort(new Error("Crawl lease renewal deadline exceeded.")), remaining);
  }

  try {
    const claimStartedAt = performance.now();
    armWatchdog(claimStartedAt);
    const attempt = await wait(claimCrawlAttempt(scope, leaseSeconds));
    controller.signal.throwIfAborted();
    if (!attempt) return { status: "busy" };
    const owned = { ...scope, attempt };
    armWatchdog(claimStartedAt);
    controller.signal.throwIfAborted();

    const scheduleRenewal = () => {
      if (settling || controller.signal.aborted) return;
      renewalTimer = setTimeout(() => {
        const startedAt = performance.now();
        renewing = (async () => {
          try {
            await renewCrawlAttempt(owned, leaseSeconds);
            if (!controller.signal.aborted) armWatchdog(startedAt);
          } catch {
            controller.abort(new Error("Crawl ownership could not be renewed."));
          } finally {
            renewing = undefined;
            scheduleRenewal();
          }
        })();
      }, renewalIntervalMs);
    };
    scheduleRenewal();

    let outcome: Outcome;
    let taskError: unknown;
    let failed = false;
    try {
      outcome = await wait(Promise.resolve().then(() => {
        controller.signal.throwIfAborted();
        return execute({ attempt, signal: controller.signal });
      }));
    } catch (error) {
      controller.signal.throwIfAborted();
      taskError = error;
      failed = true;
      outcome = { status: "failed", error: "Crawl execution failed. Please retry the audit." };
    }

    settling = true;
    clearTimeout(renewalTimer);
    if (renewing) await wait(renewing);
    controller.signal.throwIfAborted();
    await wait(finishCrawlAttempt(owned, outcome));
    controller.signal.throwIfAborted();
    if (failed) throw taskError;
    return outcome;
  } finally {
    settling = true;
    clearTimeout(renewalTimer);
    clearTimeout(watchdog);
    options.signal?.removeEventListener("abort", shutdown);
    controller.signal.removeEventListener("abort", onAbort);
    if (!controller.signal.aborted) controller.abort(new Error("Crawl executor finished."));
  }
}