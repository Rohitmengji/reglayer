/**
 * RegLayer — Quiz API
 *
 * GET  /api/learn/quiz?lessonId=X  — Get quiz questions for a lesson
 * GET  /api/learn/quiz?category=X  — Get quiz questions for entire category
 * POST /api/learn/quiz              — Submit answers and get graded results
 *
 * Questions are randomized per-user (seeded PRNG so same user sees
 * consistent questions within a day, but different from other users).
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import {
  generateQuiz,
  generateCategoryQuiz,
  gradeQuiz,
  getQuestionCount,
  type QuizSession,
  type QuizSubmission,
} from "@/lib/skills/quiz-engine";
import { ALL_CATEGORIES, type SkillCategory } from "@/lib/skills/engine";

function isSkillCategory(value: string): value is SkillCategory {
  return (ALL_CATEGORIES as readonly string[]).includes(value);
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "AUTH_REQUIRED", message: "Authentication required" },
        { status: 401 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json(
        { error: "USER_NOT_FOUND", message: "User not found" },
        { status: 404 },
      );
    }

    const { searchParams } = new URL(request.url);
    const lessonId = searchParams.get("lessonId");
    const category = searchParams.get("category");
    const count = parseInt(searchParams.get("count") || "3", 10);

    if (!lessonId && !category) {
      return NextResponse.json(
        { error: "INVALID_PARAMS", message: "Provide lessonId or category" },
        { status: 400 },
      );
    }

    let quiz: QuizSession;
    if (category) {
      if (!isSkillCategory(category)) {
        return NextResponse.json(
          { error: "INVALID_PARAMS", message: `Unknown category: ${category}` },
          { status: 400 },
        );
      }
      quiz = generateCategoryQuiz(category, user.id, Math.min(count, 10));
    } else {
      quiz = generateQuiz(lessonId!, user.id, Math.min(count, 10));
    }

    // Strip correctIndex before sending to client
    const clientQuestions = quiz.questions.map(({ correctIndex, ...rest }) => rest);

    return NextResponse.json({
      ...quiz,
      questions: clientQuestions,
      availableQuestions: lessonId ? getQuestionCount(lessonId) : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "AUTH_REQUIRED", message: "Authentication required" },
        { status: 401 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json(
        { error: "USER_NOT_FOUND", message: "User not found" },
        { status: 404 },
      );
    }

    const body = await request.json();
    const { lessonId, category, answers } = body as {
      lessonId?: string;
      category?: string;
      answers: QuizSubmission[];
    };

    if (!answers || !Array.isArray(answers)) {
      return NextResponse.json(
        { error: "INVALID_PARAMS", message: "answers array required" },
        { status: 400 },
      );
    }

    // Regenerate the same quiz (same seed = same questions + correct answers)
    let quiz: QuizSession;
    if (category) {
      if (!isSkillCategory(category)) {
        return NextResponse.json(
          { error: "INVALID_PARAMS", message: `Unknown category: ${category}` },
          { status: 400 },
        );
      }
      quiz = generateCategoryQuiz(category, user.id, answers.length);
    } else if (lessonId) {
      quiz = generateQuiz(lessonId, user.id, answers.length);
    } else {
      return NextResponse.json(
        { error: "INVALID_PARAMS", message: "Provide lessonId or category" },
        { status: 400 },
      );
    }

    const result = gradeQuiz(quiz, answers);

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message },
      { status: 500 },
    );
  }
}
