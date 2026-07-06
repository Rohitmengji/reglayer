/**
 * Short random ID generator using crypto.getRandomValues.
 * Used for public-facing URL slugs where cuid() is too long.
 */

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

export function nanoid(length = 12): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let id = "";
  for (let i = 0; i < length; i++) {
    id += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return id;
}
