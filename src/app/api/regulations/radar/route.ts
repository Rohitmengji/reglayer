/**
 * GET /api/regulations/radar — Regulatory Radar: compliance readiness per regulation
 *
 * Returns readiness scores, failing criteria, and effort estimates for each
 * applicable regulation, cross-referenced against the workspace's actual violations.
 *
 * Query params: geos (comma-separated), industry
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { computeRadar } from "@/lib/regulations/radarService";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const member = await prisma.workspaceMember.findFirst({
    where: { user: { email: session.user.email } },
  });
  if (!member) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const { searchParams } = request.nextUrl;
  const geosParam = searchParams.get("geos") ?? "GLOBAL";
  const industry = searchParams.get("industry") || undefined;
  const geos = geosParam.split(",").map((g) => g.trim().toUpperCase());

  const radar = await computeRadar(member.workspaceId, geos, industry);

  return NextResponse.json(radar);
}
