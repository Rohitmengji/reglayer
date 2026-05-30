/**
 * RegLayer — Agency API Keys Route
 *
 * POST: Generate a new API key for the agency
 * GET: List existing keys (prefix only)
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { generateApiKeySchema } from "@/lib/validations/agency";
import { randomBytes, createHash } from "crypto";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { id } = await params;

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, isMasterAdmin: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Verify ownership
    const agency = await prisma.agency.findUnique({
      where: { id },
      select: { ownerId: true },
    });

    if (!agency) {
      return NextResponse.json({ error: "Agency not found" }, { status: 404 });
    }

    if (!user.isMasterAdmin && agency.ownerId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = generateApiKeySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { label, expiresAt } = parsed.data;

    // Generate cryptographically random 32-byte key
    const rawKey = randomBytes(32).toString("hex");
    const keyPrefix = `rl_ag_${rawKey.slice(0, 8)}`;
    const keyHash = createHash("sha256").update(rawKey).digest("hex");

    const apiKey = await prisma.agencyApiKey.create({
      data: {
        agencyId: id,
        keyHash,
        keyPrefix,
        label,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });

    // Return plaintext key ONCE — never stored or returned again
    return NextResponse.json(
      {
        apiKey: {
          id: apiKey.id,
          key: rawKey, // shown only this once
          prefix: keyPrefix,
          label: apiKey.label,
          expiresAt: apiKey.expiresAt,
          createdAt: apiKey.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { id } = await params;

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, isMasterAdmin: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const agency = await prisma.agency.findUnique({
      where: { id },
      select: { ownerId: true },
    });

    if (!agency) {
      return NextResponse.json({ error: "Agency not found" }, { status: 404 });
    }

    if (!user.isMasterAdmin && agency.ownerId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const keys = await prisma.agencyApiKey.findMany({
      where: { agencyId: id },
      select: {
        id: true,
        keyPrefix: true,
        label: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ keys });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
