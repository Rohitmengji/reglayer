/**
 * RegLayer — Dependency Advisories API
 *
 * GET /api/dependencies/advisories — List advisories relevant to workspace sites
 * GET /api/dependencies/advisories?siteId=X — Advisories for a specific site
 * GET /api/dependencies/advisories?all=true — All published advisories (public feed)
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { getAdvisoriesForSite } from "@/lib/dependencies/service";

export const dynamic = "force-dynamic";

/**
 * GET /api/dependencies/advisories
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  // Public feed mode — anyone can see all advisories (like CVE database)
  if (searchParams.get("all") === "true") {
    const advisories = await prisma.dependencyAdvisory.findMany({
      where: { resolvedAt: null },
      orderBy: { publishedAt: "desc" },
      take: 100,
    });
    return NextResponse.json({ advisories });
  }

  // Authenticated mode — advisories relevant to the user's sites
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const member = await prisma.workspaceMember.findFirst({
    where: { user: { email: session.user.email } },
    include: { workspace: true },
  });
  if (!member) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const siteId = searchParams.get("siteId");

  if (siteId) {
    // Verify site belongs to workspace (IDOR guard)
    const site = await prisma.site.findFirst({
      where: { id: siteId, workspaceId: member.workspace.id },
    });
    if (!site) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }
    const result = await getAdvisoriesForSite(siteId);
    return NextResponse.json(result);
  }

  // All sites in workspace
  const sites = await prisma.site.findMany({
    where: { workspaceId: member.workspace.id },
    select: { id: true, url: true, name: true },
  });

  const results = await Promise.all(
    sites.map(async (site) => {
      const { advisories } = await getAdvisoriesForSite(site.id);
      return { site, advisories };
    })
  );

  // Flatten and deduplicate
  const allAdvisories = results.flatMap((r) =>
    r.advisories.map((a) => ({ ...a, siteId: r.site.id, siteUrl: r.site.url }))
  );

  // Summary stats
  const critical = allAdvisories.filter((a) => a.level === "CRITICAL").length;
  const warning = allAdvisories.filter((a) => a.level === "WARNING").length;

  return NextResponse.json({
    summary: { critical, warning, total: allAdvisories.length, sitesChecked: sites.length },
    advisories: allAdvisories,
  });
}
