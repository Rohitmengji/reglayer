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

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
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
 *
 * Wrapped in a Prisma interactive transaction to guarantee atomicity.
 * If any step fails, the entire operation rolls back — no partial deletions.
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

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Scans are workspace-SHARED, not personal — every scan is stamped with
      //    both userId (creator) AND workspaceId. Blanket-deleting by userId would
      //    destroy scan history the rest of the workspace relies on, and cascade-
      //    wipe their Violations + LitigationRiskScores and orphan the evidence
      //    behind immutable ComplianceProofs. So only hard-delete the user's truly
      //    PERSONAL scans (no workspace); for workspace-shared scans, detach the
      //    leaving user (Scan.userId is nullable with onDelete: SetNull) so the
      //    workspace keeps its data. (Scan rows hold no direct PII — url/score/
      //    violations — so anonymizing satisfies GDPR erasure.)
      const personalScans = await tx.scan.findMany({
        where: { userId: user.id, workspaceId: null },
        select: { id: true },
      });
      const personalScanIds = personalScans.map((s) => s.id);
      if (personalScanIds.length > 0) {
        await tx.violation.deleteMany({ where: { scanId: { in: personalScanIds } } });
        await tx.scan.deleteMany({ where: { id: { in: personalScanIds } } });
      }

      // 2. Detach the leaving user from workspace-shared scans (preserve them).
      await tx.scan.updateMany({
        where: { userId: user.id, workspaceId: { not: null } },
        data: { userId: null },
      });

      // 3. Delete API keys
      await tx.apiKey.deleteMany({ where: { userId: user.id } });

      // 4. Delete workspace memberships
      await tx.workspaceMember.deleteMany({ where: { userId: user.id } });

      // 5. Delete credit grants
      await tx.creditGrant.deleteMany({ where: { userId: user.id } });

      // 6. Delete access requests
      await tx.accessRequest.deleteMany({ where: { userId: user.id } });

      // 7. Delete the user
      await tx.user.delete({ where: { id: user.id } });
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to delete account. Please try again or contact support." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, message: "Account permanently deleted" });
}
