/**
 * RegLayer — Auth Config Validation Schemas
 *
 * WHY: Authenticated scanning accepts user-supplied selectors and credentials
 *      that will be executed in a browser context. Strict validation prevents
 *      injection attacks and malformed configs from reaching Playwright.
 *
 * WHAT: Zod schemas for all supported auth methods (cookies, form, basic, headers).
 *
 * HOW: Each auth method has its own discriminated union branch. The top-level
 *      `authConfigSchema` validates the full shape. Selectors are sanitized to
 *      reject script injection patterns.
 *
 * Security Notes:
 * - Selectors are validated against XSS/injection patterns
 * - Cookie values are length-limited to prevent header overflow
 * - Header names are validated against HTTP spec
 * - No credential values are ever logged or returned in error messages
 */

import { z } from "zod";

// ─────────────── Selector Validation ───────────────

/**
 * Dangerous patterns that must never appear in CSS selectors passed to Playwright.
 * These could be used for script injection or prototype pollution.
 */
const DANGEROUS_SELECTOR_PATTERNS = [
  /javascript:/i,
  /<script/i,
  /on\w+\s*=/i, // onclick=, onerror=, etc.
  /\beval\s*\(/i,
  /\bFunction\s*\(/i,
  /\bimport\s*\(/i,
  /\{\{/,         // template injection
  /\$\{/,         // template literal injection
];

/**
 * Validate a CSS selector string is safe for Playwright execution.
 * Allows standard CSS selectors, data attributes, and Playwright-specific syntax.
 */
const safeSelectorSchema = z
  .string()
  .min(1, "Selector cannot be empty")
  .max(500, "Selector too long")
  .refine(
    (selector) => !DANGEROUS_SELECTOR_PATTERNS.some((pattern) => pattern.test(selector)),
    "Selector contains potentially dangerous patterns"
  );

// ─────────────── Cookie Schema ───────────────

const cookieSchema = z.object({
  name: z.string().min(1).max(256),
  value: z.string().max(8192, "Cookie value too large"),
  domain: z.string().min(1).max(256),
  path: z.string().max(1024).optional(),
  secure: z.boolean().optional(),
  httpOnly: z.boolean().optional(),
  sameSite: z.enum(["Strict", "Lax", "None"]).optional(),
  expires: z.number().optional(), // Unix timestamp
});

export type PlaywrightCookie = z.infer<typeof cookieSchema>;

// ─────────────── Auth Method Schemas ───────────────

const cookieAuthSchema = z.object({
  method: z.literal("cookies"),
  cookies: z
    .array(cookieSchema)
    .min(1, "At least one cookie is required")
    .max(50, "Too many cookies (max 50)"),
});

const formAuthSchema = z.object({
  method: z.literal("form"),
  loginUrl: z
    .string()
    .url("loginUrl must be a valid URL")
    .refine(
      (url) => url.startsWith("http://") || url.startsWith("https://"),
      "loginUrl must use http:// or https://"
    ),
  usernameSelector: safeSelectorSchema,
  passwordSelector: safeSelectorSchema,
  submitSelector: safeSelectorSchema,
  username: z.string().min(1, "Username is required").max(256),
  password: z.string().min(1, "Password is required").max(1024),
  successIndicator: safeSelectorSchema.optional(),
  /** Max time (ms) to wait for login to complete. Default 10000. */
  loginTimeout: z.number().min(1000).max(30000).optional(),
});

const basicAuthSchema = z.object({
  method: z.literal("basic"),
  username: z.string().min(1).max(256),
  password: z.string().min(1).max(1024),
});

/**
 * HTTP header name validation per RFC 7230.
 * Must be a token (no spaces, no special chars except dash/underscore).
 */
const httpHeaderNameSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(
    /^[a-zA-Z0-9!#$%&'*+\-.^_`|~]+$/,
    "Invalid HTTP header name"
  );

const headersAuthSchema = z.object({
  method: z.literal("headers"),
  headers: z
    .record(httpHeaderNameSchema, z.string().max(8192))
    .refine(
      (headers) => Object.keys(headers).length > 0 && Object.keys(headers).length <= 20,
      "Must provide between 1 and 20 headers"
    ),
});

const noAuthSchema = z.object({
  method: z.literal("none"),
});

// ─────────────── Combined Auth Config ───────────────

/**
 * Discriminated union of all supported auth methods.
 * Used in scan options as `options.auth`.
 */
export const authConfigSchema = z.discriminatedUnion("method", [
  cookieAuthSchema,
  formAuthSchema,
  basicAuthSchema,
  headersAuthSchema,
  noAuthSchema,
]);

export type AuthConfig = z.infer<typeof authConfigSchema>;
export type CookieAuth = z.infer<typeof cookieAuthSchema>;
export type FormAuth = z.infer<typeof formAuthSchema>;
export type BasicAuth = z.infer<typeof basicAuthSchema>;
export type HeadersAuth = z.infer<typeof headersAuthSchema>;

// ─────────────── Saved Auth Config Schema ───────────────

/**
 * Schema for creating/saving a reusable auth config.
 * The config itself is encrypted before storage.
 */
export const savedAuthConfigSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name too long")
    .regex(/^[a-zA-Z0-9\s\-_.]+$/, "Name contains invalid characters"),
  /** Target domain this config is intended for (informational, not enforced at scan time) */
  domain: z.string().max(256).optional(),
  config: authConfigSchema.refine(
    (config) => config.method !== "none",
    "Cannot save a 'none' auth config"
  ),
});

export type SavedAuthConfigInput = z.infer<typeof savedAuthConfigSchema>;

// ─────────────── Utility: Strip Credentials ───────────────

/**
 * Returns a safe representation of an auth config for API responses.
 * All credential values are replaced with redacted markers.
 * NEVER return raw auth configs to the client.
 *
 * @param config - The full auth config (with credentials)
 * @returns Redacted config safe for client display
 */
export function redactAuthConfig(config: AuthConfig): Record<string, unknown> {
  switch (config.method) {
    case "cookies":
      return {
        method: "cookies",
        cookieCount: config.cookies.length,
        domains: [...new Set(config.cookies.map((c) => c.domain))],
      };
    case "form":
      return {
        method: "form",
        loginUrl: config.loginUrl,
        usernameSelector: config.usernameSelector,
        passwordSelector: config.passwordSelector,
        submitSelector: config.submitSelector,
        hasSuccessIndicator: !!config.successIndicator,
      };
    case "basic":
      return {
        method: "basic",
        username: config.username,
      };
    case "headers":
      return {
        method: "headers",
        headerNames: Object.keys(config.headers),
      };
    case "none":
      return { method: "none" };
  }
}
