/**
 * RegLayer — Personalized Learning Paths API
 *
 * GET /api/learn — Returns personalized learning paths for the user
 *
 * Uses the user's skill profile to recommend modules,
 * prioritized by weakest categories.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { computeSkillProfile } from "@/lib/skills/engine";
import { generateLearningPaths, LEARNING_MODULES } from "@/lib/skills/learning-paths";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "AUTH_REQUIRED", message: "Authentication required" },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "USER_NOT_FOUND", message: "User not found" },
        { status: 404 }
      );
    }

    // Fetch scans with violations
    const scans = await prisma.scan.findMany({
      where: {
        userId: user.id,
        status: "COMPLETED",
      },
      select: {
        id: true,
        score: true,
        createdAt: true,
        violations: {
          select: {
            ruleId: true,
            impact: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const profile = computeSkillProfile(scans);
    const paths = generateLearningPaths(profile.categories);

    return NextResponse.json({
      paths,
      allModules: LEARNING_MODULES,
      weakestCategory: profile.weakestCategory,
      overallScore: profile.overallScore,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message },
      { status: 500 }
    );
  }
}
