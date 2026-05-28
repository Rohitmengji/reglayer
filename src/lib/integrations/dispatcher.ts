/**
 * RegLayer — Integration Dispatcher
 *
 * WHY: When events occur (scan complete, score drop), all connected integrations need notification.
 * WHAT: Fan-out dispatcher that routes events to GitHub, Slack, and custom webhooks.
 * HOW: Queries user's connected integrations, dispatches event payload to each. Non-blocking (fire-and-forget).
 */

import { prisma } from "@/lib/database/prisma";
import { decryptToken } from "@/lib/crypto";

/**
 * Dispatch notification to all connected integrations for a workspace
 */
export async function dispatchToIntegrations(
  workspaceId: string,
  event: string,
  payload: Record<string, unknown>
) {
  const integrations = await prisma.integration.findMany({
    where: { workspaceId, enabled: true },
  });

  const results: { provider: string; success: boolean; error?: string }[] = [];

  for (const integration of integrations) {
    try {
      // Decrypt tokens before use
      const accessToken = decryptToken(integration.accessToken);

      switch (integration.provider) {
        case "slack":
          if (integration.webhookUrl) {
            const slackResult = await sendSlackNotification(integration.webhookUrl, event, payload);
            results.push({ provider: "slack", ...slackResult });
          }
          break;
        case "teams":
          if (integration.webhookUrl) {
            const teamsResult = await sendTeamsNotification(integration.webhookUrl, event, payload);
            results.push({ provider: "teams", ...teamsResult });
          }
          break;
        case "jira":
          if (integration.config) {
            const jiraResult = await createJiraIssue(integration, event, payload);
            results.push({ provider: "jira", ...jiraResult });
          }
          break;
        case "github":
          if (accessToken) {
            const ghResult = await createGithubIssue({ ...integration, accessToken }, event, payload);
            results.push({ provider: "github", ...ghResult });
          }
          break;
        default:
          // Other providers - just log
          results.push({ provider: integration.provider, success: true });
      }
    } catch (err) {
      results.push({ provider: integration.provider, success: false, error: String(err) });
    }
  }

  return results;
}

/**
 * Send Slack notification via incoming webhook
 */
async function sendSlackNotification(
  webhookUrl: string,
  event: string,
  payload: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  const message = formatSlackMessage(event, payload);

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });

  if (!res.ok) {
    return { success: false, error: `Slack returned ${res.status}` };
  }
  return { success: true };
}

function formatSlackMessage(event: string, payload: Record<string, unknown>) {
  const url = payload.url as string || "";
  const score = payload.score as number || 0;

  switch (event) {
    case "scan.completed":
      return {
        blocks: [
          {
            type: "header",
            text: { type: "plain_text", text: "🛡️ Scan Complete" },
          },
          {
            type: "section",
            fields: [
              { type: "mrkdwn", text: `*URL:*\n${url}` },
              { type: "mrkdwn", text: `*Score:*\n${score}%` },
              { type: "mrkdwn", text: `*Violations:*\n${payload.violations || 0}` },
              { type: "mrkdwn", text: `*Critical:*\n${payload.critical || 0}` },
            ],
          },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: { type: "plain_text", text: "View Report" },
                url: payload.reportUrl as string || "",
              },
            ],
          },
        ],
      };
    case "scan.failed":
      return {
        blocks: [
          {
            type: "header",
            text: { type: "plain_text", text: "❌ Scan Failed" },
          },
          {
            type: "section",
            text: { type: "mrkdwn", text: `Scan for *${url}* failed: ${payload.error || "Unknown error"}` },
          },
        ],
      };
    case "compliance.dropped":
      return {
        blocks: [
          {
            type: "header",
            text: { type: "plain_text", text: "🚨 Compliance Score Dropped" },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*${url}* compliance dropped from ${payload.previousScore}% to ${payload.currentScore}%`,
            },
          },
        ],
      };
    default:
      return { text: `[RegLayer] ${event}: ${JSON.stringify(payload)}` };
  }
}

/**
 * Send Microsoft Teams notification via incoming webhook
 */
async function sendTeamsNotification(
  webhookUrl: string,
  event: string,
  payload: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  const url = payload.url as string || "";
  const score = payload.score as number || 0;

  const card = {
    "@type": "MessageCard",
    "@context": "https://schema.org/extensions",
    themeColor: score >= 90 ? "00C853" : score >= 70 ? "FFD600" : "D50000",
    summary: `RegLayer: ${event}`,
    sections: [
      {
        activityTitle: `🛡️ RegLayer — ${event}`,
        facts: [
          { name: "URL", value: url },
          { name: "Score", value: `${score}%` },
          { name: "Violations", value: String(payload.violations || 0) },
        ],
        markdown: true,
      },
    ],
    potentialAction: payload.reportUrl
      ? [
          {
            "@type": "OpenUri",
            name: "View Report",
            targets: [{ os: "default", uri: payload.reportUrl }],
          },
        ]
      : [],
  };

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(card),
  });

  if (!res.ok) {
    return { success: false, error: `Teams returned ${res.status}` };
  }
  return { success: true };
}

/**
 * Create a Jira issue from a scan event
 */
async function createJiraIssue(
  integration: { accessToken: string | null; config: unknown },
  event: string,
  payload: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  if (!integration.accessToken) return { success: false, error: "No access token" };

  const config = integration.config as { domain: string; projectKey: string } | null;
  if (!config?.domain || !config?.projectKey) {
    return { success: false, error: "Jira config missing domain or projectKey" };
  }

  if (event !== "scan.completed") return { success: true }; // Only create issues for completed scans

  const url = payload.url as string || "";
  const critical = payload.critical as number || 0;
  if (critical === 0) return { success: true }; // No critical issues, skip

  const res = await fetch(`https://${config.domain}/rest/api/3/issue`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${integration.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fields: {
        project: { key: config.projectKey },
        summary: `[Accessibility] ${critical} critical violations on ${url}`,
        description: {
          type: "doc",
          version: 1,
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: `RegLayer found ${critical} critical accessibility violations on ${url}. Score: ${payload.score}%` },
              ],
            },
          ],
        },
        issuetype: { name: "Bug" },
        priority: { name: critical >= 5 ? "High" : "Medium" },
        labels: ["accessibility", "automated"],
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    return { success: false, error: `Jira API ${res.status}: ${errText.slice(0, 100)}` };
  }

  return { success: true };
}

/**
 * Create a GitHub issue from a scan event
 */
async function createGithubIssue(
  integration: { accessToken: string | null; config: unknown },
  event: string,
  payload: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  if (!integration.accessToken) return { success: false, error: "No access token" };

  const config = integration.config as { owner: string; repo: string } | null;
  if (!config?.owner || !config?.repo) {
    return { success: false, error: "GitHub config missing owner or repo" };
  }

  if (event !== "scan.completed") return { success: true };

  const url = payload.url as string || "";
  const critical = payload.critical as number || 0;
  if (critical === 0) return { success: true };

  const res = await fetch(`https://api.github.com/repos/${config.owner}/${config.repo}/issues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${integration.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
    },
    body: JSON.stringify({
      title: `[a11y] ${critical} critical violations on ${url}`,
      body: `## Accessibility Scan Results\n\n- **URL:** ${url}\n- **Score:** ${payload.score}%\n- **Critical violations:** ${critical}\n- **Total violations:** ${payload.violations}\n\n[View full report](${payload.reportUrl})\n\n---\n*Created automatically by RegLayer*`,
      labels: ["accessibility", "bug"],
    }),
  });

  if (!res.ok) {
    return { success: false, error: `GitHub API ${res.status}` };
  }

  return { success: true };
}
