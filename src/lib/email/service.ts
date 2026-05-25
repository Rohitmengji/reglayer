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
      from: FROM_EMAIL,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
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
