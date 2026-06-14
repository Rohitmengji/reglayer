/**
 * RegLayer — Anchored Evidence Chain tests
 *
 * These tests are the proof of correctness for the tamper-evident proof chain.
 * Valid cases are built by computing REAL hashes via computeProofHash, so they
 * genuinely pass only if the implementation is correct.
 */

import { describe, it, expect } from "vitest";
import {
  canonicalize,
  computeProofHash,
  verifyProofIntegrity,
  verifyChain,
  type ChainLink,
} from "@/lib/vault/chain";

/**
 * Helper: build a properly-hashed chain link.
 */
function makeLink(
  id: string,
  evidence: unknown,
  prevHash: string | null,
  chainIndex: number,
  issuedAt: string
): ChainLink {
  const hash = computeProofHash({ evidence, prevHash, chainIndex, issuedAt });
  return { id, evidence, prevHash, chainIndex, issuedAt, hash };
}

/**
 * Helper: build a valid chain of N links with deterministic timestamps.
 */
function buildChain(n: number): ChainLink[] {
  const links: ChainLink[] = [];
  let prevHash: string | null = null;
  for (let i = 0; i < n; i++) {
    const issuedAt = new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString();
    const evidence = { scanId: `scan-${i}`, score: 90 + i, nested: { a: i, b: [i, i + 1] } };
    const link = makeLink(`proof-${i}`, evidence, prevHash, i, issuedAt);
    links.push(link);
    prevHash = link.hash;
  }
  return links;
}

describe("canonicalize", () => {
  it("produces identical output for same nested object with different key order", () => {
    const a = { z: 1, a: 2, nested: { y: 3, x: 4 } };
    const b = { nested: { x: 4, y: 3 }, a: 2, z: 1 };
    expect(canonicalize(a)).toBe(canonicalize(b));
  });

  it("sorts keys recursively at every depth", () => {
    const value = { b: { d: 1, c: 2 }, a: { f: 3, e: 4 } };
    expect(canonicalize(value)).toBe('{"a":{"e":4,"f":3},"b":{"c":2,"d":1}}');
  });

  it("preserves array order (arrays are not sorted)", () => {
    expect(canonicalize([3, 1, 2])).toBe("[3,1,2]");
    expect(canonicalize([3, 1, 2])).not.toBe(canonicalize([1, 2, 3]));
  });

  it("handles null, numbers, booleans, strings", () => {
    expect(canonicalize(null)).toBe("null");
    expect(canonicalize(42)).toBe("42");
    expect(canonicalize(-3.14)).toBe("-3.14");
    expect(canonicalize(true)).toBe("true");
    expect(canonicalize(false)).toBe("false");
    expect(canonicalize("hello")).toBe('"hello"');
    expect(canonicalize('quote"inside')).toBe('"quote\\"inside"');
  });

  it("handles nested arrays of objects with reordered keys", () => {
    const a = { list: [{ b: 1, a: 2 }, { d: 3, c: 4 }] };
    const b = { list: [{ a: 2, b: 1 }, { c: 4, d: 3 }] };
    expect(canonicalize(a)).toBe(canonicalize(b));
    expect(canonicalize(a)).toBe('{"list":[{"a":2,"b":1},{"c":4,"d":3}]}');
  });

  it("omits undefined object values (JSON semantics)", () => {
    expect(canonicalize({ a: 1, b: undefined })).toBe('{"a":1}');
  });
});

describe("computeProofHash", () => {
  const base = {
    evidence: { scanId: "s1", score: 95 },
    prevHash: null,
    chainIndex: 0,
    issuedAt: "2026-01-01T00:00:00.000Z",
  };

  it("is deterministic for the same input", () => {
    expect(computeProofHash(base)).toBe(computeProofHash(base));
  });

  it("is independent of evidence key order (canonical)", () => {
    const reordered = { ...base, evidence: { score: 95, scanId: "s1" } };
    expect(computeProofHash(base)).toBe(computeProofHash(reordered));
  });

  it("changes when evidence changes", () => {
    expect(computeProofHash({ ...base, evidence: { scanId: "s1", score: 96 } })).not.toBe(
      computeProofHash(base)
    );
  });

  it("changes when prevHash changes", () => {
    expect(computeProofHash({ ...base, prevHash: "deadbeef" })).not.toBe(computeProofHash(base));
  });

  it("changes when chainIndex changes", () => {
    expect(computeProofHash({ ...base, chainIndex: 1 })).not.toBe(computeProofHash(base));
  });

  it("changes when issuedAt changes", () => {
    expect(computeProofHash({ ...base, issuedAt: "2026-01-02T00:00:00.000Z" })).not.toBe(
      computeProofHash(base)
    );
  });

  it("returns a 64-char hex SHA-256 digest", () => {
    expect(computeProofHash(base)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("verifyProofIntegrity", () => {
  it("validates a genesis link (chainIndex 0, prevHash null)", () => {
    const genesis = makeLink("g", { scanId: "s1" }, null, 0, "2026-01-01T00:00:00.000Z");
    const result = verifyProofIntegrity(genesis);
    expect(result.hashValid).toBe(true);
    expect(result.computedHash).toBe(genesis.hash);
  });

  it("rejects a link whose hash field is corrupted", () => {
    const link = makeLink("g", { scanId: "s1" }, null, 0, "2026-01-01T00:00:00.000Z");
    const corrupted: ChainLink = { ...link, hash: "0".repeat(64) };
    const result = verifyProofIntegrity(corrupted);
    expect(result.hashValid).toBe(false);
    expect(result.computedHash).toBe(link.hash);
  });

  it("rejects a link whose evidence was mutated after hashing", () => {
    const link = makeLink("g", { scanId: "s1", score: 90 }, null, 0, "2026-01-01T00:00:00.000Z");
    const tampered: ChainLink = { ...link, evidence: { scanId: "s1", score: 100 } };
    expect(verifyProofIntegrity(tampered).hashValid).toBe(false);
  });
});

describe("verifyChain", () => {
  it("treats an empty chain as valid", () => {
    expect(verifyChain([])).toEqual({ valid: true, length: 0, brokenAt: null, issues: [] });
  });

  it("validates a single genesis link", () => {
    const genesis = makeLink("g", { scanId: "s1" }, null, 0, "2026-01-01T00:00:00.000Z");
    const report = verifyChain([genesis]);
    expect(report.valid).toBe(true);
    expect(report.length).toBe(1);
    expect(report.brokenAt).toBeNull();
    expect(report.issues).toEqual([]);
  });

  it("validates a valid chain of 4 links", () => {
    const report = verifyChain(buildChain(4));
    expect(report.valid).toBe(true);
    expect(report.length).toBe(4);
    expect(report.brokenAt).toBeNull();
    expect(report.issues).toEqual([]);
  });

  it("validates a chain regardless of input ordering (sorts by chainIndex)", () => {
    const chain = buildChain(4);
    const shuffled = [chain[2], chain[0], chain[3], chain[1]];
    const report = verifyChain(shuffled);
    expect(report.valid).toBe(true);
    expect(report.length).toBe(4);
  });

  it("detects tampered evidence in link #2 → hash-mismatch at index 2", () => {
    const chain = buildChain(4);
    // Mutate evidence after hashing — its stored hash no longer matches.
    chain[2] = { ...chain[2], evidence: { tampered: true } };
    expect(verifyProofIntegrity(chain[2]).hashValid).toBe(false);

    const report = verifyChain(chain);
    expect(report.valid).toBe(false);
    expect(report.issues.some((i) => i.index === 2 && i.problem === "hash-mismatch")).toBe(true);
    expect(report.brokenAt).toBe(2);
  });

  it("detects a broken link (link #2.prevHash set wrong) → broken-link at 2", () => {
    const chain = buildChain(4);
    // Re-hash link 2 with a bogus prevHash so its own hash stays valid but linkage breaks.
    chain[2] = makeLink(
      chain[2].id,
      chain[2].evidence,
      "0".repeat(64),
      chain[2].chainIndex,
      chain[2].issuedAt
    );
    const report = verifyChain(chain);
    expect(report.valid).toBe(false);
    const issue = report.issues.find((i) => i.index === 2);
    expect(issue?.problem).toBe("broken-link");
    expect(report.brokenAt).toBe(2);
  });

  it("detects a duplicate chainIndex → duplicate-index", () => {
    const chain = buildChain(3);
    // Force link #2 to reuse index 1 (re-hash so per-link hash stays valid).
    chain[2] = makeLink(chain[2].id, chain[2].evidence, chain[2].prevHash, 1, chain[2].issuedAt);
    const report = verifyChain(chain);
    expect(report.valid).toBe(false);
    expect(report.issues.some((i) => i.problem === "duplicate-index")).toBe(true);
  });

  it("detects a gap in chainIndex (0,1,3) → index-gap", () => {
    const chain = buildChain(3);
    // Re-index the third link to 3, leaving a hole at 2.
    chain[2] = makeLink(chain[2].id, chain[2].evidence, chain[2].prevHash, 3, chain[2].issuedAt);
    const report = verifyChain(chain);
    expect(report.valid).toBe(false);
    expect(report.issues.some((i) => i.problem === "index-gap")).toBe(true);
    expect(report.brokenAt).toBe(3);
  });

  it("detects a single corrupted hash field → hash-mismatch", () => {
    const chain = buildChain(3);
    chain[1] = { ...chain[1], hash: "f".repeat(64) };
    const report = verifyChain(chain);
    expect(report.valid).toBe(false);
    // The next link's prevHash now no longer matches the corrupted hash either,
    // but the first problem in walk order is the hash-mismatch on link 1.
    expect(report.issues.some((i) => i.index === 1 && i.problem === "hash-mismatch")).toBe(true);
  });
});
