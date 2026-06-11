/**
 * RegLayer — API Key Authentication
 *
 * WHY: Multiple routes duplicate key validation (gate, gate/review, guard/evaluate).
 *      External CI/CD tools need Bearer auth on scan/crawl routes.
 * WHAT: Shared helper that authenticates via API key OR session fallback.
 * HOW: Extracts Bearer token, validates prefix + SHA-256 hash against stored keys,
 *      returns context with userId/workspaceId/email for downstream use.
 */
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/database/prisma";
import { authOptions } from "@/lib/auth/config";

export interface ApiKeyContext {
  keyId: string;
  userId: string;
  workspaceId: string;
  userEmail: string;
}

export type AuthenticateApiKeyResult =
  | { status: "no-key" }
  | { status: "invalid" }
  | { status: "ok"; context: ApiKeyContext };

/**
 * Validate a Bearer API key from the request.
 *
 * - "no-key": No authorization header or not Bearer format → caller decides fallback.
 * - "invalid": Key provided but doesn't match / expired → hard reject (no fallback).
 * - "ok": Key valid → context with user/workspace info.
 */
export async function authenticateApiKey(
  request: NextRequest
): Promise<AuthenticateApiKeyResult> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { status: "no-key" };
  }

  const apiKey = authHeader.slice(7); // "Bearer ".length
  if (apiKey.length < 10) {
    return { status: "invalid" };
  }

  const prefix = apiKey.substring(0, 8);
  const keyHash = createHash("sha256").update(apiKey).digest("hex");

  const keyRecord = await prisma.apiKey.findFirst({
    where: {
      prefix,
      keyHash,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: {
      id: true,
      userId: true,
      workspaceId: true,
      user: { select: { email: true } },
    },
  });

  if (!keyRecord) {
    return { status: "invalid" };
  }

  // Fire-and-forget lastUsedAt update — non-critical
  prisma.apiKey
    .update({ where: { id: keyRecord.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return {
    status: "ok",
    context: {
      keyId: keyRecord.id,
      userId: keyRecord.userId,
      workspaceId: keyRecord.workspaceId,
      userEmail: keyRecord.user.email,
    },
  };
}

export type AuthenticateRequestResult =
  | { ok: true; userEmail: string; userId: string; workspaceId: string | null; via: "key" | "session"; keyId?: string }
  | { ok: false; response: NextResponse };

/**
 * Authenticate a request via API key (preferred) or session fallback.
 *
 * Rules:
 * - If a Bearer key is present and INVALID → hard 403 (never falls back to session).
 * - If no key → falls back to NextAuth session.
 * - If neither → 401.
 */
export async function authenticateRequest(
  request: NextRequest
): Promise<AuthenticateRequestResult> {
  const keyResult = await authenticateApiKey(request);

  if (keyResult.status === "ok") {
    return {
      ok: true,
      userEmail: keyResult.context.userEmail,
      userId: keyResult.context.userId,
      workspaceId: keyResult.context.workspaceId,
      via: "key",
      keyId: keyResult.context.keyId,
    };
  }

  if (keyResult.status === "invalid") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Invalid or expired API key" },
        { status: 403 }
      ),
    };
  }

  // No key provided — fall back to session
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Authentication required. Provide a Bearer API key or sign in." },
        { status: 401 }
      ),
    };
  }

  // Resolve userId for session user
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, memberships: { select: { workspaceId: true }, take: 1 } },
  });

  return {
    ok: true,
    userEmail: session.user.email,
    userId: user?.id ?? "",
    workspaceId: user?.memberships[0]?.workspaceId ?? null,
    via: "session",
  };
}
