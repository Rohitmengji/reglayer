import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/database/prisma";
import { sendEmail } from "@/lib/email/service";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { z } from "zod";

// Generate 6-digit OTP
function generateOTP(): string {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return String(array[0] % 1000000).padStart(6, "0");
}

const sendOtpSchema = z.object({
  email: z.string().email(),
});

const verifyOtpSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128)
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
});

/**
 * POST — Send OTP to email
 */
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  const rl = await rateLimit(`forgot:${ip}`, { limit: 5, windowSec: 3600 }, "forgot-password");
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429, headers: rateLimitHeaders(rl) }
    );
  }

  try {
    const body = await request.json();
    const parsed = sendOtpSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    const { email } = parsed.data;

    // Check if user exists (don't reveal if they don't)
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Return success anyway to prevent email enumeration
      return NextResponse.json({ success: true, message: "If an account exists, an OTP has been sent." });
    }

    // Invalidate previous OTPs for this email
    await prisma.passwordReset.updateMany({
      where: { email, used: false },
      data: { used: true },
    });

    // Generate and store OTP (10 minute expiry)
    const otp = generateOTP();
    const hashedOtp = await bcrypt.hash(otp, 10);

    await prisma.passwordReset.create({
      data: {
        email,
        otp: hashedOtp,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    // Send email
    await sendEmail({
      to: email,
      subject: "RegLayer — Password Reset Code",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
          <h2 style="color: #0a0a0a; margin-bottom: 8px;">Reset your password</h2>
          <p style="color: #525252; font-size: 14px; line-height: 1.6;">
            Enter this code to reset your RegLayer password. It expires in 10 minutes.
          </p>
          <div style="background: #f5f5f5; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #0a0a0a;">${otp}</span>
          </div>
          <p style="color: #737373; font-size: 12px;">
            If you didn't request this, you can safely ignore this email.
          </p>
        </div>
      `,
      text: `Your RegLayer password reset code is: ${otp}. It expires in 10 minutes.`,
    });

    return NextResponse.json({ success: true, message: "If an account exists, an OTP has been sent." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send OTP";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PUT — Verify OTP and reset password
 */
export async function PUT(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  const rl = await rateLimit(`reset:${ip}`, { limit: 10, windowSec: 3600 }, "password-reset");
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429, headers: rateLimitHeaders(rl) }
    );
  }

  try {
    const body = await request.json();
    const parsed = verifyOtpSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid input" },
        { status: 400 }
      );
    }

    const { email, otp, newPassword } = parsed.data;

    // Find valid (unused, non-expired) OTP for this email
    const resets = await prisma.passwordReset.findMany({
      where: { email, used: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    let validReset = null;
    for (const reset of resets) {
      const match = await bcrypt.compare(otp, reset.otp);
      if (match) {
        validReset = reset;
        break;
      }
    }

    if (!validReset) {
      return NextResponse.json({ error: "Invalid or expired code. Please request a new one." }, { status: 400 });
    }

    // Mark OTP as used
    await prisma.passwordReset.update({
      where: { id: validReset.id },
      data: { used: true },
    });

    // Update password
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { email },
      data: { passwordHash },
    });

    // Send confirmation email (security alert)
    sendEmail({
      to: email,
      subject: "RegLayer — Your password was changed",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
          <h2 style="color: #0a0a0a; margin-bottom: 8px;">Password changed successfully</h2>
          <p style="color: #525252; font-size: 14px; line-height: 1.6;">
            Your RegLayer account password was just reset. If you made this change, no further action is needed.
          </p>
          <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 24px 0;">
            <p style="color: #991b1b; font-size: 13px; margin: 0; font-weight: 500;">
              ⚠️ If you did NOT request this change, please contact us immediately at support@reglayer.eu and secure your account.
            </p>
          </div>
          <p style="color: #737373; font-size: 12px;">
            Time: ${new Date().toUTCString()}<br/>
            Account: ${email}
          </p>
        </div>
      `,
      text: `Your RegLayer password was changed on ${new Date().toUTCString()}. If you did not make this change, contact support@reglayer.eu immediately.`,
    }).catch(() => { /* non-blocking */ });

    return NextResponse.json({ success: true, message: "Password reset successful. You can now sign in." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Password reset failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
