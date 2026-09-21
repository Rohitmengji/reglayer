import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/database/prisma";
import { sendEmail, buildPasswordResetEmail, buildPasswordChangedEmail } from "@/lib/email/service";
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

    if (
      process.env.NODE_ENV === "development" &&
      (email === "master@reglayer.dev" || email === "admin@reglayer.dev")
    ) {
      process.stdout.write(`[dev password reset] ${email}: ${otp} (expires in 10 minutes)\n`);
      return NextResponse.json({ success: true, message: "If an account exists, an OTP has been sent." });
    }

    // Send email
    await sendEmail(buildPasswordResetEmail(email, otp));

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
      select: { id: true, otp: true },
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
    sendEmail(buildPasswordChangedEmail(email)).catch(() => { /* non-blocking */ });

    return NextResponse.json({ success: true, message: "Password reset successful. You can now sign in." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Password reset failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
