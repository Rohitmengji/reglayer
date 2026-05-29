/**
 * RegLayer — Authenticated Scanning Engine
 *
 * WHY: Enterprise apps live behind login walls. Without authenticated scanning,
 *      RegLayer fails every enterprise evaluation. This module injects auth
 *      credentials into Playwright browser contexts before navigating to scan URLs.
 *
 * WHAT: `applyAuthToContext()` — the single entry point that handles all auth methods.
 *       Called by the scan pipeline AFTER browser/context creation, BEFORE page.goto().
 *
 * HOW: Discriminated union on `config.method`:
 *   - cookies: context.addCookies() — universal fallback (works with OAuth, SAML, JWT)
 *   - form: navigate → fill → submit → wait for success → return to scan URL
 *   - basic: page.authenticate() — HTTP Basic Auth
 *   - headers: context.setExtraHTTPHeaders() — Bearer tokens, API keys
 *
 * Security Notes:
 * - NEVER logs credential values (passwords, tokens, cookie values)
 * - Wraps all Playwright errors into typed AuthenticationError (no internal leak)
 * - Timeouts prevent infinite redirect loops
 * - Selector validation happens upstream (Zod schema) — this module trusts validated input
 */

import type { BrowserContext, Page } from "playwright-core";
import type { AuthConfig } from "@/lib/validations/auth";

// ─────────────── Error Types ───────────────

/**
 * Typed error for authentication failures during scanning.
 * Contains structured metadata for API responses without leaking credentials.
 */
export class AuthenticationError extends Error {
  public readonly code = "AUTHENTICATION_FAILED" as const;
  public readonly method: string;
  public readonly loginUrl?: string;

  constructor(message: string, method: string, loginUrl?: string) {
    super(message);
    this.name = "AuthenticationError";
    this.method = method;
    this.loginUrl = loginUrl;
  }

  /**
   * Structured error response safe for API output.
   * Contains no credentials.
   */
  toResponse(): { error: string; message: string; method: string; loginUrl?: string } {
    return {
      error: this.code,
      message: this.message,
      method: this.method,
      ...(this.loginUrl && { loginUrl: this.loginUrl }),
    };
  }
}

// ─────────────── Auth Result ───────────────

export interface AuthResult {
  authenticated: boolean;
  method: string;
  error?: string;
}

// ─────────────── Main Entry Point ───────────────

/**
 * Apply authentication to a Playwright browser context before navigation.
 *
 * Must be called AFTER context/page creation and BEFORE navigating to the scan URL.
 * For method "none", this is a no-op that returns immediately.
 *
 * @param context - Playwright BrowserContext (for cookies, headers)
 * @param page - Playwright Page (for form login, basic auth)
 * @param config - Validated auth config (must pass authConfigSchema validation first)
 * @returns AuthResult metadata (stored in scan results, credentials stripped)
 * @throws AuthenticationError if auth fails (wrong selector, timeout, redirect loop)
 */
export async function applyAuthToContext(
  context: BrowserContext,
  page: Page,
  config: AuthConfig
): Promise<AuthResult> {
  switch (config.method) {
    case "none":
      return { authenticated: false, method: "none" };

    case "cookies":
      return applyCookieAuth(context, config.cookies);

    case "form":
      return applyFormAuth(page, config);

    case "basic":
      return applyBasicAuth(page, config.username, config.password);

    case "headers":
      return applyHeadersAuth(context, config.headers);
  }
}

// ─────────────── Cookie Injection ───────────────

/**
 * Inject cookies into browser context. Universal fallback for OAuth/SAML/JWT sessions.
 *
 * @param context - Browser context to inject cookies into
 * @param cookies - Array of Playwright-compatible cookie objects
 * @returns AuthResult
 * @throws AuthenticationError if cookie injection fails
 */
async function applyCookieAuth(
  context: BrowserContext,
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path?: string;
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: "Strict" | "Lax" | "None";
    expires?: number;
  }>
): Promise<AuthResult> {
  try {
    const playwrightCookies = cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path ?? "/",
      secure: c.secure ?? false,
      httpOnly: c.httpOnly ?? false,
      ...(c.sameSite && { sameSite: c.sameSite }),
      ...(c.expires && { expires: c.expires }),
    }));

    await context.addCookies(playwrightCookies);

    return { authenticated: true, method: "cookies" };
  } catch (err) {
    throw new AuthenticationError(
      `Cookie injection failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      "cookies"
    );
  }
}

// ─────────────── Form Login ───────────────

/**
 * Automate form-based login: navigate to login page, fill credentials, submit, verify success.
 *
 * @param page - Playwright page instance
 * @param config - Form auth config with selectors and credentials
 * @returns AuthResult
 * @throws AuthenticationError if login form interaction fails or success indicator not found
 */
async function applyFormAuth(
  page: Page,
  config: {
    loginUrl: string;
    usernameSelector: string;
    passwordSelector: string;
    submitSelector: string;
    username: string;
    password: string;
    successIndicator?: string;
    loginTimeout?: number;
  }
): Promise<AuthResult> {
  const timeout = config.loginTimeout ?? 10000;

  try {
    // Navigate to login page
    await page.goto(config.loginUrl, { waitUntil: "domcontentloaded", timeout });
  } catch (err) {
    throw new AuthenticationError(
      `Cannot reach login page: ${err instanceof Error ? err.message : "Navigation failed"}`,
      "form",
      config.loginUrl
    );
  }

  // Wait for and fill username field
  try {
    await page.waitForSelector(config.usernameSelector, { timeout: 5000 });
    await page.fill(config.usernameSelector, config.username);
  } catch {
    throw new AuthenticationError(
      `Username field not found: selector '${config.usernameSelector}' not visible within 5s`,
      "form",
      config.loginUrl
    );
  }

  // Fill password field
  try {
    await page.waitForSelector(config.passwordSelector, { timeout: 5000 });
    await page.fill(config.passwordSelector, config.password);
  } catch {
    throw new AuthenticationError(
      `Password field not found: selector '${config.passwordSelector}' not visible within 5s`,
      "form",
      config.loginUrl
    );
  }

  // Submit form and wait for navigation
  try {
    await Promise.all([
      page.waitForNavigation({ timeout, waitUntil: "domcontentloaded" }).catch(() => {
        // Some SPAs don't trigger navigation on login — proceed to indicator check
      }),
      page.click(config.submitSelector),
    ]);
  } catch {
    throw new AuthenticationError(
      `Submit button not found or not clickable: selector '${config.submitSelector}'`,
      "form",
      config.loginUrl
    );
  }

  // Verify login success via indicator selector (if provided)
  if (config.successIndicator) {
    try {
      await page.waitForSelector(config.successIndicator, { timeout });
    } catch {
      throw new AuthenticationError(
        `Form login failed: success indicator '${config.successIndicator}' not found after ${Math.round(timeout / 1000)}s`,
        "form",
        config.loginUrl
      );
    }
  } else {
    // No indicator — verify we're not still on the login page (redirect loop detection)
    const currentUrl = page.url();
    if (currentUrl === config.loginUrl || currentUrl === config.loginUrl + "/") {
      throw new AuthenticationError(
        "Form login failed: page did not redirect after submission (still on login URL)",
        "form",
        config.loginUrl
      );
    }
  }

  return { authenticated: true, method: "form" };
}

// ─────────────── HTTP Basic Auth ───────────────

/**
 * Set HTTP Basic Auth credentials. Playwright intercepts 401 challenges automatically.
 *
 * @param page - Playwright page instance
 * @param username - HTTP Basic username
 * @param password - HTTP Basic password
 * @returns AuthResult
 * @throws AuthenticationError if credential setup fails
 */
async function applyBasicAuth(
  page: Page,
  username: string,
  password: string
): Promise<AuthResult> {
  try {
    // Playwright's page-level HTTP credentials for Basic Auth
    const context = page.context();
    await context.setHTTPCredentials({ username, password });

    return { authenticated: true, method: "basic" };
  } catch (err) {
    throw new AuthenticationError(
      `Basic auth setup failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      "basic"
    );
  }
}

// ─────────────── Header Injection ───────────────

/**
 * Set extra HTTP headers on all requests from this context (Bearer tokens, API keys).
 *
 * @param context - Browser context
 * @param headers - Key-value pairs of headers to inject
 * @returns AuthResult
 * @throws AuthenticationError if header setup fails
 */
async function applyHeadersAuth(
  context: BrowserContext,
  headers: Record<string, string>
): Promise<AuthResult> {
  try {
    await context.setExtraHTTPHeaders(headers);

    return { authenticated: true, method: "headers" };
  } catch (err) {
    throw new AuthenticationError(
      `Header injection failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      "headers"
    );
  }
}
