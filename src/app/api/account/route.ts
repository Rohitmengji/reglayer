/**
 * RegLayer — Account Management API
 *
 * GET  /api/account → Get profile data
 * PATCH /api/account → Update profile (name, email)
 * DELETE /api/account → Delete account + all data (GDPR Article 17)
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { z } from "zod";

const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
});

/**
 * GET /api/account — Returns the current user's profile.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      plan: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({ user });
}

/**
 * PATCH /api/account — Update profile fields.
 */
export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  const { name, email } = parsed.data;

  // If changing email, check uniqueness
  if (email && email !== session.user.email) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }
  }

  const updated = await prisma.user.update({
    where: { email: session.user.email },
    data: {
      ...(name !== undefined && { name }),
      ...(email !== undefined && { email }),
    },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      plan: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ user: updated });
}

/**
 * DELETE /api/account — Permanently delete user account and all associated data.
 * GDPR Article 17 — Right to Erasure.
 */
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Require confirmation header to prevent accidental deletion
  const confirmation = request.headers.get("x-confirm-delete");
  if (confirmation !== "DELETE_MY_ACCOUNT") {
    return NextResponse.json(
      { error: "Missing confirmation header: x-confirm-delete: DELETE_MY_ACCOUNT" },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Delete in order respecting foreign key constraints
  // 1. Delete user's violations (via scans)
  const scanIds = await prisma.scan.findMany({
    where: { userId: user.id },
    select: { id: true },
  });
  const scanIdList = scanIds.map((s) => s.id);

  if (scanIdList.length > 0) {
    await prisma.violation.deleteMany({ where: { scanId: { in: scanIdList } } });
  }

  // 2. Delete scans
  await prisma.scan.deleteMany({ where: { userId: user.id } });

  // 3. Delete API keys
  await prisma.apiKey.deleteMany({ where: { userId: user.id } });

  // 4. Delete workspace memberships
  await prisma.workspaceMember.deleteMany({ where: { userId: user.id } });

  // 5. Delete credit grants
  await prisma.creditGrant.deleteMany({ where: { userId: user.id } });

  // 6. Delete access requests
  await prisma.accessRequest.deleteMany({ where: { userId: user.id } });

  // 7. Delete the user
  await prisma.user.delete({ where: { id: user.id } });

  return NextResponse.json({ success: true, message: "Account permanently deleted" });
}
