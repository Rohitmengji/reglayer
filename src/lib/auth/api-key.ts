/**
 * RegLayer — API Key Authentication
 *
 * WHY: API-key auth (prefix + sha256 hash lookup) was copy-pasted across every
 *      CI/CD route, so a fix or a tenant-scoping bug had to be chased through
 *      four files. Centralize it here so every route authenticates identically.
 * WHAT: `authenticateApiKey(authHeader)` parses a `Bearer <key>` header, hashes
 *       the key, looks it up, and returns the key's identity (id, workspaceId,
 *       userId) — or null when missing/invalid/expired.
 * HOW: prefix = first 8 chars, keyHash = sha256(key); a single findFirst mirrors
 *      the exact lookup previously inlined. Callers MUST scope their work to the
 *      returned `workspaceId` to prevent cross-tenant access.
 */

import "server-only";

import { createHash, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/database/prisma";

export interface AuthenticatedApiKey {
  id: string;
  workspaceId: string;
  userId: string | null;
}

/**
 * Authenticate a request's API key.
 *
 * @param authHeader Raw value of the `Authorization` header (e.g. `Bearer rl_...`),
 *                   or a bare key string. `null`/empty → returns null.
 * @returns The key's identity ({ id, workspaceId, userId }) or null when the
 *          header is absent, malformed, or the key is invalid/expired.
 *
 * Note on side effects: this only authenticates. It deliberately does NOT bump
 * `lastUsedAt` — callers that want that can update it after a successful auth
 * (mirrors the prior inlined behavior, which did the touch separately).
 */
export async function authenticateApiKey(
  authHeader: string | null
): Promise<AuthenticatedApiKey | null> {
  const apiKey = authHeader?.replace("Bearer ", "");
  if (!apiKey) return null;

  const prefix = apiKey.substring(0, 8);
  const keyHash = createHash("sha256").update(apiKey).digest("hex");

  // Look up by prefix only, then constant-time compare the full hash to prevent
  // timing attacks that could leak whether a prefix is valid.
  const keyRecord = await prisma.apiKey.findFirst({
    where: { prefix, expiresAt: { gt: new Date() } },
  });

  if (!keyRecord) return null;

  // Constant-time comparison prevents attackers from measuring response time
  // to determine hash correctness character-by-character.
  const storedHash = Buffer.from(keyRecord.keyHash, "hex");
  const providedHash = Buffer.from(keyHash, "hex");
  if (storedHash.length !== providedHash.length || !timingSafeEqual(storedHash, providedHash)) {
    return null;
  }

  return {
    id: keyRecord.id,
    workspaceId: keyRecord.workspaceId,
    userId: keyRecord.userId ?? null,
  };
}
