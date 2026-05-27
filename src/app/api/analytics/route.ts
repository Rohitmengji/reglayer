import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { generateAnalytics } from "@/lib/intelligence/analyticsEngine";
import { prisma } from "@/lib/database/prisma";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const days = Number(request.nextUrl.searchParams.get("days")) || 30;

  // Scope to user's workspace
  const membership = await prisma.workspaceMember.findFirst({
    where: { user: { email: session.user.email } },
    select: { workspaceId: true },
  });
  const workspaceId = membership?.workspaceId;

  try {
    const report = await generateAnalytics(days, workspaceId);
    return NextResponse.json(report);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Analytics failed" },
      { status: 500 }
    );
  }
}
