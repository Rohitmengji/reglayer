/**
 * ---------------------------------------------------------
 * RegLayer — Telemetry Logger
 * ---------------------------------------------------------
 *
 * Purpose:
 * Structured logging for observability and debugging.
 *
 * Why this exists:
 * Console.log is not production logging.
 * Structured logs enable:
 * - log aggregation
 * - search/filter by context
 * - alerting on error patterns
 * - performance tracking
 *
 * Future Extensions:
 * - Integration with DataDog/Sentry
 * - Structured JSON output
 * - Request correlation IDs
 * ---------------------------------------------------------
 */

import * as Sentry from "@sentry/nextjs";

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  timestamp: string;
}

class Logger {
  private context: Record<string, unknown> = {};

  withContext(context: Record<string, unknown>): Logger {
    const child = new Logger();
    child.context = { ...this.context, ...context };
    return child;
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log("debug", message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log("info", message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log("warn", message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.log("error", message, context);
  }

  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>
  ): void {
    const entry: LogEntry = {
      level,
      message,
      context: { ...this.context, ...context },
      timestamp: new Date().toISOString(),
    };

    const output = JSON.stringify(entry);

    switch (level) {
      case "error":
        console.error(output);
        this.reportToSentry(message, entry.context);
        break;
      case "warn":
        console.warn(output);
        break;
      default:
        console.log(output);
    }
  }

  /**
   * Forward error-level logs to Sentry. Console output already happened, so
   * this must never throw — any failure here is swallowed.
   */
  private reportToSentry(
    message: string,
    context?: Record<string, unknown>
  ): void {
    try {
      const maybeError = context?.error;
      if (maybeError instanceof Error) {
        Sentry.captureException(maybeError, { extra: context });
      } else {
        Sentry.captureMessage(message, { level: "error", extra: context });
      }
    } catch {
      // Swallow: telemetry must never break the calling code path.
    }
  }
}

export const logger = new Logger();
