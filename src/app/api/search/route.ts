/**
 * RegLayer — Global content search (for the command palette)
 *
 * WHY: ⌘K only navigated static pages. This lets users jump straight to a
 * specific scan, site, or violation by typing part of its URL / rule / text.
 *
 * WHAT: GET /api/search?q=... returns up to a handful of matches per category,
 * scoped to the current user's workspace (same scoping as /api/scans).
 *
 * HOW: Case-insensitive `contains` queries across Scan, Site, and Violation.
 * Read-only; no new tables.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";

export interface SearchResult {
  type: "scan" | "site" | "violation";
  label: string;
  sublabel: string;
  href: string;
}

const PER_CATEGORY = 5;

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        isMasterAdmin: true,
        memberships: { select: { workspaceId: true }, take: 1 },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const workspaceId = user.memberships[0]?.workspaceId;
    const scanScope =
      user.isMasterAdmin && workspaceId ? { workspaceId } : { userId: user.id };
    const insensitive = { contains: q, mode: "insensitive" as const };

    const [scans, sites, violations] = await Promise.all([
      prisma.scan.findMany({
        where: {
          ...scanScope,
          OR: [{ url: insensitive }, { pageTitle: insensitive }],
        },
        select: { id: true, url: true, pageTitle: true, score: true },
        orderBy: { createdAt: "desc" },
        take: PER_CATEGORY,
      }),
      workspaceId
        ? prisma.site.findMany({
            where: {
              workspaceId,
              OR: [{ url: insensitive }, { name: insensitive }],
            },
            select: { id: true, url: true, name: true },
            orderBy: { updatedAt: "desc" },
            take: PER_CATEGORY,
          })
        : Promise.resolve([]),
      prisma.violation.findMany({
        where: {
          scan: { is: scanScope },
          OR: [{ ruleId: insensitive }, { help: insensitive }, { description: insensitive }],
        },
        select: { id: true, ruleId: true, help: true, impact: true, scanId: true },
        orderBy: { statusUpdatedAt: "desc" },
        take: PER_CATEGORY,
      }),
    ]);

    const results: SearchResult[] = [
      ...scans.map((s) => ({
        type: "scan" as const,
        label: s.pageTitle || s.url,
        sublabel: s.score != null ? `Scan · ${Math.round(s.score)}/100` : "Scan",
        href: `/report/${s.id}`,
      })),
      ...sites.map((s) => ({
        type: "site" as const,
        label: s.name || s.url,
        sublabel: "Site",
        href: `/sites/${s.id}/trends`,
      })),
      ...violations.map((v) => ({
        type: "violation" as const,
        label: v.help || v.ruleId,
        sublabel: `${v.impact} · ${v.ruleId}`,
        href: `/violations?scanId=${v.scanId}`,
      })),
    ];

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ error: "Search failed", results: [] }, { status: 500 });
  }
}
