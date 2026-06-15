# RegLayer — Compliance Standards Reference

## Supported Standards

### WCAG 2.1 (Web Content Accessibility Guidelines)

| Level | Criteria | Coverage |
|-------|----------|----------|
| Level A | 30 success criteria | Full automated + manual checks |
| Level AA | 20 success criteria | Full automated + manual checks |
| Level AAA | 28 success criteria | Partial (best-effort advisory) |

### EN 301 549 v3.2.1 (European Standard)

The European harmonized standard for ICT accessibility. Maps directly to WCAG 2.1 with additional requirements for:
- Software (Chapter 11)
- Documentation (Chapter 12)
- ICT providing relay or emergency services (Chapter 13)

### Section 508 (US Federal)

Revised Section 508 aligns with WCAG 2.0 Level A and AA. RegLayer evaluates:
- 1194.22 Web-based intranet and internet information and applications
- 1194.31 Functional performance criteria

### European Accessibility Act (EAA)

Directive 2019/882 — applies from June 28, 2025 to:
- E-commerce websites
- Banking services
- Transport services
- E-books and e-readers
- Digital media players

---

## VPAT/ACR Generation

RegLayer auto-generates Voluntary Product Accessibility Conformance Reports:

### Supported Formats
- **JSON** — Structured data for API integration
- **Markdown** — Git-friendly, reviewable format
- **HTML** — Professional print-ready document (Ctrl+P → PDF)

### Conformance Levels
| Level | Definition |
|-------|------------|
| Supports | Fully meets the criterion |
| Partially Supports | Some functionality meets, some does not |
| Does Not Support | Majority of functionality does not meet |
| Not Applicable | Criterion is not relevant to the product |

### Mapping Coverage
- 50 WCAG 2.1 success criteria evaluated
- 50+ axe rule IDs mapped to specific criteria
- Per-criterion remarks with violation details
- Overall conformance level determination
- Legal disclaimer and evaluation methodology

---

## Legal-Defense Evidence Artifacts

WCAG/EAA/508/EN 301 549 conformance is necessary but not sufficient in litigation. ADA and EAA exposure turns on demonstrating *good-faith, ongoing remediation* and on rebutting specific demand-letter claims with dated, verifiable evidence. RegLayer ships three artifacts purpose-built for that defense. None of them weaken or replace the conformance checks above — they sit on top of the data RegLayer already records.

### Anchored Evidence Chain

Each compliance proof is appended to a Merkle-style, per-workspace hash chain rather than carrying a self-checksum in its own row. Every proof's SHA-256 hash commits to its canonical evidence **plus** the previous proof's hash, its position in the chain (`chainIndex`), and its issue time (`issuedAt`). The `ComplianceProof` record gained `prevHash`, `chainIndex`, `anchoredAt`, and `anchorProof`, with a `@@unique([workspaceId, chainIndex])` guarantee.

This converts a forgeable in-row checksum into **tamper-evident, independently verifiable** evidence:

- Altering one proof's evidence breaks that proof's own hash.
- Reordering or back-dating proofs breaks the `prevHash` of every later link.
- Chain verification (`verifyChain`) detects four distinct integrity problems: `hash-mismatch`, `broken-link`, `index-gap`, and `duplicate-index`.

The hash logic lives in a pure, framework-free module (`canonicalize`, `computeProofHash`, `verifyProofIntegrity`, `verifyChain`) so **any third party can re-verify a proof from its data alone — no trust in RegLayer required.** A public, login-free verification page (`/verify/[proofId]`) and endpoint (`GET /api/vault/[proofId]/verify`) expose this to auditors and opposing counsel.

> External timestamp anchoring (e.g. OpenTimestamps) is a graceful no-op stub today; only RegLayer's self-contained SHA-256 chain integrity is asserted. No third-party timestamp anchoring is claimed.

### Litigation Defense File

A one-click, chronological, hash-verified dossier of remediation activity for a single site, assembled entirely from data RegLayer already records (`GET`/`POST /api/sites/[siteId]/defense-file?format=html|json`, reachable from the site Risk Breakdown card). It documents the **ongoing good-faith remediation effort** a defense attorney needs to show:

- Full scan time series, **including FAILED attempts** (failures still evidence effort).
- Per-violation status transitions (from the audit log).
- Re-scan fix verifications.
- The Anchored Evidence Chain proof ledger, with **each proof independently re-verified** by the same pure code an external auditor would run.

It summarizes the effort with good-faith metrics: monitoring span, percent verified-fixed, mean/median time-to-remediate, accessibility-score trend, and chain integrity.

**Honest framing is baked in** so the document never over-claims in a legal context:

- `hashValid`, `revoked`, and `expired` are reported separately and never collapsed into a single "valid" — a revoked or expired proof is a lifecycle state, **not** tampering.
- An empty chain is reported as "empty (no proofs issued)", never "verified".
- Status-transition history is framed as a "record of activity", not an exhaustive audit trail.
- All interpolated values are HTML-escaped.

### Demand-Letter Triage & Exposure-Delta

Paste an ADA demand letter (or supply a manual claims array) and each alleged claim is mapped onto the site's recorded scan/violation/proof history and returned with an adversarial, **evidence-grounded per-claim verdict** plus a dollar exposure-delta (`POST /api/sites/[siteId]/demand-letter`, UI at `/demand-letter`). Letters are parsed by an LLM into structured, zod-validated claims; the assessment core itself is pure (the dollar model is injected, built from the legal-risk engine's litigation/industry/geo multipliers).

Each claim resolves to one of six verdicts:

| Verdict | Meaning | Exposure bucket |
|---------|---------|-----------------|
| `never_detected` | The rule never appeared in any scan — strongest rebuttal | rebutted |
| `not_present_on_date` | The barrier did not exist on the alleged date (or was already fixed by then) | rebutted |
| `remediated` | Detected but verified-fixed or absent from the latest scan | mitigated |
| `present_open` | Present and unresolved in the latest scan — genuine, current exposure | exposed |
| `rule_unrecognized` | Could not be mapped to a known automated rule — manual review | unquantified |
| `no_scan_history` | No completed scans on record — cannot assess from automated evidence | unquantified |

The summary rolls these into **gross alleged vs. net genuinely-open vs. rebutted** dollar exposure, surfacing the delta a recipient can use to respond before settling. Remediated claims are corroborated where a non-revoked Anchored Evidence Chain proof was issued at/after the fix.

> Exposure figures are settlement-pattern estimates, not predictions of any actual award. Automated scanning detects a subset of possible barriers; absence of a detected violation is not proof of full conformance. None of these artifacts are legal advice.

---

## Compliance Scoring

```
Score = 100 - Σ(violation_weight × severity_multiplier)

Severity Multipliers:
  Critical: 10 points
  Serious:   5 points
  Moderate:  2 points
  Minor:     1 point

Max deduction per rule: 25 points
Floor: 0 (minimum score)
```

---

## Regulatory Timeline

| Date | Regulation | Impact |
|------|-----------|--------|
| 2025-06-28 | EAA enforcement begins | All EU digital services must comply |
| 2025-06-28 | EN 301 549 v4 expected | Updated technical standard |
| 2026 | WCAG 2.2 adoption | New criteria: focus appearance, dragging, target size |
| 2027 | Expected EAA enforcement reviews | First compliance audits by authorities |
