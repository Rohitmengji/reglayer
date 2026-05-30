/**
 * RegLayer — Branded Email System for White-Label Agencies
 *
 * WHY: Agency clients receive emails branded with agency identity.
 * WHAT: Extends base email service with agency branding context.
 * HOW: Wraps Nodemailer payloads with agency logo, colors, and name.
 */

import { sendEmail } from "@/lib/email/service";
import type { AgencyContext } from "@/lib/tenant/resolver";

interface BrandedEmailOptions {
  to: string;
  subject: string;
  heading: string;
  body: string;
  ctaText?: string;
  ctaUrl?: string;
  agency?: AgencyContext | null;
}

/**
 * Sends a branded email — uses agency branding if in agency context.
 * @param options - Email options including optional agency context
 */
export async function sendBrandedEmail(options: BrandedEmailOptions) {
  const { to, subject, heading, body, ctaText, ctaUrl, agency } = options;

  const brandName = agency?.brandName ?? "RegLayer";
  const primaryColor = agency?.primaryColor ?? "#6366f1";
  const logoUrl = agency?.logoUrl ?? null;
  const supportEmail = agency?.supportEmail ?? null;
  const showPoweredBy = !agency || agency.plan === "STARTER";

  const fromName = supportEmail
    ? `${brandName} <${supportEmail}>`
    : `${brandName} <noreply@reglayer.app>`;

  const subjectLine = `[${brandName}] ${subject}`;

  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="${brandName}" style="max-height:40px;margin-bottom:16px;" />`
    : `<h2 style="color:${primaryColor};margin:0 0 16px 0;">${brandName}</h2>`;

  const ctaHtml = ctaText && ctaUrl
    ? `<a href="${ctaUrl}" style="display:inline-block;background:${primaryColor};color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;margin:16px 0;">${ctaText}</a>`
    : "";

  const footerText = showPoweredBy
    ? `${brandName} &mdash; Powered by RegLayer`
    : brandName;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:0;background:#f4f4f5;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <div style="background:#fff;border-radius:8px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
      ${logoHtml}
      <h1 style="font-size:20px;margin:0 0 16px 0;color:#18181b;">${heading}</h1>
      <div style="font-size:15px;line-height:1.6;color:#3f3f46;">
        ${body}
      </div>
      ${ctaHtml}
    </div>
    <div style="text-align:center;padding:24px 0;font-size:12px;color:#71717a;">
      ${footerText}
    </div>
  </div>
</body>
</html>`;

  const text = `${heading}\n\n${body.replace(/<[^>]+>/g, "")}\n\n${ctaText ? `${ctaText}: ${ctaUrl}` : ""}`;

  return sendEmail({
    to,
    subject: subjectLine,
    html,
    text,
    from: fromName,
  });
}

/**
 * Sends a welcome email to a new agency client.
 */
export async function sendClientWelcomeEmail(
  contactEmail: string,
  clientName: string,
  agency: AgencyContext
) {
  return sendBrandedEmail({
    to: contactEmail,
    subject: "Welcome to your accessibility dashboard",
    heading: `Welcome, ${clientName}!`,
    body: `<p>Your accessibility compliance dashboard has been set up by <strong>${agency.brandName}</strong>.</p>
<p>You can now monitor your website's accessibility, track violations, and generate compliance reports.</p>`,
    ctaText: "Go to Dashboard",
    ctaUrl: `https://${agency.slug}.reglayer.app/dashboard`,
    agency,
  });
}

/**
 * Sends a scan complete notification in agency context.
 */
export async function sendScanCompleteEmail(
  to: string,
  scanData: { url: string; score: number; violations: number },
  agency?: AgencyContext | null
) {
  return sendBrandedEmail({
    to,
    subject: `Scan Complete: ${scanData.url}`,
    heading: "Accessibility Scan Complete",
    body: `<p>Your scan of <strong>${scanData.url}</strong> is complete.</p>
<ul>
  <li>Score: <strong>${scanData.score}/1000</strong></li>
  <li>Violations found: <strong>${scanData.violations}</strong></li>
</ul>`,
    ctaText: "View Full Report",
    ctaUrl: agency
      ? `https://${agency.slug}.reglayer.app/dashboard`
      : "https://reglayer.app/dashboard",
    agency,
  });
}
