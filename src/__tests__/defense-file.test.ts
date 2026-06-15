/**
 * RegLayer — Litigation Defense File tests
 *
 * The dossier is a legal artifact, so its assembly logic is exhaustively tested.
 * Proof integrity cases build REAL hashes via computeProofHash (over the ISO-string
 * issuedAt, exactly as the chain does) so a verification test passes ONLY if the
 * implementation does the Date→ISO conversion correctly.
 */

import { describe, it, expect } from "vitest";
import { computeProofHash, verifyChain, type ChainLink } from "@/lib/vault/chain";
import {
  buildTimeline,
  computeGoodFaithMetrics,
  verifyProofsLocally,
  renderDefenseFileHTML,
  assembleDefenseFile,
  escapeHtml,
  DEFAULT_DEFENSE_DISCLAIMER,
  type DefenseFileInput,
  type DefenseScanInput,
  type DefenseViolationInput,
  type DefenseAuditInput,
  type DefenseProofInput,
} from "@/lib/defense/defenseFile";

// ─────────────── Helpers ───────────────

const d = (y: number, mo: number, da: number, h = 0, mi = 0, s = 0) =>
  new Date(Date.UTC(y, mo, da, h, mi, s));

function makeScan(over: Partial<DefenseScanInput> = {}): DefenseScanInput {
  return {
    id: "scan-1",
    status: "COMPLETED",
    score: 80,
    totalViolations: 3,
    critical: 1,
    serious: 1,
    moderate: 1,
    minor: 0,
    compliance: 75,
    pageTitle: "Home",
    url: "https://example.com",
    createdAt: d(2026, 0, 1),
    completedAt: d(2026, 0, 1, 0, 1),
    startedAt: d(2026, 0, 1),
    duration: 1200,
    errorMessage: null,
    ...over,
  };
}

function makeViolation(over: Partial<DefenseViolationInput> = {}): DefenseViolationInput {
  return {
    id: "v-1",
    scanId: "scan-1",
    ruleId: "color-contrast",
    impact: "serious",
    wcagCriteria: "1.4.3",
    wcagLevel: "AA",
    status: "OPEN",
    statusNote: null,
    statusUpdatedAt: null,
    statusUpdatedBy: null,
    verifiedAt: null,
    ...over,
  };
}

function makeAudit(over: Partial<DefenseAuditInput> = {}): DefenseAuditInput {
  return {
    id: "a-1",
    action: "violation.status_updated",
    actor: "user-1",
    target: "v-1",
    metadata: { status: "IN_PROGRESS", note: null, previousStatus: null },
    createdAt: d(2026, 0, 2),
    ...over,
  };
}

function makeProof(over: Partial<DefenseProofInput> = {}): DefenseProofInput {
  const issuedAt = over.issuedAt ?? d(2026, 0, 3);
  const evidence = over.evidence ?? { scanId: "scan-1", score: 90 };
  const prevHash = over.prevHash ?? null;
  const chainIndex = over.chainIndex ?? 0;
  const hash =
    over.hash ?? computeProofHash({ evidence, prevHash, chainIndex, issuedAt: issuedAt.toISOString() });
  return {
    id: "p-1",
    type: "SCAN_CERTIFICATE",
    title: "Certificate",
    standard: "WCAG 2.1 AA",
    score: 90,
    evidence,
    prevHash,
    chainIndex,
    issuedAt,
    expiresAt: null,
    revokedAt: null,
    revokedReason: null,
    hash,
    siteId: "site-1",
    ...over,
  };
}

/** Build a genuinely-valid N-proof chain and its verifyChain report. */
function buildProofChain(n: number): { proofs: DefenseProofInput[]; report: ReturnType<typeof verifyChain> } {
  const proofs: DefenseProofInput[] = [];
  let prevHash: string | null = null;
  for (let i = 0; i < n; i++) {
    const issuedAt = d(2026, 0, 3 + i);
    const evidence = { scanId: `scan-${i}`, score: 90 + i };
    const hash = computeProofHash({ evidence, prevHash, chainIndex: i, issuedAt: issuedAt.toISOString() });
    proofs.push(makeProof({ id: `p-${i}`, chainIndex: i, prevHash, issuedAt, evidence, hash }));
    prevHash = hash;
  }
  const links: ChainLink[] = proofs.map((p) => ({
    id: p.id,
    evidence: p.evidence,
    prevHash: p.prevHash,
    chainIndex: p.chainIndex,
    issuedAt: p.issuedAt.toISOString(),
    hash: p.hash,
  }));
  return { proofs, report: verifyChain(links) };
}

const EMPTY_REPORT = { valid: true, length: 0, brokenAt: null, issues: [] } as const;

function makeInput(over: Partial<DefenseFileInput> = {}): DefenseFileInput {
  return {
    site: { id: "site-1", url: "https://example.com", name: "Example", workspaceId: "ws-1" },
    generatedAt: d(2026, 5, 1),
    scans: [],
    violations: [],
    auditLogs: [],
    proofs: [],
    chainReport: { ...EMPTY_REPORT, issues: [] },
    ...over,
  };
}

// ─────────────── escapeHtml ───────────────

describe("escapeHtml", () => {
  it("escapes all five dangerous characters", () => {
    expect(escapeHtml(`<script>"&'`)).toBe("&lt;script&gt;&quot;&amp;&#039;");
  });

  it("escapes & before introducing entities (no double-escaping ordering bug)", () => {
    expect(escapeHtml("a & <b>")).toBe("a &amp; &lt;b&gt;");
  });
});

// ─────────────── buildTimeline ───────────────

describe("buildTimeline", () => {
  it("merges scans, audit, and proofs into one chronologically-sorted array", () => {
    const { proofs } = buildProofChain(1);
    const tl = buildTimeline(
      makeInput({
        scans: [makeScan({ completedAt: d(2026, 0, 1) })],
        auditLogs: [makeAudit({ createdAt: d(2026, 0, 2) })],
        proofs: [makeProof({ ...proofs[0], issuedAt: d(2026, 0, 3) })],
      })
    );
    const times = tl.map((e) => e.at.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(tl.map((e) => e.kind)).toEqual(["scan_run", "violation_status_changed", "proof_issued"]);
  });

  it("includes FAILED scans as scan_failed with errorMessage in detail", () => {
    const tl = buildTimeline(
      makeInput({ scans: [makeScan({ status: "FAILED", errorMessage: "navigation timeout" })] })
    );
    expect(tl).toHaveLength(1);
    expect(tl[0].kind).toBe("scan_failed");
    expect(tl[0].detail).toContain("navigation timeout");
  });

  it("excludes in-flight PENDING / RUNNING scans (no evidentiary value)", () => {
    const tl = buildTimeline(
      makeInput({ scans: [makeScan({ status: "PENDING" }), makeScan({ id: "s2", status: "RUNNING" })] })
    );
    expect(tl).toHaveLength(0);
  });

  it("status transitions carry toStatus + actor and NEVER fabricate fromStatus", () => {
    const tl = buildTimeline(
      makeInput({
        auditLogs: [makeAudit({ metadata: { status: "FIXED", note: "patched contrast" }, actor: "user-9" })],
      })
    );
    expect(tl[0].kind).toBe("violation_status_changed");
    expect(tl[0].toStatus).toBe("FIXED");
    expect(tl[0].fromStatus).toBeNull();
    expect(tl[0].actorId).toBe("user-9");
    expect(tl[0].detail).toContain("patched contrast");
  });

  it("emits a verification event from a 'violation.verified' audit row", () => {
    const tl = buildTimeline(
      makeInput({
        auditLogs: [makeAudit({ action: "violation.verified", metadata: { verifiedAt: "2026-01-02" } })],
      })
    );
    expect(tl[0].kind).toBe("violation_verified");
  });

  it("synthesizes a verification from verifiedAt when no audit row exists (fallback)", () => {
    const tl = buildTimeline(
      makeInput({ violations: [makeViolation({ status: "VERIFIED", verifiedAt: d(2026, 0, 5) })] })
    );
    expect(tl).toHaveLength(1);
    expect(tl[0].kind).toBe("violation_verified");
    expect(tl[0].violationId).toBe("v-1");
  });

  it("de-duplicates the fallback against a same-day audit verification (no double-count)", () => {
    const tl = buildTimeline(
      makeInput({
        violations: [makeViolation({ status: "VERIFIED", verifiedAt: d(2026, 0, 2, 10) })],
        auditLogs: [makeAudit({ action: "violation.verified", createdAt: d(2026, 0, 2, 9), metadata: {} })],
      })
    );
    expect(tl.filter((e) => e.kind === "violation_verified")).toHaveLength(1);
  });

  it("de-duplicates a verification whose audit row straddles UTC midnight", () => {
    const tl = buildTimeline(
      makeInput({
        // verifiedAt 00:05 Jan 3; audit createdAt 23:55 Jan 2 — different UTC days, same event.
        violations: [makeViolation({ status: "VERIFIED", verifiedAt: d(2026, 0, 3, 0, 5) })],
        auditLogs: [
          makeAudit({ action: "violation.verified", createdAt: d(2026, 0, 2, 23, 55), metadata: {} }),
        ],
      })
    );
    expect(tl.filter((e) => e.kind === "violation_verified")).toHaveLength(1);
  });

  it("synthesizes a status_changed from statusUpdatedAt when no audit row exists", () => {
    const tl = buildTimeline(
      makeInput({
        violations: [makeViolation({ status: "WONT_FIX", statusNote: "decorative", statusUpdatedAt: d(2026, 0, 6) })],
      })
    );
    expect(tl[0].kind).toBe("violation_status_changed");
    expect(tl[0].toStatus).toBe("WONT_FIX");
  });

  it("renders proof_issued events chronologically by issuedAt (the timeline is time-ordered)", () => {
    // p-1 has LATER issuedAt but EARLIER chainIndex than p-2.
    const p1 = makeProof({ id: "p-1", chainIndex: 0, issuedAt: d(2026, 0, 10) });
    const p2 = makeProof({ id: "p-2", chainIndex: 1, issuedAt: d(2026, 0, 4) });
    const tl = buildTimeline(makeInput({ proofs: [p2, p1] }));
    const issued = tl.filter((e) => e.kind === "proof_issued");
    // Chronologically, p-2 (Jan 4) precedes p-1 (Jan 10) despite the lower chainIndex.
    expect(issued.map((e) => e.proofId)).toEqual(["p-2", "p-1"]);
  });

  it("a revoked proof yields BOTH a proof_issued and a proof_revoked event", () => {
    const tl = buildTimeline(
      makeInput({
        proofs: [makeProof({ revokedAt: d(2026, 0, 9), revokedReason: "score dropped" })],
      })
    );
    expect(tl.map((e) => e.kind)).toEqual(["proof_issued", "proof_revoked"]);
    expect(tl[1].detail).toContain("score dropped");
  });

  it("does not crash on null / non-string metadata", () => {
    const tl = buildTimeline(
      makeInput({
        auditLogs: [
          makeAudit({ id: "a1", metadata: null }),
          makeAudit({ id: "a2", metadata: { status: 123 } }),
        ],
      })
    );
    expect(tl).toHaveLength(2);
    expect(tl[0].toStatus).toBeNull();
  });

  it("uses a deterministic tie-break for equal timestamps", () => {
    const at = d(2026, 0, 1);
    const { proofs } = buildProofChain(1);
    const input = makeInput({
      scans: [makeScan({ completedAt: at })],
      auditLogs: [makeAudit({ createdAt: at })],
      proofs: [makeProof({ ...proofs[0], issuedAt: at })],
    });
    expect(buildTimeline(input).map((e) => e.kind)).toEqual(
      buildTimeline(input).map((e) => e.kind)
    );
    expect(buildTimeline(input).map((e) => e.kind)).toEqual([
      "scan_run",
      "violation_status_changed",
      "proof_issued",
    ]);
  });
});

// ─────────────── computeGoodFaithMetrics ───────────────

describe("computeGoodFaithMetrics", () => {
  it("percentVerifiedFixed is 0 (not NaN) when there are no violations", () => {
    const m = computeGoodFaithMetrics(makeInput());
    expect(m.percentVerifiedFixed).toBe(0);
    expect(m.violationsTotal).toBe(0);
  });

  it("meanScanIntervalDays is null with fewer than 2 completed scans", () => {
    const m = computeGoodFaithMetrics(makeInput({ scans: [makeScan()] }));
    expect(m.meanScanIntervalDays).toBeNull();
  });

  it("computes monitoring span and mean interval over evenly-spaced completed scans", () => {
    const scans = [
      makeScan({ id: "s1", completedAt: d(2026, 0, 1) }),
      makeScan({ id: "s2", completedAt: d(2026, 0, 11) }),
      makeScan({ id: "s3", completedAt: d(2026, 0, 21) }),
    ];
    const m = computeGoodFaithMetrics(makeInput({ scans }));
    expect(m.monitoringSpanDays).toBe(20);
    expect(m.meanScanIntervalDays).toBe(10);
    expect(m.completedScans).toBe(3);
  });

  it("counts failed scans toward the monitoring span but not the interval", () => {
    const scans = [
      makeScan({ id: "s1", status: "FAILED", completedAt: d(2026, 0, 1), createdAt: d(2026, 0, 1) }),
      makeScan({ id: "s2", completedAt: d(2026, 0, 11) }),
    ];
    const m = computeGoodFaithMetrics(makeInput({ scans }));
    expect(m.failedScans).toBe(1);
    expect(m.completedScans).toBe(1);
    expect(m.monitoringSpanDays).toBe(10);
    expect(m.meanScanIntervalDays).toBeNull(); // only 1 completed
  });

  it("does not let a far-later FAILED scan inflate the completed-scan interval", () => {
    const scans = [
      makeScan({ id: "s1", completedAt: d(2026, 0, 1) }),
      makeScan({ id: "s2", completedAt: d(2026, 0, 11) }),
      makeScan({ id: "s3", status: "FAILED", completedAt: d(2026, 2, 1), createdAt: d(2026, 2, 1) }),
    ];
    const m = computeGoodFaithMetrics(makeInput({ scans }));
    // Interval is between the 2 COMPLETED scans (10d), NOT span ÷ completed-count.
    expect(m.meanScanIntervalDays).toBe(10);
  });

  it("excludes in-flight PENDING / RUNNING scans from the monitoring span", () => {
    const scans = [
      makeScan({ id: "s1", completedAt: d(2026, 0, 1), createdAt: d(2026, 0, 1) }),
      makeScan({ id: "s2", completedAt: d(2026, 0, 11), createdAt: d(2026, 0, 11) }),
      makeScan({ id: "s3", status: "RUNNING", completedAt: null, createdAt: d(2027, 0, 1) }),
    ];
    const m = computeGoodFaithMetrics(makeInput({ scans }));
    expect(m.monitoringSpanDays).toBe(10); // the 2027 RUNNING scan must not inflate it
  });

  it("computes the score trend ignoring null-score boundary scans", () => {
    const mk = (scores: Array<number | null>) =>
      computeGoodFaithMetrics(
        makeInput({
          scans: scores.map((sc, i) =>
            makeScan({ id: `s${i}`, score: sc, completedAt: d(2026, 0, 1 + i) })
          ),
        })
      ).exposureTrend;
    expect(mk([null, 70, 90])).toBe("improving"); // leading null ignored → 70→90
    expect(mk([70, 90, null])).toBe("improving"); // trailing null ignored → 70→90
    expect(mk([null, 90])).toBe("insufficient-data"); // only 1 scored point
  });

  it("computes mean/median time-to-remediate and excludes negative (clock-skew) samples", () => {
    const scans = [
      makeScan({ id: "s1", createdAt: d(2026, 0, 1) }),
      makeScan({ id: "s2", createdAt: d(2026, 0, 1) }),
      makeScan({ id: "s3", createdAt: d(2026, 0, 10) }),
    ];
    const violations = [
      makeViolation({ id: "v1", scanId: "s1", status: "VERIFIED", verifiedAt: d(2026, 0, 3) }), // 2d
      makeViolation({ id: "v2", scanId: "s2", status: "VERIFIED", verifiedAt: d(2026, 0, 7) }), // 6d
      makeViolation({ id: "v3", scanId: "s3", status: "VERIFIED", verifiedAt: d(2026, 0, 5) }), // -5d skew → excluded
    ];
    const m = computeGoodFaithMetrics(makeInput({ scans, violations }));
    expect(m.meanTimeToRemediateDays).toBe(4); // (2+6)/2
    expect(m.medianTimeToRemediateDays).toBe(4);
    expect(m.violationsVerified).toBe(3);
  });

  it("meanTimeToRemediate is null when no violation is verified", () => {
    const m = computeGoodFaithMetrics(makeInput({ scans: [makeScan()], violations: [makeViolation()] }));
    expect(m.meanTimeToRemediateDays).toBeNull();
  });

  it("classifies exposureTrend by score delta with a ±2 dead-band", () => {
    const trend = (first: number, last: number) =>
      computeGoodFaithMetrics(
        makeInput({
          scans: [
            makeScan({ id: "s1", score: first, completedAt: d(2026, 0, 1) }),
            makeScan({ id: "s2", score: last, completedAt: d(2026, 0, 2) }),
          ],
        })
      ).exposureTrend;
    expect(trend(70, 85)).toBe("improving");
    expect(trend(85, 70)).toBe("worsening");
    expect(trend(80, 81)).toBe("flat");
  });

  it("exposureTrend is insufficient-data with a single completed scan", () => {
    const m = computeGoodFaithMetrics(makeInput({ scans: [makeScan()] }));
    expect(m.exposureTrend).toBe("insufficient-data");
  });

  it("maps chainIntegrity empty / verified / broken correctly", () => {
    expect(computeGoodFaithMetrics(makeInput()).chainIntegrity).toBe("empty");
    expect(
      computeGoodFaithMetrics(makeInput({ chainReport: { valid: true, length: 2, brokenAt: null, issues: [] } }))
        .chainIntegrity
    ).toBe("verified");
    expect(
      computeGoodFaithMetrics(
        makeInput({
          chainReport: { valid: false, length: 2, brokenAt: 1, issues: [{ index: 1, id: "p", problem: "broken-link" }] },
        })
      ).chainIntegrity
    ).toBe("broken");
  });

  it("counts proofs and revoked proofs, and distinct rules / status buckets", () => {
    const m = computeGoodFaithMetrics(
      makeInput({
        violations: [
          makeViolation({ id: "v1", ruleId: "label", status: "OPEN" }),
          makeViolation({ id: "v2", ruleId: "label", status: "FIXED" }),
          makeViolation({ id: "v3", ruleId: "image-alt", status: "VERIFIED" }),
          makeViolation({ id: "v4", ruleId: "image-alt", status: "IN_PROGRESS" }),
        ],
        proofs: [makeProof({ id: "p1" }), makeProof({ id: "p2", revokedAt: d(2026, 0, 9) })],
      })
    );
    expect(m.distinctRulesEverOpen).toBe(2);
    expect(m.violationsResolved).toBe(2); // FIXED + VERIFIED
    expect(m.violationsVerified).toBe(1);
    expect(m.violationsOpen).toBe(2); // OPEN + IN_PROGRESS
    expect(m.proofCount).toBe(2);
    expect(m.revokedProofCount).toBe(1);
  });
});

// ─────────────── verifyProofsLocally ───────────────

describe("verifyProofsLocally", () => {
  it("reports hashValid=true for genuine proofs (Date→ISO conversion correct)", () => {
    const { proofs } = buildProofChain(3);
    const v = verifyProofsLocally(proofs, d(2026, 5, 1));
    expect(v.every((p) => p.hashValid)).toBe(true);
    expect(v.map((p) => p.chainIndex)).toEqual([0, 1, 2]);
  });

  it("orders the ledger by chainIndex (canonical order) even when issuedAt diverges", () => {
    const p1 = makeProof({ id: "p-1", chainIndex: 0, issuedAt: d(2026, 0, 10) });
    const p2 = makeProof({ id: "p-2", chainIndex: 1, issuedAt: d(2026, 0, 4) });
    const ledger = verifyProofsLocally([p2, p1], d(2026, 5, 1));
    expect(ledger.map((p) => p.chainIndex)).toEqual([0, 1]);
    expect(ledger.map((p) => p.proofId)).toEqual(["p-1", "p-2"]);
  });

  it("reports hashValid=false when evidence is tampered after hashing", () => {
    const p = makeProof();
    const tampered = { ...p, evidence: { scanId: "scan-1", score: 1 } }; // hash no longer matches
    const v = verifyProofsLocally([tampered], d(2026, 5, 1));
    expect(v[0].hashValid).toBe(false);
  });

  it("treats revocation and expiry as independent of cryptographic validity", () => {
    const p = makeProof({ revokedAt: d(2026, 0, 9), revokedReason: "drop", expiresAt: d(2026, 0, 5) });
    const v = verifyProofsLocally([p], d(2026, 5, 1));
    expect(v[0].hashValid).toBe(true); // still cryptographically intact
    expect(v[0].revoked).toBe(true);
    expect(v[0].expired).toBe(true);
  });

  it("computes expiry against the passed `now`, not wall-clock (deterministic)", () => {
    const p = makeProof({ expiresAt: d(2026, 3, 1) });
    expect(verifyProofsLocally([p], d(2026, 1, 1))[0].expired).toBe(false); // now < expiry
    expect(verifyProofsLocally([p], d(2026, 5, 1))[0].expired).toBe(true); // now > expiry
  });
});

// ─────────────── renderDefenseFileHTML (escaping & content) ───────────────

describe("renderDefenseFileHTML", () => {
  it("escapes XSS payloads in site name, proof title, scan error, and audit status", () => {
    const xss = `<script>alert(1)</script>`;
    const input = makeInput({
      site: { id: "s", url: "https://x.com", name: xss, workspaceId: "ws" },
      scans: [makeScan({ status: "FAILED", errorMessage: xss })],
      auditLogs: [makeAudit({ metadata: { status: `" onmouseover=evil` } })],
      proofs: [makeProof({ title: xss })],
    });
    const html = renderDefenseFileHTML(assembleDefenseFile(input));
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain(`" onmouseover=evil`);
    expect(html).toContain("&quot; onmouseover=evil");
  });

  it("produces a self-contained document with the legal disclaimer", () => {
    const html = renderDefenseFileHTML(assembleDefenseFile(makeInput()));
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain(escapeHtml(DEFAULT_DEFENSE_DISCLAIMER));
  });

  it("renders an empty chain as 'not a compliance claim', never 'Verified'", () => {
    const html = renderDefenseFileHTML(assembleDefenseFile(makeInput()));
    expect(html).toContain("not a compliance claim");
    expect(html).not.toContain("Verified — all");
  });

  it("supports a custom disclaimer override", () => {
    const html = renderDefenseFileHTML(assembleDefenseFile(makeInput()), { disclaimer: "Custom legal text" });
    expect(html).toContain("Custom legal text");
  });
});

// ─────────────── assembleDefenseFile (integration) ───────────────

describe("assembleDefenseFile (integration)", () => {
  it("assembles a realistic multi-source history consistently end-to-end", () => {
    const { proofs, report } = buildProofChain(2);
    const revokedProofs = [proofs[0], { ...proofs[1], revokedAt: d(2026, 1, 1), revokedReason: "regressed" }];
    const input = makeInput({
      scans: [
        makeScan({ id: "s1", completedAt: d(2026, 0, 1), score: 70 }),
        makeScan({ id: "s2", status: "FAILED", completedAt: d(2026, 0, 5), errorMessage: "timeout" }),
        makeScan({ id: "s3", completedAt: d(2026, 0, 10), score: 88 }),
      ],
      violations: [
        makeViolation({ id: "v1", scanId: "s1", status: "VERIFIED", verifiedAt: d(2026, 0, 4) }),
        makeViolation({ id: "v2", scanId: "s1", status: "OPEN" }),
      ],
      auditLogs: [makeAudit({ id: "a1", target: "v1", createdAt: d(2026, 0, 3) })],
      proofs: revokedProofs,
      chainReport: report,
    });

    const file = assembleDefenseFile(input);
    expect(file.metrics.completedScans).toBe(2);
    expect(file.metrics.failedScans).toBe(1);
    expect(file.metrics.exposureTrend).toBe("improving"); // 70 → 88
    expect(file.metrics.chainIntegrity).toBe("verified");
    expect(file.metrics.revokedProofCount).toBe(1);
    expect(file.proofVerifications).toHaveLength(2);
    expect(file.proofVerifications.every((p) => p.hashValid)).toBe(true);
    // timeline: 2 scan_run + 1 scan_failed + 1 status + 1 verified + 2 proof_issued + 1 proof_revoked = 8
    expect(file.timeline).toHaveLength(8);
    // chronological
    const times = file.timeline.map((e) => e.at.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("handles a completely empty site without throwing", () => {
    const file = assembleDefenseFile(makeInput());
    expect(file.timeline).toEqual([]);
    expect(file.metrics.chainIntegrity).toBe("empty");
    expect(file.metrics.percentVerifiedFixed).toBe(0);
    expect(file.metrics.firstScanAt).toBeNull();
    expect(file.proofVerifications).toEqual([]);
  });

  it("legacy workspace-less site (empty chain) renders a valid dossier", () => {
    const input = makeInput({
      site: { id: "s", url: "https://legacy.com", name: null, workspaceId: null },
      scans: [makeScan()],
    });
    const file = assembleDefenseFile(input);
    expect(file.metrics.chainIntegrity).toBe("empty");
    const html = renderDefenseFileHTML(file);
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
  });
});
