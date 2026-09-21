/**
 * RegLayer — Email Service
 *
 * WHY: Users need email notifications (scan complete, score drop, team invites).
 * WHAT: Nodemailer-based email sending with HTML templates.
 * HOW: Creates SMTP transporter from env vars. Sends templated HTML emails. Falls back gracefully if not configured.
 */

import nodemailer from "nodemailer";
import {
  EMAIL_FONT,
  EMAIL_ACCENT,
  escapeHtml,
  emailAppUrl,
  emailParagraph,
  emailButton,
  renderEmailLayout,
  emailStatTable,
  emailCallout,
  emailManagePrefs,
} from "./layout";

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

let devTransporter: nodemailer.Transporter | null = null;
let devTransporterPromise: Promise<nodemailer.Transporter | null> | null = null;

/**
 * Development-only fallback: a free, auto-provisioned Ethereal test inbox
 * (nodemailer.createTestAccount). No signup and no cost — messages are captured
 * and viewable at a logged preview URL instead of being delivered to a real
 * inbox. Gated to NODE_ENV=development so tests and production never touch it.
 */
async function getDevTransporter(): Promise<nodemailer.Transporter | null> {
  if (process.env.NODE_ENV !== "development") return null;
  if (devTransporter) return devTransporter;
  devTransporterPromise ??= (async () => {
    try {
      const account = await nodemailer.createTestAccount();
      devTransporter = nodemailer.createTransport({
        host: account.smtp.host,
        port: account.smtp.port,
        secure: account.smtp.secure,
        auth: { user: account.user, pass: account.pass },
      });
      console.log(`[email] No SMTP configured — using a free Ethereal test inbox (${account.user}). Emails are captured, not delivered; each message logs a preview link.`);
      return devTransporter;
    } catch (err) {
      console.warn("[email] Could not create an Ethereal test inbox:", err instanceof Error ? err.message : err);
      return null;
    }
  })();
  return devTransporterPromise;
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
  const transport = getTransporter() ?? (await getDevTransporter());
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

    // Ethereal returns a preview URL; real SMTP returns false. Surface it in dev.
    const previewUrl = nodemailer.getTestMessageUrl(info) || undefined;
    if (previewUrl) console.log(`[email] Preview: ${previewUrl}`);

    return { success: true, id: info.messageId, previewUrl };
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
    html: renderEmailLayout({
      preheader: `${scanData.url} scored ${scanData.score}% — ${scanData.violations} violations`,
      title: "Scan complete",
      contentHtml: `
          ${emailParagraph("Your accessibility scan has finished.")}
          ${emailStatTable([
            { label: "URL", value: scanData.url },
            { label: "Score", value: `${scanData.score}%`, valueColor: scoreColor },
            { label: "Violations", value: `${scanData.violations} total (${scanData.critical} critical)` },
          ])}
          ${emailButton(scanData.reportUrl, "View full report")}
          ${emailManagePrefs()}`,
    }),
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
    html: renderEmailLayout({
      preheader: `${data.newCount} new violations on ${data.url}`,
      title: "New accessibility violations",
      contentHtml: `
          ${emailParagraph(`New issues were found during a scan of <strong>${data.url}</strong>.`)}
          ${emailCallout(`<strong>${data.newCount}</strong> new violations detected${data.criticalCount > 0 ? ` (${data.criticalCount} critical)` : ""}`, "danger")}
          ${emailButton(data.reportUrl, "Review violations")}
          ${emailManagePrefs()}`,
    }),
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
    html: renderEmailLayout({
      preheader: `Avg score ${data.avgScore}% · ${data.totalScans} scans this week`,
      title: "Your weekly accessibility digest",
      contentHtml: `
          ${emailStatTable([
            { label: "Scans this week", value: String(data.totalScans) },
            { label: "Average score", value: `${data.avgScore}%` },
            { label: "Issues resolved", value: String(data.resolvedCount), valueColor: "#16a34a" },
            { label: "New violations", value: String(data.newViolations), valueColor: "#dc2626" },
            { label: "Top issue", value: data.topIssue },
          ])}
          ${emailButton(`${emailAppUrl()}/dashboard`, "View dashboard")}
          ${emailManagePrefs()}`,
    }),
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
    html: renderEmailLayout({
      preheader: `${data.url} dropped to ${data.currentScore}%`,
      title: "Compliance score dropped",
      contentHtml: `
          ${emailParagraph(`The compliance score for <strong>${data.url}</strong> has decreased.`)}
          ${emailCallout(`<div style="text-align:center;font-size:24px;font-weight:700;">${data.previousScore}% → ${data.currentScore}%</div>`, "danger")}
          ${emailButton(data.reportUrl, "Investigate changes")}`,
    }),
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
    html: renderEmailLayout({
      preheader: `${new URL(data.url).hostname} dropped to ${data.currentScore}% (${data.scoreDelta} pts)`,
      title: "Accessibility regression detected",
      contentHtml: `
          ${emailParagraph(`Triggered by <strong>${data.scheduleName}</strong>. A scheduled scan of <strong>${data.url}</strong> detected a regression.`)}
          ${emailCallout(`<div style="text-align:center;"><div style="font-size:28px;font-weight:700;">${data.previousScore}% → ${data.currentScore}%</div><div style="font-size:13px;margin-top:4px;">${data.scoreDelta} points</div></div>`, "danger")}
          ${data.newViolations.length > 0 ? `
          <p style="margin:18px 0 8px;font-family:${EMAIL_FONT};font-size:14px;font-weight:600;color:#0f172a;">New violations (${data.newViolations.length})</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;border-collapse:separate;">
            ${newViolationRows}
            ${data.newViolations.length > 5 ? `<tr><td style="padding:8px 14px;font-family:${EMAIL_FONT};font-size:12px;color:#737373;">…and ${data.newViolations.length - 5} more</td></tr>` : ""}
          </table>` : ""}
          ${data.fixedViolations.length > 0 ? `
          <p style="margin:18px 0 8px;font-family:${EMAIL_FONT};font-size:14px;font-weight:600;color:#0f172a;">Fixed (${data.fixedViolations.length})</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;border-collapse:separate;">
            ${fixedViolationRows}
          </table>` : ""}
          ${emailButton(data.reportUrl, "View scan details")}
          ${emailParagraph(`This alert was triggered by your scheduled monitoring rule. <a href="${emailAppUrl()}/settings" style="color:#64748b;">Manage schedules</a>`, { muted: true })}`,
    }),
    text: `Regression detected on ${data.url}\nScore: ${data.previousScore}% → ${data.currentScore}% (${data.scoreDelta})\nNew violations: ${data.newViolations.length}\nFixed: ${data.fixedViolations.length}\nView details: ${data.reportUrl}`,
  });
}

/**
 * Team-invitation email.
 *
 * WHY: invited members were silently added with no notification — and brand-new
 * users are created without a password, so they had no way to discover or access
 * the account. This closes that loop. For a new user we point them at the
 * password-reset flow to set an initial password (their only way in); existing
 * users just get a sign-in link.
 */
export interface TeamInviteData {
  workspaceName: string;
  inviterName: string;
  role: string;
  isNewUser: boolean;
  /** One-time password for a brand-new account, replaced at first sign-in. */
  temporaryPassword?: string;
}

/** Pure builder for the invite email payload — unit-tested independently of SMTP. */
export function buildTeamInviteEmail(to: string, data: TeamInviteData): EmailPayload {
  const appUrl = emailAppUrl();
  const loginUrl = `${appUrl}/auth/login`;
  const setupUrl = `${appUrl}/auth/forgot-password`;
  const workspace = escapeHtml(data.workspaceName);
  const inviter = escapeHtml(data.inviterName);
  const roleLabel = escapeHtml(data.role.charAt(0) + data.role.slice(1).toLowerCase());

  const lead = emailParagraph(`<strong>${inviter}</strong> added you to the <strong>${workspace}</strong> workspace on RegLayer as <strong>${roleLabel}</strong>.`);

  const credentials = `
          ${emailParagraph("An account was created for you. Sign in with this temporary password, then choose your own password — RegLayer asks for it straight away.")}
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:separate;border-spacing:0;width:100%;">
            <tr>
              <td style="padding:10px 14px;border:1px solid #e2e8f0;border-radius:8px 8px 0 0;font-family:${EMAIL_FONT};font-size:13px;color:#64748b;">Email</td>
              <td style="padding:10px 14px;border:1px solid #e2e8f0;border-left:0;border-radius:0 8px 0 0;font-family:${EMAIL_FONT};font-size:13px;font-weight:600;color:#0f172a;">${escapeHtml(to)}</td>
            </tr>
            <tr>
              <td style="padding:10px 14px;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 0 8px;font-family:${EMAIL_FONT};font-size:13px;color:#64748b;">Temporary password</td>
              <td style="padding:10px 14px;border:1px solid #e2e8f0;border-top:0;border-left:0;border-radius:0 0 8px 0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:16px;font-weight:700;letter-spacing:1px;color:#0f172a;">${escapeHtml(data.temporaryPassword ?? "")}</td>
            </tr>
          </table>
          ${emailButton(loginUrl, "Sign in to RegLayer")}
          ${emailParagraph(`The temporary password expires in 7 days and stops working once you choose your own. If it expires, request a new code at <a href="${setupUrl}" style="color:${EMAIL_ACCENT};">${setupUrl}</a>.`, { muted: true })}`;

  const cta = data.isNewUser && data.temporaryPassword
    ? credentials
    : data.isNewUser
    ? `
          ${emailParagraph("An account was created for you. To get started, set your password:")}
          ${emailButton(setupUrl, "Set your password")}
          ${emailParagraph(`On that page, enter <strong>${escapeHtml(to)}</strong> to receive a one-time code, choose a password, then sign in at <a href="${loginUrl}" style="color:${EMAIL_ACCENT};">${loginUrl}</a>.`, { muted: true })}`
    : `
          ${emailParagraph("You can jump straight in.")}
          ${emailButton(loginUrl, "Open RegLayer")}`;

  const contentHtml = `${lead}${cta}
          ${emailParagraph("If you weren't expecting this, you can safely ignore this email.", { muted: true })}`;

  return {
    to,
    subject: `You've been added to ${data.workspaceName} on RegLayer`,
    html: renderEmailLayout({
      preheader: `${data.inviterName} added you to ${data.workspaceName} on RegLayer`,
      title: `You've been added to ${workspace}`,
      contentHtml,
    }),
    text: data.isNewUser && data.temporaryPassword
      ? `${data.inviterName} added you to ${data.workspaceName} on RegLayer as ${roleLabel}. Sign in at ${loginUrl} with ${to} and the temporary password ${data.temporaryPassword}, then choose your own password when RegLayer asks for it. The temporary password expires in 7 days.`
      : data.isNewUser
      ? `${data.inviterName} added you to ${data.workspaceName} on RegLayer as ${roleLabel}. An account was created for you — set your password at ${setupUrl} (enter ${to} to get a one-time code), then sign in at ${loginUrl}.`
      : `${data.inviterName} added you to ${data.workspaceName} on RegLayer as ${roleLabel}. Sign in at ${loginUrl}.`,
  };
}

/** Send a team-invitation email (best-effort; no-op return if SMTP unconfigured). */
export async function sendTeamInviteEmail(to: string, data: TeamInviteData) {
  return sendEmail(buildTeamInviteEmail(to, data));
}

export interface PasswordSetData {
  name?: string | null;
  workspaceName?: string | null;
}

/**
 * Welcome note sent once an invited member replaces their temporary password.
 *
 * Deliberately contains NO password. Mail is stored, searchable and forwardable,
 * so a live credential must never travel through it — the same reason the
 * temporary password is single-use and short-lived.
 */
export function buildPasswordSetEmail(to: string, data: PasswordSetData = {}): EmailPayload {
  const appUrl = emailAppUrl();
  const greeting = data.name?.trim() ? `Welcome, ${escapeHtml(data.name.trim())}!` : "Welcome to RegLayer!";
  const place = data.workspaceName?.trim()
    ? ` You're all set in <strong>${escapeHtml(data.workspaceName.trim())}</strong>.`
    : " You're all set.";

  const contentHtml = `
          ${emailParagraph(`Your password is set and your temporary one no longer works.${place}`)}
          ${emailParagraph("From here you can run accessibility scans, work through violations with guidance, and share compliance reports with your team.")}
          ${emailButton(`${appUrl}/dashboard`, "Open your dashboard")}
          ${emailParagraph(`For your security we never include passwords in email. If you didn't set this password, reset it now at <a href="${appUrl}/auth/forgot-password" style="color:${EMAIL_ACCENT};">${appUrl}/auth/forgot-password</a> and tell your workspace administrator.`, { muted: true })}`;

  return {
    to,
    subject: "Welcome to RegLayer — your account is ready",
    html: renderEmailLayout({
      preheader: "Your RegLayer account is ready — open your dashboard.",
      title: greeting,
      contentHtml,
      footnote: `Account: ${escapeHtml(to)} · ${new Date().toUTCString()}`,
    }),
    text: `${data.name?.trim() ? `Welcome, ${data.name.trim()}!` : "Welcome to RegLayer!"} Your password is set and your temporary one no longer works.${data.workspaceName?.trim() ? ` You're all set in ${data.workspaceName.trim()}.` : ""} Open your dashboard at ${appUrl}/dashboard. For your security we never include passwords in email — if you didn't set this password, reset it at ${appUrl}/auth/forgot-password and tell your workspace administrator. Account: ${to} (${new Date().toUTCString()}).`,
  };
}

/** Send the welcome note after first-time password setup (best-effort). */
export async function sendPasswordSetEmail(to: string, data: PasswordSetData = {}) {
  return sendEmail(buildPasswordSetEmail(to, data));
}

/** Password-reset one-time code email. */
export function buildPasswordResetEmail(to: string, otp: string): EmailPayload {
  return {
    to,
    subject: "RegLayer — Password Reset Code",
    html: renderEmailLayout({
      preheader: "Your RegLayer password reset code — expires in 10 minutes.",
      title: "Reset your password",
      contentHtml: `
          ${emailParagraph("Enter this code to reset your RegLayer password. It expires in 10 minutes.")}
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0;"><tr><td align="center" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:20px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:#0f172a;">${escapeHtml(otp)}</td></tr></table>
          ${emailParagraph("If you didn't request this, you can safely ignore this email.", { muted: true })}`,
    }),
    text: `Your RegLayer password reset code is: ${otp}. It expires in 10 minutes.`,
  };
}

/** Security confirmation sent after a password is changed or reset. */
export function buildPasswordChangedEmail(to: string): EmailPayload {
  const app = emailAppUrl();
  return {
    to,
    subject: "RegLayer — Your password was changed",
    html: renderEmailLayout({
      preheader: "Your RegLayer password was just changed.",
      title: "Password changed successfully",
      contentHtml: `
          ${emailParagraph("Your RegLayer account password was just updated. If you made this change, no further action is needed.")}
          ${emailCallout(`If you did <strong>not</strong> make this change, your account may be compromised. Reset your password immediately at <a href="${app}/auth/forgot-password" style="color:#991b1b;">${app}/auth/forgot-password</a>, or contact support@reglayer.eu.`, "danger")}
          ${emailParagraph(`Account: ${escapeHtml(to)} · ${new Date().toUTCString()}`, { muted: true })}`,
    }),
    text: `Your RegLayer password was changed on ${new Date().toUTCString()}. If you did not make this change, contact support@reglayer.eu immediately.`,
  };
}

/** Send the password-changed security confirmation (best-effort). */
export async function sendPasswordChangedEmail(to: string) {
  return sendEmail(buildPasswordChangedEmail(to));
}

/**
 * Compliance Autopilot — monthly/weekly scheduled report email.
 */
export async function sendComplianceReportEmail(data: {
  to: string;
  siteName: string;
  siteUrl: string;
  period: string;
  currentScore: number;
  averageScore: number;
  totalScans: number;
  totalViolations: number;
  proofsIssued: number;
  scoreImproved: boolean;
  reportUrl: string;
}) {
  const trendIcon = data.scoreImproved ? "↑" : "↓";
  const trendColor = data.scoreImproved ? "#059669" : "#dc2626";

  return sendEmail({
    to: data.to,
    subject: `Compliance Report: ${data.siteName} — ${data.period}`,
    html: renderEmailLayout({
      preheader: `${data.siteName} — ${data.currentScore}% current score for ${data.period}`,
      title: "Compliance report",
      contentHtml: `
          ${emailParagraph(`<strong>${escapeHtml(data.siteName)}</strong> · ${escapeHtml(data.period)}`)}
          ${emailCallout(`<div style="text-align:center;"><div style="font-size:44px;font-weight:800;color:${trendColor};line-height:1;">${data.currentScore}%</div><div style="font-size:13px;color:#64748b;margin-top:6px;">${trendIcon} Current accessibility score</div></div>`, data.scoreImproved ? "success" : "danger")}
          ${emailStatTable([
            { label: "Average score", value: `${data.averageScore}%` },
            { label: "Scans completed", value: String(data.totalScans) },
            { label: "Open violations", value: String(data.totalViolations) },
            { label: "Evidence proofs issued", value: String(data.proofsIssued) },
          ])}
          ${emailButton(data.reportUrl, "View full report")}
          ${emailParagraph(`Sent by RegLayer Compliance Autopilot. <a href="${emailAppUrl()}/settings" style="color:#64748b;">Manage report settings</a>`, { muted: true })}`,
    }),
    text: `Compliance Report: ${data.siteName} (${data.period})\n\nCurrent Score: ${data.currentScore}%\nAverage Score: ${data.averageScore}%\nScans: ${data.totalScans}\nViolations: ${data.totalViolations}\nProofs Issued: ${data.proofsIssued}\n\nView full report: ${data.reportUrl}`,
  });
}
