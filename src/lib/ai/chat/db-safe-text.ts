/**
 * RegLayer — database-safe text
 *
 * WHAT: Removes characters Postgres cannot store in a text column.
 * WHY:  A NUL byte is rejected outright — `invalid byte sequence for encoding
 *       "UTF8": 0x00` — and so is a lone surrogate, because neither can be encoded
 *       as valid UTF-8. A JavaScript string can legally hold both, so any value
 *       arriving from a request body can carry a payload the database will refuse.
 *
 *       This surfaced as an unhandled 500 on POST /api/ai/conversations: the whole
 *       conversation failed to save and the client received an empty body it could
 *       not parse into an error message.
 * HOW:  Strip rather than reject. These characters carry no meaning in prose, and
 *       refusing the request would discard a real conversation over a character the
 *       user cannot see and did not knowingly type.
 */

/**
 * NUL, plus unpaired halves of a surrogate pair (a high surrogate not followed by a
 * low one, or a low surrogate not preceded by a high one). Correctly paired
 * surrogates — every emoji and astral-plane character — are left untouched.
 */
const UNSTORABLE_CHARS =
  /\u0000|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export function stripUnstorableChars(value: string): string {
  return value.replace(UNSTORABLE_CHARS, "");
}
