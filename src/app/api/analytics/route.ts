import { NextRequest, NextResponse } from "next/server";
import { generateAnalytics } from "@/lib/intelligence/analyticsEngine";

export async function GET(request: NextRequest) {
  const days = Number(request.nextUrl.searchParams.get("days")) || 30;
  const workspaceId = request.nextUrl.searchParams.get("workspace") || undefined;

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
