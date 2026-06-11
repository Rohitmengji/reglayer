/**
 * RegLayer — Notification Dispatcher
 *
 * WHY: Scans, schedules, and system events need to notify users in-app and via email.
 * WHAT: Creates in-app Notification rows, respects user preferences, sends email + webhooks.
 * HOW: Writes to DB, checks NotificationPreference booleans, delegates to email service.
 *      All failures are logged but never thrown — notifications must not break scans.
 */
import "server-only";
import { prisma } from "@/lib/database/prisma";
import { sendEmail } from "@/lib/email/service";
import { dispatchWebhookEvent, type WebhookEvent } from "@/lib/integrations/webhookDispatcher";
import { logger } from "@/lib/telemetry/logger";

const log = logger.withContext({ module: "notifications:dispatcher" });

export type NotificationType =
  | "scanComplete"
  | "scoreDegraded"
  | "newViolations"
  | "complianceAlert"
  | "weeklyDigest"
  | "teamActivity";

export interface NotifyPayload {
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  workspaceId?: string;
  /** Optional HTML email body — if omitted, no email sent */
  emailHtml?: string;
  emailSubject?: string;
}

/**
 * Send an in-app notification to a user.
 * Respects NotificationPreference for email delivery.
 * Never throws — all errors are logged and swallowed.
 */
export async function notify(userId: string, payload: NotifyPayload): Promise<void> {
  try {
    // 1. Write in-app notification row
    await prisma.notification.create({
      data: {
        userId,
        workspaceId: payload.workspaceId ?? null,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        link: payload.link ?? null,
      },
    });

    // 2. Check user's notification preferences for email
    const prefs = await prisma.notificationPreference.findUnique({
      where: { userId },
    });

    const shouldEmail = shouldSendEmail(payload.type, prefs);

    if (shouldEmail && payload.emailHtml) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });

      if (user?.email) {
        await sendEmail({
          to: user.email,
          subject: payload.emailSubject ?? payload.title,
          html: payload.emailHtml,
          text: payload.body,
        }).catch((err) => {
          log.warn("Email delivery failed", { userId, type: payload.type, error: String(err) });
        });
      }
    }

    // 3. Fire webhook event if notification type maps to a known webhook event
    if (payload.workspaceId) {
      const webhookEvent = mapToWebhookEvent(payload.type);
      if (webhookEvent) {
        await dispatchWebhookEvent(webhookEvent, {
          userId,
          type: payload.type,
          title: payload.title,
          body: payload.body,
          link: payload.link,
        }).catch(() => {});
      }
    }
  } catch (err) {
    log.error("Notification dispatch failed", {
      userId,
      type: payload.type,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Send notifications to all members of a workspace.
 * Respects each user's individual preferences.
 */
export async function notifyWorkspace(workspaceId: string, payload: Omit<NotifyPayload, "workspaceId">): Promise<void> {
  try {
    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId },
      select: { userId: true },
    });

    await Promise.allSettled(
      members.map((m) => notify(m.userId, { ...payload, workspaceId }))
    );
  } catch (err) {
    log.error("Workspace notification failed", {
      workspaceId,
      type: payload.type,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Map notification type to the corresponding preference boolean.
 */
function shouldSendEmail(
  type: NotificationType,
  prefs: { scanComplete: boolean; weeklyDigest: boolean; newViolations: boolean; complianceAlerts: boolean; teamActivity: boolean; scheduledReports: boolean } | null
): boolean {
  // No preference record = all defaults (true for most)
  if (!prefs) return true;

  switch (type) {
    case "scanComplete":
      return prefs.scanComplete;
    case "scoreDegraded":
    case "complianceAlert":
      return prefs.complianceAlerts;
    case "newViolations":
      return prefs.newViolations;
    case "weeklyDigest":
      return prefs.weeklyDigest;
    case "teamActivity":
      return prefs.teamActivity;
    default:
      return true;
  }
}

/**
 * Map notification type to a known webhook event type (if applicable).
 */
function mapToWebhookEvent(type: NotificationType): WebhookEvent | null {
  switch (type) {
    case "scanComplete":
      return "scan.completed";
    case "scoreDegraded":
      return "score.degraded";
    case "newViolations":
      return "alert.triggered";
    default:
      return null;
  }
}
