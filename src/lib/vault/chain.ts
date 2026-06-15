/**
 * RegLayer — Anchored Evidence Chain (pure, framework-free)
 *
 * WHY: A compliance proof whose checksum lives in the same row as its evidence is
 *      trivially forgeable — anyone with DB write can recompute and store a matching
 *      hash. There is also no tamper-evidence ACROSS the proof set: deleting,
 *      reordering, or back-dating proofs leaves no trace.
 *
 * WHAT: A Merkle-style hash chain. Each proof's hash covers its canonical evidence
 *       PLUS the previous proof's hash, its position in the chain, and its issue time.
 *       Tampering with one proof's evidence breaks that proof's own hash; tampering
 *       with order/links breaks the `prevHash` of every subsequent proof.
 *
 * HOW: Deterministic JSON canonicalization (recursive key sort) + SHA-256. Verifiable
 *      by ANY third party from the proof data alone — no trust in RegLayer required.
 *
 * This module is intentionally PURE: no "server-only", no Prisma, no Next.js. It is
 * importable in vitest and (in principle) by an external auditor's own verifier.
 */

import { createHash } from "crypto";

/**
 * Deterministically serialize any JSON-compatible value to a canonical string.
 *
 * Guarantees:
 * - Object keys are sorted RECURSIVELY at every depth (not just the top level).
 * - Array order is preserved (arrays are ordered data).
 * - null, numbers, strings, and booleans serialize as standard JSON.
 *
 * Two objects with identical content but different key insertion order produce
 * byte-identical output, which is the property the hash chain relies on.
 */
export function canonicalize(value: unknown): string {
  if (value === null) return "null";

  const type = typeof value;

  if (type === "number") {
    // JSON.stringify turns non-finite numbers into null; mirror that for safety.
    return Number.isFinite(value as number) ? String(value) : "null";
  }

  if (type === "boolean") return value ? "true" : "false";

  if (type === "string") return JSON.stringify(value);

  if (Array.isArray(value)) {
    // Preserve order; canonicalize each element. undefined → null (JSON semantics).
    const items = value.map((item) => (item === undefined ? "null" : canonicalize(item)));
    return `[${items.join(",")}]`;
  }

  if (type === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const parts: string[] = [];
    for (const key of keys) {
      const v = obj[key];
      // Omit keys whose value is undefined, matching JSON.stringify behavior.
      if (v === undefined) continue;
      parts.push(`${JSON.stringify(key)}:${canonicalize(v)}`);
    }
    return `{${parts.join(",")}}`;
  }

  // undefined / function / symbol — should not appear in JSON evidence. Treat as null.
  return "null";
}

/** The inputs that a proof's hash commits to. Order-independent (canonicalized). */
export interface ProofHashInput {
  evidence: unknown;
  prevHash: string | null;
  chainIndex: number;
  issuedAt: string;
}

/**
 * Compute the SHA-256 (hex) hash that binds a proof's evidence to its position in
 * the chain. The hash covers the canonical form of { evidence, prevHash, chainIndex,
 * issuedAt } so that altering ANY of those fields produces a different hash.
 */
export function computeProofHash(input: ProofHashInput): string {
  const canonical = canonicalize({
    evidence: input.evidence,
    prevHash: input.prevHash,
    chainIndex: input.chainIndex,
    issuedAt: input.issuedAt,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

/** A single link in the evidence chain, as stored and as independently verifiable. */
export type ChainLink = {
  id: string;
  evidence: unknown;
  prevHash: string | null;
  chainIndex: number;
  issuedAt: string;
  hash: string;
};

/** The kinds of integrity problems a chain can exhibit. */
export type ChainProblem = "hash-mismatch" | "broken-link" | "index-gap" | "duplicate-index";

export interface ChainIssue {
  index: number;
  id: string;
  problem: ChainProblem;
}

export interface ChainVerificationReport {
  valid: boolean;
  length: number;
  brokenAt: number | null;
  issues: ChainIssue[];
}

/**
 * Verify a single link in isolation: does its stored hash match a recomputation
 * over its evidence + chain fields?
 */
export function verifyProofIntegrity(link: ChainLink): { hashValid: boolean; computedHash: string } {
  const computedHash = computeProofHash({
    evidence: link.evidence,
    prevHash: link.prevHash,
    chainIndex: link.chainIndex,
    issuedAt: link.issuedAt,
  });
  return { hashValid: computedHash === link.hash, computedHash };
}

/**
 * Verify an entire chain. Links are first sorted by chainIndex, then walked:
 *
 *  (a) each link's stored hash must recompute        → else "hash-mismatch"
 *  (b) link[0] must be genesis (index 0, prevHash null), and each subsequent
 *      link.prevHash must equal the previous link's hash → else "broken-link"
 *  (c) chainIndex must strictly increment 0,1,2,...   → gap → "index-gap",
 *                                                        repeat → "duplicate-index"
 *
 * `valid` is true iff there are no issues. An empty chain is vacuously valid.
 * `brokenAt` is the chainIndex of the first problem encountered (null if none).
 */
export function verifyChain(links: ChainLink[]): ChainVerificationReport {
  if (links.length === 0) {
    return { valid: true, length: 0, brokenAt: null, issues: [] };
  }

  // Sort by chainIndex without mutating the caller's array.
  const sorted = [...links].sort((a, b) => a.chainIndex - b.chainIndex);

  const issues: ChainIssue[] = [];
  let prevHash: string | null = null;

  for (let i = 0; i < sorted.length; i++) {
    const link = sorted[i];

    // (a) Per-link hash integrity.
    const { hashValid } = verifyProofIntegrity(link);
    if (!hashValid) {
      issues.push({ index: link.chainIndex, id: link.id, problem: "hash-mismatch" });
    }

    // (c) Index sequencing. Expected index for position i is i.
    if (link.chainIndex !== i) {
      if (i > 0 && link.chainIndex === sorted[i - 1].chainIndex) {
        issues.push({ index: link.chainIndex, id: link.id, problem: "duplicate-index" });
      } else {
        issues.push({ index: link.chainIndex, id: link.id, problem: "index-gap" });
      }
    }

    // (b) Linkage. Genesis must have prevHash null; others must point at predecessor.
    if (link.prevHash !== prevHash) {
      issues.push({ index: link.chainIndex, id: link.id, problem: "broken-link" });
    }

    // Advance using the link's OWN stored hash so a downstream broken-link is detected
    // relative to what was actually recorded.
    prevHash = link.hash;
  }

  // brokenAt = chainIndex of the first problem (issues are pushed in walk order).
  const brokenAt = issues.length > 0 ? issues[0].index : null;

  return {
    valid: issues.length === 0,
    length: sorted.length,
    brokenAt,
    issues,
  };
}
