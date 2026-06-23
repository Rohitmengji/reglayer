/**
 * RegLayer — Email Service
 *
 * WHY: Users need email notifications (scan complete, score drop, team invites).
 * WHAT: Nodemailer-based email sending with HTML templates.
 * HOW: Creates SMTP transporter from env vars. Sends templated HTML emails. Falls back gracefully if not configured.
 */

import nodemailer from "nodemailer";

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) return null;

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return transporter;
}

const FROM_EMAIL = process.env.EMAIL_FROM || process.env.SMTP_USER || "notifications@reglayer.eu";

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  /** Address replies should go to (e.g. the customer who filled in a contact form). */
  replyTo?: string;
}

/**
 * Send an email via SMTP (Nodemailer)
 */
export async function sendEmail(payload: EmailPayload) {
  const transport = getTransporter();
  if (!transport) {
    return {
      success: false,
      error: "Email not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS in environment.",
    };
  }

  try {
    const info = await transport.sendMail({
      from: payload.from || FROM_EMAIL,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      replyTo: payload.replyTo,
    });

    return { success: true, id: info.messageId };
  } catch (err) {
    console.error("[email] Send failed:", err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Check if email is configured
 */
export function isEmailConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

/**
 * Send scan complete notification
 */
export async function sendScanCompleteEmail(to: string, scanData: {
  url: string;
  score: number;
  violations: number;
  critical: number;
  reportUrl: string;
}) {
  const scoreColor = scanData.score >= 90 ? "#16a34a" : scanData.score >= 70 ? "#ca8a04" : "#dc2626";

  return sendEmail({
    to,
    subject: `Scan Complete: ${scanData.url} — Score ${scanData.score}%`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="border-bottom: 1px solid #e5e5e5; padding: 20px 0;">
          <h2 style="margin: 0; font-size: 18px; color: #171717;">🛡️ RegLayer Scan Complete</h2>
        </div>
        <div style="padding: 24px 0;">
          <p style="color: #525252; margin: 0 0 16px;">Your accessibility scan has finished.</p>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr>
              <td style="padding: 12px; border: 1px solid #e5e5e5; font-size: 14px; color: #525252;">URL</td>
              <td style="padding: 12px; border: 1px solid #e5e5e5; font-size: 14px; font-weight: 600;">${scanData.url}</td>
            </tr>
            <tr>
              <td style="padding: 12px; border: 1px solid #e5e5e5; font-size: 14px; color: #525252;">Score</td>
              <td style="padding: 12px; border: 1px solid #e5e5e5; font-size: 14px; font-weight: 700; color: ${scoreColor};">${scanData.score}%</td>
            </tr>
            <tr>
              <td style="padding: 12px; border: 1px solid #e5e5e5; font-size: 14px; color: #525252;">Violations</td>
              <td style="padding: 12px; border: 1px solid #e5e5e5; font-size: 14px;">${scanData.violations} total (${scanData.critical} critical)</td>
            </tr>
          </table>
          <a href="${scanData.reportUrl}" style="display: inline-block; background: #171717; color: #fff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 500;">View Full Report</a>
        </div>
        <div style="border-top: 1px solid #e5e5e5; padding: 16px 0; font-size: 12px; color: #a3a3a3;">
          <p style="margin: 0;">You're receiving this because you have scan notifications enabled. <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://reglayer.vercel.app"}/notifications" style="color: #525252;">Manage preferences</a></p>
        </div>
      </div>
    `,
    text: `Scan Complete: ${scanData.url}\nScore: ${scanData.score}%\nViolations: ${scanData.violations} (${scanData.critical} critical)\nView report: ${scanData.reportUrl}`,
  });
}

/**
 * Send new violations alert
 */
export async function sendNewViolationsEmail(to: string, data: {
  url: string;
  newCount: number;
  criticalCount: number;
  reportUrl: string;
}) {
  return sendEmail({
    to,
    subject: `⚠️ ${data.newCount} new violations detected on ${data.url}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="border-bottom: 1px solid #e5e5e5; padding: 20px 0;">
          <h2 style="margin: 0; font-size: 18px; color: #171717;">⚠️ New Accessibility Violations</h2>
        </div>
        <div style="padding: 24px 0;">
          <p style="color: #525252; margin: 0 0 16px;">New issues were found during a scan of <strong>${data.url}</strong>.</p>
          <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
            <p style="margin: 0; font-size: 14px; color: #991b1b;"><strong>${data.newCount}</strong> new violations detected${data.criticalCount > 0 ? ` (${data.criticalCount} critical)` : ""}</p>
          </div>
          <a href="${data.reportUrl}" style="display: inline-block; background: #171717; color: #fff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 500;">Review Violations</a>
        </div>
        <div style="border-top: 1px solid #e5e5e5; padding: 16px 0; font-size: 12px; color: #a3a3a3;">
          <p style="margin: 0;"><a href="${process.env.NEXT_PUBLIC_APP_URL || "https://reglayer.vercel.app"}/notifications" style="color: #525252;">Manage notification preferences</a></p>
        </div>
      </div>
    `,
  });
}

/**
 * Send weekly digest
 */
export async function sendWeeklyDigestEmail(to: string, data: {
  totalScans: number;
  avgScore: number;
  resolvedCount: number;
  newViolations: number;
  topIssue: string;
}) {
  return sendEmail({
    to,
    subject: `📊 Weekly Accessibility Digest — Avg Score: ${data.avgScore}%`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="border-bottom: 1px solid #e5e5e5; padding: 20px 0;">
          <h2 style="margin: 0; font-size: 18px; color: #171717;">📊 Your Weekly Accessibility Digest</h2>
        </div>
        <div style="padding: 24px 0;">
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr>
              <td style="padding: 12px; border: 1px solid #e5e5e5; font-size: 14px; color: #525252;">Scans this week</td>
              <td style="padding: 12px; border: 1px solid #e5e5e5; font-size: 14px; font-weight: 600;">${data.totalScans}</td>
            </tr>
            <tr>
              <td style="padding: 12px; border: 1px solid #e5e5e5; font-size: 14px; color: #525252;">Average score</td>
              <td style="padding: 12px; border: 1px solid #e5e5e5; font-size: 14px; font-weight: 600;">${data.avgScore}%</td>
            </tr>
            <tr>
              <td style="padding: 12px; border: 1px solid #e5e5e5; font-size: 14px; color: #525252;">Issues resolved</td>
              <td style="padding: 12px; border: 1px solid #e5e5e5; font-size: 14px; font-weight: 600; color: #16a34a;">${data.resolvedCount}</td>
            </tr>
            <tr>
              <td style="padding: 12px; border: 1px solid #e5e5e5; font-size: 14px; color: #525252;">New violations</td>
              <td style="padding: 12px; border: 1px solid #e5e5e5; font-size: 14px; font-weight: 600; color: #dc2626;">${data.newViolations}</td>
            </tr>
            <tr>
              <td style="padding: 12px; border: 1px solid #e5e5e5; font-size: 14px; color: #525252;">Top issue</td>
              <td style="padding: 12px; border: 1px solid #e5e5e5; font-size: 14px;">${data.topIssue}</td>
            </tr>
          </table>
          <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://reglayer.vercel.app"}/dashboard" style="display: inline-block; background: #171717; color: #fff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 500;">View Dashboard</a>
        </div>
        <div style="border-top: 1px solid #e5e5e5; padding: 16px 0; font-size: 12px; color: #a3a3a3;">
          <p style="margin: 0;"><a href="${process.env.NEXT_PUBLIC_APP_URL || "https://reglayer.vercel.app"}/notifications" style="color: #525252;">Manage notification preferences</a></p>
        </div>
      </div>
    `,
  });
}

/**
 * Send compliance alert (score dropped)
 */
export async function sendComplianceAlertEmail(to: string, data: {
  url: string;
  previousScore: number;
  currentScore: number;
  reportUrl: string;
}) {
  return sendEmail({
    to,
    subject: `🚨 Compliance dropped: ${data.url} (${data.previousScore}% → ${data.currentScore}%)`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="border-bottom: 1px solid #e5e5e5; padding: 20px 0;">
          <h2 style="margin: 0; font-size: 18px; color: #171717;">🚨 Compliance Score Dropped</h2>
        </div>
        <div style="padding: 24px 0;">
          <p style="color: #525252; margin: 0 0 16px;">The compliance score for <strong>${data.url}</strong> has decreased.</p>
          <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin-bottom: 20px; text-align: center;">
            <span style="font-size: 24px; font-weight: 700; color: #991b1b;">${data.previousScore}% → ${data.currentScore}%</span>
          </div>
          <a href="${data.reportUrl}" style="display: inline-block; background: #171717; color: #fff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 500;">Investigate Changes</a>
        </div>
      </div>
    `,
  });
}

/**
 * Send regression alert from scheduled monitoring.
 * Rich email with score delta, new violations, and fixed violations.
 */
export async function sendRegressionAlert(to: string, data: {
  url: string;
  previousScore: number;
  currentScore: number;
  scoreDelta: number;
  newViolations: Array<{ ruleId: string; impact: string; help: string }>;
  fixedViolations: Array<{ ruleId: string; impact: string; help: string }>;
  reportUrl: string;
  scheduleName: string;
}) {
  const impactBadge = (impact: string) => {
    const colors: Record<string, string> = { critical: "#991b1b", serious: "#c2410c", moderate: "#a16207", minor: "#525252" };
    return `<span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:600;color:#fff;background:${colors[impact] || "#525252"};">${impact}</span>`;
  };

  const newViolationRows = data.newViolations.slice(0, 5).map((v) =>
    `<tr><td style="padding:8px 12px;border-bottom:1px solid #f5f5f5;font-size:13px;">${impactBadge(v.impact)} ${v.help}</td></tr>`
  ).join("");

  const fixedViolationRows = data.fixedViolations.slice(0, 5).map((v) =>
    `<tr><td style="padding:8px 12px;border-bottom:1px solid #f5f5f5;font-size:13px;">✅ ${v.help}</td></tr>`
  ).join("");

  return sendEmail({
    to,
    subject: `🚨 Regression detected: ${new URL(data.url).hostname} (${data.previousScore}% → ${data.currentScore}%)`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="border-bottom: 1px solid #e5e5e5; padding: 20px 0;">
          <h2 style="margin: 0; font-size: 18px; color: #171717;">🚨 Accessibility Regression Detected</h2>
          <p style="margin: 4px 0 0; font-size: 13px; color: #737373;">Triggered by: ${data.scheduleName}</p>
        </div>
        <div style="padding: 24px 0;">
          <p style="color: #525252; margin: 0 0 16px;">A scheduled scan of <strong>${data.url}</strong> detected a regression.</p>

          <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 20px; margin-bottom: 20px; text-align: center;">
            <div style="font-size: 28px; font-weight: 700; color: #991b1b;">${data.previousScore}% → ${data.currentScore}%</div>
            <div style="font-size: 13px; color: #991b1b; margin-top: 4px;">${data.scoreDelta} points</div>
          </div>

          ${data.newViolations.length > 0 ? `
          <h3 style="font-size: 14px; color: #171717; margin: 0 0 8px;">⚠️ New Violations (${data.newViolations.length})</h3>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; background: #fef2f2; border-radius: 6px;">
            ${newViolationRows}
            ${data.newViolations.length > 5 ? `<tr><td style="padding:8px 12px;font-size:12px;color:#737373;">...and ${data.newViolations.length - 5} more</td></tr>` : ""}
          </table>` : ""}

          ${data.fixedViolations.length > 0 ? `
          <h3 style="font-size: 14px; color: #171717; margin: 0 0 8px;">✅ Fixed (${data.fixedViolations.length})</h3>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; background: #f0fdf4; border-radius: 6px;">
            ${fixedViolationRows}
          </table>` : ""}

          <a href="${data.reportUrl}" style="display: inline-block; background: #171717; color: #fff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 500;">View Scan Details</a>
        </div>
        <div style="border-top: 1px solid #e5e5e5; padding: 16px 0; font-size: 12px; color: #a3a3a3;">
          <p style="margin: 0;">This alert was triggered by your scheduled monitoring rule. <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://reglayer.vercel.app"}/settings" style="color: #525252;">Manage schedules</a></p>
        </div>
      </div>
    `,
    text: `Regression detected on ${data.url}\nScore: ${data.previousScore}% → ${data.currentScore}% (${data.scoreDelta})\nNew violations: ${data.newViolations.length}\nFixed: ${data.fixedViolations.length}\nView details: ${data.reportUrl}`,
  });
}
