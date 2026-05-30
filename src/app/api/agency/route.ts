/**
 * RegLayer — Agency API Route (Create + List)
 *
 * POST: Create a new agency (superadmin only)
 * GET: List agencies owned by the current user
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { createAgencySchema } from "@/lib/validations/agency";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    // Only master admin can create agencies
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, isMasterAdmin: true },
    });

    if (!user?.isMasterAdmin) {
      return NextResponse.json({ error: "Forbidden: superadmin only" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = createAgencySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { slug, name, brandName, primaryColor, accentColor, supportEmail, customDomain } = parsed.data;

    // Check slug uniqueness
    const existing = await prisma.agency.findUnique({ where: { slug } });
    if (existing) {
      return NextResponse.json({ error: "Slug already taken" }, { status: 409 });
    }

    // Require an ownerId in the body or default to current user
    const ownerId = (body.ownerId as string) || user.id;

    const agency = await prisma.agency.create({
      data: {
        name,
        slug,
        brandName,
        primaryColor,
        accentColor,
        supportEmail: supportEmail ?? null,
        customDomain: customDomain ?? null,
        ownerId,
      },
    });

    return NextResponse.json({ agency }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, isMasterAdmin: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Master admin sees all, regular users see their own
    const where = user.isMasterAdmin ? {} : { ownerId: user.id };

    const agencies = await prisma.agency.findMany({
      where,
      include: {
        _count: { select: { clients: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ agencies });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
