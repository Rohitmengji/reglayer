/**
 * RegLayer — Cryptography Utilities
 *
 * WHY: OAuth tokens and webhook secrets need encryption at rest in the database.
 * WHAT: AES-256-GCM encrypt/decrypt functions for sensitive data.
 * HOW: Uses Node.js crypto module. Encryption key from ENCRYPTION_KEY env var. IV is random per encryption.
 */
import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/**
 * AES-256-GCM encryption for sensitive data (OAuth tokens, secrets).
 *
 * Encryption key is derived from ENCRYPTION_KEY env var (64 hex chars = 32 bytes).
 * Falls back to NEXTAUTH_SECRET if ENCRYPTION_KEY is not set (hashed to 32 bytes).
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits per NIST recommendation for GCM
const TAG_LENGTH = 16; // 128-bit auth tag

function getKey(): Buffer {
  const envKey = process.env.ENCRYPTION_KEY;
  if (envKey && envKey.length === 64) {
    return Buffer.from(envKey, "hex");
  }
  // Derive from NEXTAUTH_SECRET as fallback
  const secret = process.env.NEXTAUTH_SECRET || "dev-fallback-secret-not-for-production";
  const { createHash } = require("crypto");
  return createHash("sha256").update(secret).digest();
}

/**
 * Encrypt a plaintext string. Returns base64-encoded ciphertext with embedded IV and tag.
 * Format: base64(iv || ciphertext || authTag)
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });

  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Concatenate: IV (12) + ciphertext (variable) + authTag (16)
  const combined = Buffer.concat([iv, encrypted, tag]);
  return combined.toString("base64");
}

/**
 * Decrypt a base64-encoded ciphertext produced by encrypt().
 * Returns the original plaintext.
 */
export function decrypt(ciphertext: string): string {
  const key = getKey();
  const combined = Buffer.from(ciphertext, "base64");

  if (combined.length < IV_LENGTH + TAG_LENGTH + 1) {
    throw new Error("Invalid ciphertext: too short");
  }

  const iv = combined.subarray(0, IV_LENGTH);
  const tag = combined.subarray(combined.length - TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH, combined.length - TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

/**
 * Check if a string looks like it's already encrypted (base64 with correct length prefix).
 * Useful during migration to avoid double-encrypting.
 */
export function isEncrypted(value: string): boolean {
  try {
    const buf = Buffer.from(value, "base64");
    // Must have at least IV + tag + 1 byte of content
    return buf.length >= IV_LENGTH + TAG_LENGTH + 1 && value === buf.toString("base64");
  } catch {
    return false;
  }
}

/**
 * Encrypt a token if not already encrypted. Returns original if null/empty.
 */
export function encryptToken(token: string | null | undefined): string | null {
  if (!token) return null;
  if (isEncrypted(token)) return token;
  return encrypt(token);
}

/**
 * Decrypt a token. Returns original if it doesn't appear encrypted.
 */
export function decryptToken(token: string | null | undefined): string | null {
  if (!token) return null;
  if (!isEncrypted(token)) return token; // plaintext (legacy, pre-migration)
  try {
    return decrypt(token);
  } catch {
    // If decryption fails, return as-is (might be legacy plaintext)
    return token;
  }
}
