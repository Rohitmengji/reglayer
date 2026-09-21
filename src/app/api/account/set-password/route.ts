/**
 * RegLayer — First Sign-In Password Setup
 *
 * WHY: a member invited by email signs in with a temporary password. That
 *      credential is delivered over email, so it must be replaced before the
 *      account is used for anything else.
 * WHAT: POST { newPassword } for a signed-in member whose invitation is still
 *       pending. Stores the chosen password and retires the invitation.
 * HOW: session identifies the account; the pending invitation is the authority
 *      for "setup required", so this cannot be used to bypass the current-password
 *      check in /api/auth/change-password.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { applyRateLimit } from "@/lib/rate-limit-middleware";
import { sendPasswordSetEmail } from "@/lib/email/service";
import { consumeInviteCredentials, hasPendingInviteCredential } from "@/lib/auth/invite-credential";

/** Matches the strength required elsewhere; 72 bytes is bcrypt's input limit. */
export const PASSWORD_RULES = "At least 12 characters, with an uppercase letter, a lowercase letter and a number.";

function passwordProblem(password: unknown): string | null {
  if (typeof password !== "string" || password.length < 12) return PASSWORD_RULES;
  if (Buffer.byteLength(password, "utf8") > 72) return "Password must fit within 72 UTF-8 bytes.";
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) return PASSWORD_RULES;
  return null;
}

export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "auth");
  if (blocked) return blocked;

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let body: { newPassword?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const problem = passwordProblem(body.newPassword);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      email: true,
      name: true,
      memberships: { orderBy: { joinedAt: "asc" }, take: 1, select: { workspace: { select: { name: true } } } },
    },
  });
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  if (!(await hasPendingInviteCredential(user.email))) {
    return NextResponse.json(
      { error: "No password setup is pending. Change your password from Settings instead.", code: "NO_PASSWORD_SETUP_PENDING" },
      { status: 409 },
    );
  }

  const passwordHash = await bcrypt.hash(body.newPassword as string, 12);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  await consumeInviteCredentials(user.email);

  // Welcome note only — a password must never travel by email.
  sendPasswordSetEmail(user.email, {
    name: user.name,
    workspaceName: user.memberships[0]?.workspace.name ?? null,
  }).catch(() => { /* delivery must not fail the setup */ });

  return NextResponse.json({ success: true });
}
