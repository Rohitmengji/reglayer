import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";

const VALID_PERSONAS = ["developer", "designer", "legal", "executive"] as const;

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || !VALID_PERSONAS.includes(body.persona)) {
    return NextResponse.json({ error: "Invalid persona" }, { status: 400 });
  }

  // Persist persona to DB
  await prisma.user.update({
    where: { email: session.user.email },
    data: { persona: body.persona },
  });

  return NextResponse.json({ success: true, persona: body.persona });
}
