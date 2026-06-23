/**
 * RegLayer — Contact / Sales API
 *
 * WHY: The marketing contact form (incl. the Enterprise "Contact Sales" CTA) must
 *      actually deliver a message — a silent stub is a dead end for a buyer.
 * WHAT: POST validates the submission, blocks abuse (rate limit + honeypot), and
 *       emails the right inbox (sales / support / general) with the sender set as
 *       reply-to. Every failure returns an explicit code so the UI can tell the
 *       user the real next step — never a fake "sent".
 * HOW: Mirrors the codebase route pattern (zod safeParse + rateLimit). User
 *       content is HTML-escaped before templating to prevent injection into the
 *       notification email.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { sendEmail, isEmailConfigured } from "@/lib/email/service";

const SUBJECTS = ["general", "support", "enterprise", "partnership", "bug"] as const;
type Subject = (typeof SUBJECTS)[number];

const contactSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  email: z.string().trim().email("A valid email is required").max(200),
  company: z.string().trim().max(200).optional(),
  subject: z.enum(SUBJECTS).default("general"),
  message: z.string().trim().min(10, "Message must be at least 10 characters").max(5000),
  // Honeypot: a hidden field real users never fill. Bots do.
  website: z.string().optional(),
});

// Route each enquiry to the inbox that owns it (addresses shown on the contact page).
const ROUTING: Record<Subject, { to: string; label: string }> = {
  general: { to: "hello@reglayer.dev", label: "General Inquiry" },
  support: { to: "support@reglayer.dev", label: "Technical Support" },
  enterprise: { to: "sales@reglayer.dev", label: "Enterprise Pricing" },
  partnership: { to: "sales@reglayer.dev", label: "Partnership" },
  bug: { to: "support@reglayer.dev", label: "Bug Report" },
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;"
  );
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  // Throttle abuse: 5 submissions/hour/IP.
  const rl = await rateLimit(`contact:${ip}`, { limit: 5, windowSec: 3600 }, "contact");
  if (!rl.success) {
    return NextResponse.json(
      { ok: false, code: "rate_limited" },
      { status: 429, headers: rateLimitHeaders(rl) }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, code: "invalid_json" }, { status: 400 });
  }

  const parsed = contactSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, code: "validation", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { name, email, company, subject, message, website } = parsed.data;

  // Honeypot tripped — silently accept so we don't teach the bot, but send nothing.
  if (website && website.length > 0) {
    return NextResponse.json({ ok: true });
  }

  // Be honest about delivery: if email isn't wired up, say so instead of faking success.
  if (!isEmailConfigured()) {
    return NextResponse.json({ ok: false, code: "email_unavailable" }, { status: 503 });
  }

  const route = ROUTING[subject];
  const safe = {
    name: escapeHtml(name),
    email: escapeHtml(email),
    company: company ? escapeHtml(company) : "",
    message: escapeHtml(message).replace(/\n/g, "<br>"),
  };
  const submittedAt = new Date().toISOString();

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="border-bottom: 1px solid #e5e5e5; padding: 16px 0;">
        <h2 style="margin: 0; font-size: 18px; color: #171717;">New ${escapeHtml(route.label)} message</h2>
      </div>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
        <tr><td style="padding:8px 12px;border:1px solid #e5e5e5;color:#525252;">Name</td><td style="padding:8px 12px;border:1px solid #e5e5e5;font-weight:600;">${safe.name}</td></tr>
        <tr><td style="padding:8px 12px;border:1px solid #e5e5e5;color:#525252;">Email</td><td style="padding:8px 12px;border:1px solid #e5e5e5;">${safe.email}</td></tr>
        ${safe.company ? `<tr><td style="padding:8px 12px;border:1px solid #e5e5e5;color:#525252;">Company</td><td style="padding:8px 12px;border:1px solid #e5e5e5;">${safe.company}</td></tr>` : ""}
        <tr><td style="padding:8px 12px;border:1px solid #e5e5e5;color:#525252;">Subject</td><td style="padding:8px 12px;border:1px solid #e5e5e5;">${escapeHtml(route.label)}</td></tr>
      </table>
      <div style="padding: 12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; font-size:14px; color:#1a1a1a; white-space:normal;">${safe.message}</div>
      <p style="margin-top:16px; font-size:12px; color:#a3a3a3;">Submitted ${escapeHtml(submittedAt)} · Reply directly to respond to ${safe.email}.</p>
    </div>`;

  const text = `New ${route.label} message
Name: ${name}
Email: ${email}${company ? `\nCompany: ${company}` : ""}
Subject: ${route.label}
Submitted: ${submittedAt}

${message}`;

  const result = await sendEmail({
    to: route.to,
    // Strip CR/LF from the user-supplied name as defense-in-depth against header injection.
    subject: `[RegLayer] ${route.label} — ${name.replace(/[\r\n]+/g, " ")}`,
    html,
    text,
    replyTo: email,
  });

  if (!result.success) {
    console.error("[contact] delivery failed:", result.error);
    return NextResponse.json({ ok: false, code: "send_failed" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
