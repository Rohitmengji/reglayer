/**
 * GET /api/chaos — Run accessibility chaos simulation for the workspace
 *
 * Simulates 12 common accessibility regressions and checks which
 * of your monitors would detect each one.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { runChaosSimulation } from "@/lib/chaos/engine";

export const dynamic = "force-dynamic";

export async function GET() {
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

  const report = await runChaosSimulation(member.workspaceId);
  return NextResponse.json(report);
}
