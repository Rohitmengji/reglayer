import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/prisma";
import { randomBytes, createHash } from "crypto";

/**
 * API Key Management
 * 
 * GET  /api/keys — list all keys (shows prefix only)
 * POST /api/keys — create a new key
 * DELETE /api/keys — revoke a key
 */

export async function GET() {
  const keys = await prisma.apiKey.findMany({
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
      userId: "", // TODO: associate with authenticated user
      workspaceId: "",
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
    },
  });

  // Return the raw key ONCE — it can never be retrieved again
  return NextResponse.json({ key: rawKey, prefix }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
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
