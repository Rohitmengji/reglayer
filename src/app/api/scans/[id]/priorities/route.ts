import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { consumeCredits } from "@/lib/credits";
import { generatePriorityReport } from "@/lib/intelligence/priorityEngine";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Auth & credit check
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const creditResult = await consumeCredits(user.id, "priorityRanking");
  if (!creditResult.success) {
    return NextResponse.json(
      { error: "Insufficient AI credits", creditsRemaining: creditResult.creditsRemaining, cost: creditResult.cost, upgradeRequired: true },
      { status: 429 }
    );
  }

  try {
    const report = await generatePriorityReport(id);
    return NextResponse.json(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("not found")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
