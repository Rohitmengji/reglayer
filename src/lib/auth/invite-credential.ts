/**
 * RegLayer — Invitation Sign-In Credentials
 *
 * WHY: an invited member had no way into the product — the account was created
 *      without a password, so they had to discover the reset flow on their own.
 * WHAT: issues a single, expiring temporary password that is emailed to the
 *       invitee, accepted once at sign-in, and must be replaced immediately.
 * HOW: reuses the existing `password_resets` table. Invitation rows are tagged
 *      with a prefix so they can never be redeemed as a 6-digit reset code, and
 *      reset codes can never be used as a password. Only the bcrypt hash is
 *      stored; the plaintext exists solely in the invitation email.
 */

import { randomInt } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/database/prisma";

/** Marks a `password_resets` row as a sign-in credential rather than a reset code. */
export const INVITE_CREDENTIAL_PREFIX = "invite$";

/** An unused invitation stays valid for seven days. */
export const INVITE_CREDENTIAL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Excludes characters that are easy to confuse when retyped from an email.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** Generate a readable 16-character temporary password (~92 bits of entropy). */
export function generateTemporaryPassword(): string {
  const blocks = Array.from({ length: 4 }, () =>
    Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join(""),
  );
  return blocks.join("-");
}

const pendingWhere = (email: string) => ({
  email,
  used: false,
  otp: { startsWith: INVITE_CREDENTIAL_PREFIX },
});

/**
 * Issue a temporary password for `email`, replacing any earlier invitation.
 * The caller MUST deliver the returned password and revoke it if delivery fails.
 */
export async function issueInviteCredential(
  email: string,
): Promise<{ id: string; password: string; expiresAt: Date }> {
  const password = generateTemporaryPassword();
  const hash = await bcrypt.hash(password, 12);
  const expiresAt = new Date(Date.now() + INVITE_CREDENTIAL_TTL_MS);

  await prisma.passwordReset.updateMany({ where: pendingWhere(email), data: { used: true } });
  const record = await prisma.passwordReset.create({
    data: { email, otp: `${INVITE_CREDENTIAL_PREFIX}${hash}`, expiresAt },
  });

  return { id: record.id, password, expiresAt };
}

/** Retire a credential that could not be delivered, so it can never be used. */
export async function revokeInviteCredential(id: string): Promise<void> {
  await prisma.passwordReset.update({ where: { id }, data: { used: true } });
}

/** Returns the matching credential id, or null when the password is not a valid invitation. */
export async function verifyInviteCredential(email: string, password: string): Promise<string | null> {
  const candidates = await prisma.passwordReset.findMany({
    where: { ...pendingWhere(email), expiresAt: { gt: new Date() } },
    select: { id: true, otp: true },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  for (const candidate of candidates) {
    if (await bcrypt.compare(password, candidate.otp.slice(INVITE_CREDENTIAL_PREFIX.length))) {
      return candidate.id;
    }
  }
  return null;
}

/** True while the member is still signing in with a temporary password. */
export async function hasPendingInviteCredential(email: string): Promise<boolean> {
  const pending = await prisma.passwordReset.count({
    where: { ...pendingWhere(email), expiresAt: { gt: new Date() } },
  });
  return pending > 0;
}

/** Retire every outstanding invitation once the member chooses their own password. */
export async function consumeInviteCredentials(email: string): Promise<void> {
  await prisma.passwordReset.updateMany({ where: pendingWhere(email), data: { used: true } });
}
