/**
 * RegLayer — Weekly Digest Email
 *
 * WHY: Users forget to check their accessibility progress. A weekly email
 *      with score deltas and violation counts keeps them engaged and coming back.
 *
 * WHAT: Generates and sends a weekly digest for a workspace, covering all sites.
 *       Shows: each site's current AIS, delta vs last week, violation delta, streak.
 *
 * HOW: Queries all sites in workspace → fetches recent scan data → computes deltas →
 *      formats HTML email → sends via existing email service. Respects notification prefs.
 *
 * USAGE: Called externally by a Vercel cron or queue. Not a route — just a callable function.
 */

import { prisma } from "@/lib/database/prisma";
import { sendEmail } from "@/lib/email/service";
import { renderEmailLayout, emailParagraph, emailButton, escapeHtml } from "@/lib/email/layout";
import { getScoreDelta, getImprovementStreak } from "@/lib/analytics/trends";

// ─────────────── Types ───────────────

interface SiteDigestEntry {
  siteName: string;
  siteUrl: string;
  siteId: string;
  currentScore: number;
  scoreDelta: number;
  violationDelta: number;
  streak: number;
}

// ─────────────── Main Function ───────────────

/**
 * Generates and sends a weekly digest for all members of a workspace.
 * Skips users who have opted out via notification preferences.
 *
 * @param workspaceId - The workspace to generate digest for
 * @returns Number of emails sent
 */
export async function sendWeeklyDigest(workspaceId: string): Promise<number> {
  // Fetch workspace with sites and members
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      name: true,
      sites: { select: { id: true, name: true, url: true } },
      members: {
        select: {
          user: { select: { id: true, email: true, name: true } },
        },
      },
    },
  });

  if (!workspace || workspace.sites.length === 0) return 0;

  // Compute deltas for each site
  const siteEntries: SiteDigestEntry[] = [];

  for (const site of workspace.sites) {
    const [delta, streak] = await Promise.all([
      getScoreDelta(site.id),
      getImprovementStreak(site.id),
    ]);

    siteEntries.push({
      siteName: site.name ?? site.url,
      siteUrl: site.url,
      siteId: site.id,
      currentScore: delta?.currentScore ?? 0,
      scoreDelta: delta?.scoreDelta ?? 0,
      violationDelta: delta?.violationDelta ?? 0,
      streak: streak.currentStreak,
    });
  }

  // Skip if no data to report
  if (siteEntries.every((s) => s.currentScore === 0)) return 0;

  // Calculate overall workspace score change
  const totalScoreChange = siteEntries.reduce((sum, s) => sum + s.scoreDelta, 0);
  const scoreChangeLabel = totalScoreChange > 0
    ? `+${totalScoreChange} points`
    : totalScoreChange < 0
    ? `${totalScoreChange} points`
    : "no change";

  // Get members who want weekly digests
  const memberUserIds = workspace.members.map((m) => m.user.id);
  const prefs = await prisma.notificationPreference.findMany({
    where: { userId: { in: memberUserIds } },
    select: { userId: true, weeklyDigest: true },
  });

  const optedOutIds = new Set(
    prefs.filter((p) => p.weeklyDigest === false).map((p) => p.userId)
  );

  // Send to each eligible member
  let sentCount = 0;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.reglayer.eu";

  for (const member of workspace.members) {
    if (optedOutIds.has(member.user.id)) continue;

    const subject = `Your RegLayer week: ${workspace.name} — ${scoreChangeLabel}`;
    const html = buildDigestHtml({
      userName: member.user.name ?? member.user.email,
      workspaceName: workspace.name,
      sites: siteEntries,
      baseUrl,
      unsubscribeUrl: `${baseUrl}/settings`,
    });
    const text = buildDigestText({
      workspaceName: workspace.name,
      sites: siteEntries,
      baseUrl,
    });

    const result = await sendEmail({
      to: member.user.email,
      subject,
      html,
      text,
    });

    if (result.success) sentCount++;
  }

  return sentCount;
}

// ─────────────── Email Templates ───────────────

interface DigestTemplateData {
  userName?: string;
  workspaceName: string;
  sites: SiteDigestEntry[];
  baseUrl: string;
  unsubscribeUrl?: string;
}

function buildDigestHtml(data: DigestTemplateData): string {
  const siteRows = data.sites
    .map((site) => {
      const deltaColor = site.scoreDelta > 0 ? "#16a34a" : site.scoreDelta < 0 ? "#dc2626" : "#64748b";
      const deltaLabel = site.scoreDelta > 0 ? `+${site.scoreDelta}` : `${site.scoreDelta}`;
      const streakLabel = site.streak >= 3 ? `${site.streak} scan streak` : "";
      return `
        <tr>
          <td style="padding:11px 14px;border-bottom:1px solid #f1f5f9;">
            <div style="font-weight:600;color:#0f172a;">${escapeHtml(site.siteName)}</div>
            <div style="font-size:12px;color:#64748b;margin-top:2px;">${escapeHtml(site.siteUrl)}</div>
          </td>
          <td style="padding:11px 14px;border-bottom:1px solid #f1f5f9;text-align:center;font-weight:700;font-size:16px;color:#0f172a;">${site.currentScore}</td>
          <td style="padding:11px 14px;border-bottom:1px solid #f1f5f9;text-align:center;color:${deltaColor};font-weight:600;">${deltaLabel}</td>
          <td style="padding:11px 14px;border-bottom:1px solid #f1f5f9;text-align:center;font-size:12px;color:#64748b;">${streakLabel}</td>
        </tr>`;
    })
    .join("");

  const contentHtml = `
      ${emailParagraph(`Hi ${escapeHtml(data.userName ?? "there")}, here's how your sites performed this week.`)}
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:8px 0 4px;">
        <thead>
          <tr style="border-bottom:2px solid #e2e8f0;">
            <th style="text-align:left;padding:8px 14px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Site</th>
            <th style="text-align:center;padding:8px 14px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">AIS</th>
            <th style="text-align:center;padding:8px 14px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Change</th>
            <th style="text-align:center;padding:8px 14px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Streak</th>
          </tr>
        </thead>
        <tbody>${siteRows}</tbody>
      </table>
      ${emailButton(`${data.baseUrl}/sites`, "View full trends")}`;

  return renderEmailLayout({
    preheader: `${data.workspaceName} — your weekly accessibility digest`,
    title: `Weekly digest — ${escapeHtml(data.workspaceName)}`,
    contentHtml,
    footnote: `You're a member of ${escapeHtml(data.workspaceName)}. <a href="${data.unsubscribeUrl ?? data.baseUrl + "/settings"}" style="color:#94a3b8;">Manage preferences</a>`,
  });
}

function buildDigestText(data: { workspaceName: string; sites: SiteDigestEntry[]; baseUrl: string }): string {
  const lines = [
    `RegLayer Weekly Digest — ${data.workspaceName}`,
    `Week of ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`,
    "",
    "Your sites this week:",
    "",
  ];

  for (const site of data.sites) {
    const delta = site.scoreDelta > 0 ? `+${site.scoreDelta}` : `${site.scoreDelta}`;
    const streak = site.streak >= 3 ? ` (🔥 ${site.streak} scan streak)` : "";
    lines.push(`  ${site.siteName} (${site.siteUrl}): AIS ${site.currentScore} (${delta})${streak}`);
  }

  lines.push("", `View trends: ${data.baseUrl}/sites`, "");
  return lines.join("\n");
}
