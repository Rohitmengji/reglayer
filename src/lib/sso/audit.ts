/**
 * RegLayer — SSO connection audit log (server-only)  [review #32]
 *
 * Every connection/domain/role change writes an immutable SsoConnectionAudit
 * row (who / when / what / before→after / why) for incident response and change
 * history. Accepts a Prisma client OR a transaction client so the audit row can
 * be written atomically inside the same `$transaction` as the change it records.
 */
import "server-only";
import { prisma } from "@/lib/database/prisma";
import type { Prisma } from "@/generated/prisma/client";

export type SsoChangeType =
  | "CREATED"
  | "UPDATED"
  | "DELETED"
  | "ENABLED"
  | "DISABLED"
  | "DOMAIN_VERIFIED"
  | "ROLE_MAPPING_CHANGED";

export interface SsoAuditEntry {
  connectionId: string;
  /** Acting user id/email — null for system actions. */
  actor?: string | null;
  changeType: SsoChangeType;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}

export async function recordSsoAudit(
  client: Prisma.TransactionClient | typeof prisma,
  entry: SsoAuditEntry
): Promise<void> {
  await client.ssoConnectionAudit.create({
    data: {
      connectionId: entry.connectionId,
      actor: entry.actor ?? null,
      changeType: entry.changeType,
      reason: entry.reason ?? null,
      ...(entry.before !== undefined ? { before: entry.before as Prisma.InputJsonValue } : {}),
      ...(entry.after !== undefined ? { after: entry.after as Prisma.InputJsonValue } : {}),
    },
  });
}
