/**
 * RegLayer — API Keys Route
 *
 * WHY: Developers need API keys for CI/CD integration and programmatic access.
 * WHAT: GET (list keys with prefix/last-used), POST (create key, return once), DELETE (revoke key).
 * HOW: Key generation: randomBytes(32) → hash with SHA-256. Only hash stored. Full key shown once on create.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { randomBytes, createHash } from "crypto";
import { getOrCreateWorkspace } from "@/lib/database/workspace";
import { requireWorkspacePermission } from "@/lib/auth/api-guard";

/**
 * API Key Management
 * 
 * GET  /api/keys — list all keys (shows prefix only)
 * POST /api/keys — create a new key
 * DELETE /api/keys — revoke a key
 */

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Authorization — viewing keys requires apiKeys.manage in the current workspace.
  const perm = await requireWorkspacePermission("apiKeys.manage");
  if (!perm.ok) return perm.response;

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) return NextResponse.json({ keys: [] });

  // SECURITY: scope to the CURRENT workspace only — never leak keys from other
  // workspaces the user belongs to (cross-workspace IDOR).
  const keys = await prisma.apiKey.findMany({
    where: {
      userId: user.id,
      ...(perm.ctx.workspaceId ? { workspaceId: perm.ctx.workspaceId } : {}),
    },
    select: {
      id: true,
      name: true,
      prefix: true,
      createdAt: true,
      lastUsedAt: true,
      expiresAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ keys });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Authorization — API keys grant programmatic access, so issuing them is an
  // OWNER/ADMIN capability. MEMBERs and VIEWERs cannot mint keys.
  const perm = await requireWorkspacePermission("apiKeys.manage");
  if (!perm.ok) return perm.response;

  const user = await prisma.user.upsert({
    where: { email: session.user.email },
    update: {},
    create: { email: session.user.email, name: session.user.name || null },
  });
  // Bind the key to the workspace apiKeys.manage was VERIFIED in — not a
  // separately-resolved one (which could differ for a multi-workspace user and
  // mint a credential scoped to a workspace they don't administer).
  const workspaceId = perm.ctx.workspaceId ?? (await getOrCreateWorkspace(user.id, user.email));

  let body: { name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = body.name || "Unnamed Key";

  // Generate a secure random key
  const rawKey = `rl_${randomBytes(32).toString("hex")}`;
  const prefix = rawKey.substring(0, 8);
  const keyHash = createHash("sha256").update(rawKey).digest("hex");

  // Store hashed key (never store plaintext)
  await prisma.apiKey.create({
    data: {
      name,
      prefix,
      keyHash,
      userId: user.id,
      workspaceId,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
    },
  });

  // Return the raw key ONCE — it can never be retrieved again
  return NextResponse.json({ key: rawKey, prefix }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Authorization — revoking keys is an OWNER/ADMIN capability.
  const perm = await requireWorkspacePermission("apiKeys.manage");
  if (!perm.ok) return perm.response;

  let body: { id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.id) {
    return NextResponse.json({ error: "Key ID required" }, { status: 400 });
  }

  // Verify ownership — prevent IDOR
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const key = await prisma.apiKey.findUnique({ where: { id: body.id } });
  // SECURITY: verify BOTH ownership AND workspace scope — prevents cross-workspace
  // key revocation (IDOR). A user with permission in Workspace A must not be able
  // to revoke a key scoped to Workspace B.
  if (!key || key.userId !== user.id || key.workspaceId !== perm.ctx.workspaceId) {
    return NextResponse.json({ error: "Key not found" }, { status: 404 });
  }

  // Revoke by setting expiresAt to now — the key becomes immediately invalid
  // (authenticateApiKey checks expiresAt > now) while preserving the record for audit.
  await prisma.apiKey.update({
    where: { id: body.id },
    data: { expiresAt: new Date() },
  });
  return NextResponse.json({ revoked: true });
}
