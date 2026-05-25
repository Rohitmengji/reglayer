import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { randomBytes, createHash } from "crypto";
import { getOrCreateWorkspace } from "@/lib/database/workspace";

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

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) return NextResponse.json({ keys: [] });

  const keys = await prisma.apiKey.findMany({
    where: { userId: user.id },
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

  const user = await prisma.user.upsert({
    where: { email: session.user.email },
    update: {},
    create: { email: session.user.email, name: session.user.name || null },
  });
  const workspaceId = await getOrCreateWorkspace(user.id, user.email);

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

  let body: { id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.id) {
    return NextResponse.json({ error: "Key ID required" }, { status: 400 });
  }

  await prisma.apiKey.delete({ where: { id: body.id } });
  return NextResponse.json({ deleted: true });
}
