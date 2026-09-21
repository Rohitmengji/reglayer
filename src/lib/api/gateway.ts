/**
 * RegLayer — Enterprise API Gateway Middleware
 *
 * Unified middleware for all /api/v1/ endpoints.
 * Handles: API key auth, rate limiting, request metering, audit logging.
 *
 * WHY: Every enterprise API endpoint needs the same boilerplate —
 * auth check, rate limit, usage tracking, error formatting. This
 * middleware handles it once so routes stay thin.
 *
 * INSPIRED BY:
 *   - Stripe API (consistent auth + rate limiting + idempotency)
 *   - OpenAI API (Bearer auth + usage tracking + versioning)
 *   - Vercel API (team scoping + rate tiers)
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/auth/api-key";
import { requireWorkspacePermission } from "@/lib/auth/api-guard";
import { hasPermission, type Permission, type WorkspaceRole } from "@/lib/auth/rbac";
import { rateLimit, RATE_LIMITS, rateLimitHeaders } from "@/lib/rate-limit";
import { prisma } from "@/lib/database/prisma";
import { logger } from "@/lib/telemetry/logger";

const log = logger.withContext({ module: "api-gateway" });

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GatewayContext {
  userId: string;
  workspaceId: string;
  email: string | null;
  authMethod: "api-key" | "session";
  apiKeyId?: string;
}

export type GatewayResult =
  | { ok: true; ctx: GatewayContext }
  | { ok: false; response: NextResponse };

// ── Rate Limit Tiers ──────────────────────────────────────────────────────────

const V1_RATE_LIMITS: Record<string, { limit: number; windowSec: number }> = {
  chat:     { limit: 30,  windowSec: 60 },   // 30 req/min
  rag:      { limit: 60,  windowSec: 60 },   // 60 req/min
  embed:    { limit: 200, windowSec: 60 },   // 200 req/min (cheap)
  search:   { limit: 100, windowSec: 60 },   // 100 req/min
  evaluate: { limit: 100, windowSec: 60 },   // 100 req/min
  agents:   { limit: 20,  windowSec: 60 },   // 20 req/min (expensive)
  workflow: { limit: 10,  windowSec: 60 },   // 10 req/min (very expensive)
};

// ── Main Middleware ───────────────────────────────────────────────────────────

/**
 * Authenticate and authorize an API v1 request.
 * Supports both API key (Bearer token) and session (cookie) auth.
 *
 * @param request   The incoming request
 * @param endpoint  Which v1 endpoint (for rate limiting tier)
 */
export async function gatewayAuth(
  request: NextRequest,
  endpoint: string,
): Promise<GatewayResult> {
  // 1. Try API key auth first (preferred for programmatic access)
  const authHeader = request.headers.get("authorization");
  const permission: Permission = request.method !== "GET" && ["agents", "workflow", "embed"].includes(endpoint) ? "scans.run" : "scans.view";
  if (authHeader?.startsWith("Bearer rl_")) {
    return apiKeyAuth(authHeader, endpoint, permission);
  }
  if (authHeader !== null || request.headers.has("x-api-key")) {
    return { ok: false, response: apiError("Use a valid Bearer API key", "invalid_api_key", 401) };
  }

  // 2. Fall back to session auth (for browser/dashboard access)
  return sessionAuth(endpoint, permission);
}

async function apiKeyAuth(authHeader: string, endpoint: string, permission: Permission): Promise<GatewayResult> {
  const key = await authenticateApiKey(authHeader);
  if (!key) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Invalid API key", code: "invalid_api_key" },
        { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
      ),
    };
  }

  if (!key.workspaceId || !key.userId) return { ok: false, response: apiError("API key requires a current workspace member", "forbidden", 403) };
  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: key.userId, workspaceId: key.workspaceId } },
    select: { role: true },
  });
  if (!membership || !hasPermission("USER", membership.role as WorkspaceRole, permission)) {
    return { ok: false, response: apiError("API key lacks permission in its workspace", "forbidden", 403) };
  }

  // Rate limit by API key
  const tier = V1_RATE_LIMITS[endpoint] ?? RATE_LIMITS.api;
  const rl = await rateLimit(`v1:${key.id}:${endpoint}`, tier, endpoint);
  if (!rl.success) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Rate limit exceeded", code: "rate_limit" },
        { status: 429, headers: rateLimitHeaders(rl) },
      ),
    };
  }

  // Touch lastUsedAt (fire-and-forget)
  prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

  return {
    ok: true,
    ctx: {
      userId: key.userId ?? "",
      workspaceId: key.workspaceId,
      email: null,
      authMethod: "api-key",
      apiKeyId: key.id,
    },
  };
}

async function sessionAuth(endpoint: string, permission: Permission): Promise<GatewayResult> {
  const access = await requireWorkspacePermission(permission);
  if (!access.ok) return access;
  if (!access.ctx.workspaceId) return { ok: false, response: apiError("Select a workspace before continuing", "workspace_required", 403) };

  // Rate limit by user email
  const tier = V1_RATE_LIMITS[endpoint] ?? RATE_LIMITS.api;
  const rl = await rateLimit(`v1:${access.ctx.userId}:${endpoint}`, tier, endpoint);
  if (!rl.success) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Rate limit exceeded", code: "rate_limit" },
        { status: 429, headers: rateLimitHeaders(rl) },
      ),
    };
  }

  return {
    ok: true,
    ctx: {
      userId: access.ctx.userId,
      workspaceId: access.ctx.workspaceId,
      email: access.ctx.email,
      authMethod: "session",
    },
  };
}

// ── Response Helpers ──────────────────────────────────────────────────────────

/** Standard success response with API version header */
export function apiResponse(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: {
      "X-API-Version": "v1",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** Standard error response */
export function apiError(message: string, code: string, status: number): NextResponse {
  return NextResponse.json(
    { error: message, code },
    { status, headers: { "X-API-Version": "v1" } },
  );
}

/** Log API request for audit */
export function auditLog(
  ctx: GatewayContext,
  endpoint: string,
  method: string,
  durationMs: number,
  status: number,
): void {
  log.info("API v1 request", {
    endpoint,
    method,
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
    authMethod: ctx.authMethod,
    durationMs,
    status,
  });
}
