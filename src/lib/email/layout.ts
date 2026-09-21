/**
 * RegLayer — Shared Email Layout
 *
 * The modern, responsive shell and building blocks used by every first-party
 * RegLayer transactional email. Kept separate from the send/service logic so any
 * email module can compose a consistent, on-brand message.
 */

const EMAIL_FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const EMAIL_ACCENT = "#4f46e5";

export { EMAIL_FONT, EMAIL_ACCENT };

/** Escape user-controlled text before interpolating into email HTML. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function emailAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://reglayer.vercel.app").replace(/\/+$/, "");
}

/** A body paragraph in the shared layout's default type scale. */
export function emailParagraph(html: string, opts: { muted?: boolean } = {}): string {
  return opts.muted
    ? `<p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#64748b;">${html}</p>`
    : `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#334155;">${html}</p>`;
}

/** Bulletproof CTA button that renders across Outlook, Gmail and Apple Mail. */
export function emailButton(href: string, label: string): string {
  return `
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0 6px;">
        <tr>
          <td align="center" bgcolor="${EMAIL_ACCENT}" style="border-radius:10px;">
            <a href="${href}" style="display:inline-block;padding:13px 28px;font-family:${EMAIL_FONT};font-size:15px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:10px;">${label}</a>
          </td>
        </tr>
      </table>`;
}

/** Modern, responsive shell shared by RegLayer transactional emails. */
export function renderEmailLayout(opts: { preheader: string; title: string; contentHtml: string; footnote?: string }): string {
  const app = emailAppUrl();
  const host = app.replace(/^https?:\/\//, "");
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<meta name="color-scheme" content="light dark" />
<meta name="supported-color-schemes" content="light dark" />
<title>${opts.title}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;-webkit-font-smoothing:antialiased;">
<span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;mso-hide:all;">${escapeHtml(opts.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;">
        <tr>
          <td style="padding:4px 4px 20px;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td width="40" height="40" align="center" valign="middle" bgcolor="${EMAIL_ACCENT}" style="border-radius:10px;font-family:${EMAIL_FONT};font-size:20px;font-weight:700;color:#ffffff;">R</td>
                <td style="padding-left:12px;font-family:${EMAIL_FONT};font-size:18px;font-weight:700;color:#0f172a;letter-spacing:-0.02em;">RegLayer</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:36px;box-shadow:0 1px 2px rgba(15,23,42,0.04);">
            <h1 style="margin:0 0 16px;font-family:${EMAIL_FONT};font-size:22px;line-height:1.3;font-weight:700;color:#0f172a;letter-spacing:-0.02em;">${opts.title}</h1>
            <div style="font-family:${EMAIL_FONT};">${opts.contentHtml}</div>
          </td>
        </tr>
        ${opts.footnote ? `<tr><td style="padding:18px 8px 0;font-family:${EMAIL_FONT};font-size:12px;line-height:1.6;color:#94a3b8;">${opts.footnote}</td></tr>` : ""}
        <tr>
          <td style="padding:22px 8px 8px;font-family:${EMAIL_FONT};font-size:12px;line-height:1.6;color:#94a3b8;">
            <p style="margin:0 0 4px;">You're receiving this because you have a RegLayer account.</p>
            <p style="margin:0;"><a href="${app}" style="color:#64748b;text-decoration:underline;">${host}</a> · RegLayer — web accessibility &amp; compliance · © ${year}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/** A clean key/value stat table for the shared layout. */
export function emailStatTable(rows: Array<{ label: string; value: string; valueColor?: string }>): string {
  const cells = rows.map((row, i) => {
    const first = i === 0;
    const last = i === rows.length - 1;
    const labelRadius = first ? "border-radius:8px 0 0 0;" : last ? "border-radius:0 0 0 8px;" : "";
    const valueRadius = first ? "border-radius:0 8px 0 0;" : last ? "border-radius:0 0 8px 0;" : "";
    return `<tr>
              <td style="padding:11px 14px;border:1px solid #e2e8f0;${first ? "" : "border-top:0;"}${labelRadius}font-family:${EMAIL_FONT};font-size:13px;color:#64748b;">${row.label}</td>
              <td style="padding:11px 14px;border:1px solid #e2e8f0;border-left:0;${first ? "" : "border-top:0;"}${valueRadius}font-family:${EMAIL_FONT};font-size:14px;font-weight:600;color:${row.valueColor || "#0f172a"};">${row.value}</td>
            </tr>`;
  }).join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:8px 0 4px;border-collapse:separate;border-spacing:0;">${cells}</table>`;
}

/** A tinted callout box for headline numbers or alerts. */
export function emailCallout(html: string, tone: "danger" | "success" | "warning" | "neutral" = "neutral"): string {
  const palette = {
    danger: { bg: "#fef2f2", border: "#fecaca", ink: "#991b1b" },
    success: { bg: "#f0fdf4", border: "#bbf7d0", ink: "#166534" },
    warning: { bg: "#fffbeb", border: "#fde68a", ink: "#92400e" },
    neutral: { bg: "#f8fafc", border: "#e2e8f0", ink: "#334155" },
  }[tone];
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0;"><tr><td style="background:${palette.bg};border:1px solid ${palette.border};border-radius:10px;padding:16px 18px;font-family:${EMAIL_FONT};font-size:14px;line-height:1.6;color:${palette.ink};">${html}</td></tr></table>`;
}

/** Muted "manage notification preferences" line for notification emails. */
export function emailManagePrefs(): string {
  return emailParagraph(`<a href="${emailAppUrl()}/notifications" style="color:#64748b;">Manage notification preferences</a>`, { muted: true });
}
