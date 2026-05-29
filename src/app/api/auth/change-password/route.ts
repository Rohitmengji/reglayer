/**
 * RegLayer — Change Password API
 *
 * WHY: Users with credentials-based accounts need to update their password.
 * WHAT: POST with currentPassword + newPassword. Validates current, hashes new with bcrypt.
 * HOW: Verifies old password via bcrypt.compare(), hashes new password, updates user record.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import bcrypt from "bcryptjs";
import { applyRateLimit } from "@/lib/rate-limit-middleware";
import { sendEmail } from "@/lib/email/service";

export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "auth");
  if (blocked) return blocked;

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let body: { currentPassword: string; newPassword: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { currentPassword, newPassword } = body;

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: "Both current and new password are required" }, { status: 400 });
  }

  if (newPassword.length < 8) {
    return NextResponse.json({ error: "New password must be at least 8 characters" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, passwordHash: true },
  });

  if (!user || !user.passwordHash) {
    return NextResponse.json(
      { error: "Password change is not available for OAuth accounts" },
      { status: 400 }
    );
  }

  const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isValid) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 403 });
  }

  const newHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: newHash },
  });

  // Send confirmation email (security alert)
  sendEmail({
    to: session.user.email,
    subject: "RegLayer — Your password was changed",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h2 style="color: #0a0a0a; margin-bottom: 8px;">Password changed successfully</h2>
        <p style="color: #525252; font-size: 14px; line-height: 1.6;">
          Your RegLayer account password was just updated from Settings. If you made this change, no further action is needed.
        </p>
        <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 24px 0;">
          <p style="color: #991b1b; font-size: 13px; margin: 0; font-weight: 500;">
            ⚠️ If you did NOT make this change, your account may be compromised. Please reset your password immediately or contact support@reglayer.eu.
          </p>
        </div>
        <p style="color: #737373; font-size: 12px;">
          Time: ${new Date().toUTCString()}<br/>
          Account: ${session.user.email}
        </p>
      </div>
    `,
    text: `Your RegLayer password was changed on ${new Date().toUTCString()}. If you did not make this change, contact support@reglayer.eu immediately.`,
  }).catch(() => { /* non-blocking */ });

  return NextResponse.json({ success: true });
}
