/**
 * RegLayer — Vendor Accessibility Liability Graph API
 *
 * GET /api/vendor-graph?vendor=<name>&scope=global|workspace&splitDays=30
 *
 *   - no vendor → the cross-tenant liability ranking (top vendors by injected risk × reach).
 *   - vendor    → that vendor's liability score + a regression trend (recent vs prior period).
 *   - scope=global (default) aggregates ANONYMIZED observation counts across all tenants —
 *     the network effect; scope=workspace restricts to the caller's own workspaces.
 *
 * Read-only. Requires the vendor_observations table (pending migration) to return data;
 * until then it responds with an empty graph rather than erroring.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import {
  aggregateVendorObservations,
  detectVendorTrend,
  type VendorObservationInput,
} from "@/lib/vendorgraph/vendorGraph";

const MAX_ROWS = 5000;
const DAY_MS = 86_400_000;

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const sp = request.nextUrl.searchParams;
    const vendor = sp.get("vendor")?.trim() || null;
    const scope = sp.get("scope") === "workspace" ? "workspace" : "global";
    const splitDays = Math.min(365, Math.max(1, Number(sp.get("splitDays")) || 30));

    let workspaceIds: string[] = [];
    if (scope === "workspace") {
      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { memberships: { select: { workspaceId: true } } },
      });
      workspaceIds = user?.memberships.map((m) => m.workspaceId) ?? [];
      if (workspaceIds.length === 0) {
        return NextResponse.json({ scope, vendor, vendors: [], trend: null });
      }
    }

    const where = {
      ...(vendor ? { vendor } : {}),
      ...(scope === "workspace" ? { workspaceId: { in: workspaceIds } } : {}),
    };

    let rows: Array<{
      vendor: string;
      category: string;
      siteId: string | null;
      violationCount: number;
      riskScore: number;
      observedAt: Date;
    }> = [];
    try {
      rows = await prisma.vendorObservation.findMany({
        where,
        orderBy: { observedAt: "desc" },
        take: MAX_ROWS,
        select: {
          vendor: true,
          category: true,
          siteId: true,
          violationCount: true,
          riskScore: true,
          observedAt: true,
        },
      });
    } catch {
      return NextResponse.json(
        { error: "Vendor Liability Graph storage is not yet provisioned (migration pending)." },
        { status: 503 },
      );
    }

    const observations: VendorObservationInput[] = rows.map((r) => ({
      vendor: r.vendor,
      category: r.category,
      siteId: r.siteId,
      violationCount: r.violationCount,
      riskScore: r.riskScore,
      observedAt: r.observedAt,
    }));

    const vendors = aggregateVendorObservations(observations);
    const trend = vendor
      ? detectVendorTrend(observations, vendor, new Date(Date.now() - splitDays * DAY_MS))
      : null;

    return NextResponse.json({
      scope,
      vendor,
      totalObservations: observations.length,
      vendors: vendors.slice(0, 25),
      trend,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
