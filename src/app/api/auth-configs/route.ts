/**
 * RegLayer — Auth Configs API
 *
 * WHY: Users need to save and manage reusable authentication configurations
 *      for recurring/scheduled authenticated scans without re-entering credentials.
 *
 * WHAT:
 *   POST — Create a new saved auth config (credentials encrypted at rest)
 *   GET  — List saved configs (names/metadata only, NEVER credentials)
 *
 * HOW: Credentials are encrypted via AES-256-GCM before storage. On read,
 *      only metadata is returned — never the encrypted blob.
 *
 * Security:
 * - Credentials encrypted at rest (encryptJson)
 * - Responses NEVER include credential data
 * - Scoped to user's workspace (RBAC enforced)
 * - Deletable at any time by the user
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { encryptJson } from "@/lib/crypto";
import { savedAuthConfigSchema } from "@/lib/validations/auth";
import { requireWorkspacePermission } from "@/lib/auth/api-guard";

/**
 * POST /api/auth-configs — Save a new encrypted auth config
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Authorization — stored auth configs hold scan login CREDENTIALS, so creating
  // them is an OWNER/ADMIN settings capability.
  const perm = await requireWorkspacePermission("settings.manage");
  if (!perm.ok) return perm.response;

  // Store the credentials in the workspace settings.manage was VERIFIED in, and
  // attribute to the verified user — both come from the guard, which resolved the
  // role IN that exact workspace (a separate unordered take:1 lookup could pick a
  // different workspace the caller is only read-only in).
  const workspaceId = perm.ctx.workspaceId;
  const userId = perm.ctx.userId;
  if (!workspaceId) {
    return NextResponse.json({ error: "User or workspace not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parseResult = savedAuthConfigSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parseResult.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { name, domain, config } = parseResult.data;

  // Encrypt the full auth config before storage
  const encryptedData = encryptJson(config);

  try {
    const authConfig = await prisma.authConfig.create({
      data: {
        name,
        domain: domain ?? null,
        method: config.method,
        encryptedData,
        userId,
        workspaceId,
      },
      select: { id: true, name: true, domain: true, method: true, createdAt: true },
    });

    return NextResponse.json(authConfig, { status: 201 });
  } catch (err) {
    // Handle unique constraint violation (duplicate name in workspace)
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      return NextResponse.json(
        { error: `Auth config named '${name}' already exists in this workspace` },
        { status: 409 }
      );
    }
    throw err;
  }
}

/**
 * GET /api/auth-configs — List saved auth configs (metadata only, no credentials)
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Resolve the caller's PRIMARY workspace deterministically (earliest-joined),
  // matching how POST + the RBAC guard define it — an unordered take:1 could list
  // a different workspace's configs for a multi-workspace user.
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, memberships: { select: { workspaceId: true }, orderBy: { joinedAt: "asc" }, take: 1 } },
  });

  if (!user || !user.memberships[0]) {
    return NextResponse.json({ error: "User or workspace not found" }, { status: 404 });
  }

  const workspaceId = user.memberships[0].workspaceId;

  const configs = await prisma.authConfig.findMany({
    where: { workspaceId },
    select: {
      id: true,
      name: true,
      domain: true,
      method: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ configs });
}
