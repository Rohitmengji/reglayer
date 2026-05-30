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
      const deltaColor = site.scoreDelta > 0 ? "#16a34a" : site.scoreDelta < 0 ? "#dc2626" : "#6b7280";
      const deltaLabel = site.scoreDelta > 0 ? `+${site.scoreDelta}` : `${site.scoreDelta}`;
      const streakLabel = site.streak >= 3 ? `🔥 ${site.streak} scan streak` : "";

      return `
        <tr>
          <td style="padding: 12px 16px; border-bottom: 1px solid #f3f4f6;">
            <div style="font-weight: 600; color: #111827;">${site.siteName}</div>
            <div style="font-size: 12px; color: #6b7280; margin-top: 2px;">${site.siteUrl}</div>
          </td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #f3f4f6; text-align: center;">
            <div style="font-weight: 700; font-size: 18px; color: #111827;">${site.currentScore}</div>
          </td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #f3f4f6; text-align: center;">
            <span style="color: ${deltaColor}; font-weight: 600;">${deltaLabel}</span>
          </td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #f3f4f6; text-align: center; font-size: 12px;">
            ${streakLabel}
          </td>
        </tr>
      `;
    })
    .join("");

  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f9fafb; padding: 40px 0;">
      <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb;">
        <!-- Header -->
        <div style="background: #111827; padding: 24px 32px;">
          <h1 style="margin: 0; color: white; font-size: 18px; font-weight: 600;">
            RegLayer Weekly Digest
          </h1>
          <p style="margin: 4px 0 0; color: #9ca3af; font-size: 13px;">
            ${data.workspaceName} — Week of ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </p>
        </div>

        <!-- Greeting -->
        <div style="padding: 24px 32px 16px;">
          <p style="color: #374151; font-size: 14px; margin: 0;">
            Hi ${data.userName ?? "there"},
          </p>
          <p style="color: #6b7280; font-size: 14px; margin: 8px 0 0;">
            Here's how your sites performed this week:
          </p>
        </div>

        <!-- Sites Table -->
        <div style="padding: 0 32px 24px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <thead>
              <tr style="border-bottom: 2px solid #e5e7eb;">
                <th style="text-align: left; padding: 8px 16px; font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Site</th>
                <th style="text-align: center; padding: 8px 16px; font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">AIS</th>
                <th style="text-align: center; padding: 8px 16px; font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Change</th>
                <th style="text-align: center; padding: 8px 16px; font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Streak</th>
              </tr>
            </thead>
            <tbody>
              ${siteRows}
            </tbody>
          </table>
        </div>

        <!-- CTA -->
        <div style="padding: 0 32px 32px; text-align: center;">
          <a href="${data.baseUrl}/sites" style="display: inline-block; background: #111827; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 500;">
            View Full Trends →
          </a>
        </div>

        <!-- Footer -->
        <div style="background: #f9fafb; padding: 16px 32px; border-top: 1px solid #e5e7eb;">
          <p style="margin: 0; font-size: 11px; color: #9ca3af; text-align: center;">
            You're receiving this because you're a member of ${data.workspaceName}.
            <a href="${data.unsubscribeUrl ?? data.baseUrl + "/settings"}" style="color: #6b7280;">Manage preferences</a>
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
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
