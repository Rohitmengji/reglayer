/**
 * Typed scan errors — replaces fragile string-matching in classifyScanError.
 * Upstream functions can throw these directly, or classifyError() converts
 * untyped Error messages into the correct typed variant.
 */

export class ScanTimeoutError extends Error {
  readonly code = "TIMEOUT" as const;
  readonly httpStatus = 504;
  constructor(message = "Scan timed out") {
    super(message);
    this.name = "ScanTimeoutError";
  }
}

export class ScanUnreachableError extends Error {
  readonly code = "UNREACHABLE" as const;
  readonly httpStatus = 422;
  constructor(message = "Target URL is unreachable") {
    super(message);
    this.name = "ScanUnreachableError";
  }
}

export class ScanBlockedError extends Error {
  readonly code = "BLOCKED" as const;
  readonly httpStatus = 502;
  constructor(message = "Target blocked the scan") {
    super(message);
    this.name = "ScanBlockedError";
  }
}

export class ScanBrowserCrashError extends Error {
  readonly code = "BROWSER_CRASH" as const;
  readonly httpStatus = 500;
  constructor(message = "Browser crashed during scan") {
    super(message);
    this.name = "ScanBrowserCrashError";
  }
}

export type ScanError =
  | ScanTimeoutError
  | ScanUnreachableError
  | ScanBlockedError
  | ScanBrowserCrashError;

/**
 * Convert an untyped error into a typed ScanError if its message matches
 * known patterns. Falls back to returning the original error unchanged.
 */
export function classifyError(error: unknown): { status: number; code: string; message: string } {
  if (error instanceof ScanTimeoutError || error instanceof ScanUnreachableError ||
      error instanceof ScanBlockedError || error instanceof ScanBrowserCrashError) {
    return { status: error.httpStatus, code: error.code, message: error.message };
  }

  const message = error instanceof Error ? error.message : "An unexpected error occurred";
  const lower = message.toLowerCase();

  if (lower.includes("timeout") || lower.includes("timed out")) {
    return { status: 504, code: "TIMEOUT", message };
  }
  if (lower.includes("net::err_name_not_resolved") || lower.includes("getaddrinfo")) {
    return { status: 422, code: "UNREACHABLE", message };
  }
  if (lower.includes("net::err_connection_refused") || lower.includes("econnrefused")) {
    return { status: 422, code: "UNREACHABLE", message };
  }
  if (lower.includes("net::err_connection_reset") || lower.includes("econnreset")) {
    return { status: 502, code: "BLOCKED", message };
  }
  if (lower.includes("403") || lower.includes("forbidden")) {
    return { status: 502, code: "BLOCKED", message };
  }
  if (lower.includes("crash") || lower.includes("target closed") || lower.includes("disconnected")) {
    return { status: 500, code: "BROWSER_CRASH", message };
  }

  return { status: 500, code: "UNKNOWN", message };
}
