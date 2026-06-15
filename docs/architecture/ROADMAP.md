# RegLayer — Platform Roadmap

## Strategic Vision

RegLayer evolves from a scan tool into the **compliance operating system** for European digital businesses. The platform should feel like Datadog meets Stripe — developer-first infrastructure that compliance teams actually want to use.

---

## ✅ Phase 1: Core Scanner (COMPLETE)

- Single-page axe-core scanning
- WCAG 2.1 AA + EN 301 549 compliance rules
- PDF reports, compliance certificates
- AI-powered violation explanations (GPT-4o-mini)
- Scheduled monitoring with cron expressions
- Google OAuth + credentials auth

---

## ✅ Phase 2: Foundation (COMPLETE)

### 2.1 — Multi-Tenant Workspaces & Teams ✅
- Workspace creation (org-level container)
- Team invitations (email invite flow)
- Role-based access: Owner → Admin → Member → Viewer
- Per-workspace scan history, schedules, and settings
- Plan-based limits (team size, features, scan quotas)

### 2.2 — Persistent Database (PostgreSQL + Prisma) ✅
- Prisma 7 ORM with Neon serverless PostgreSQL
- Full schema: users, workspaces, scans, violations, schedules, audit_log, integrations
- Optimized indexes on all hot query paths
- Audit trail: who scanned what, when, what changed

### 2.3 — Scan Comparison & Regression Detection ✅
- Compare current vs. previous scan for same URL
- Highlight: new violations, resolved violations, score delta
- Side-by-side visual diff

### 2.4 — Webhook & CI/CD Integration ✅
- CI Gatekeeper: scan on PR, post review with AI fix suggestions
- GitHub Action generator (gate + review modes)
- Webhook notifications (Slack, email, custom HTTP)
- API key auth for programmatic access

---

## ✅ Phase 3: Intelligence Layer (COMPLETE)

### 3.1 — Compliance Dashboard ✅
- Organization-wide compliance posture score (dashboard)
- Trend lines across monitored sites (analytics)
- Score distribution and violation frequency charts

### 3.2 — Remediation Workflow ✅
- Auto-remediation engine (jsdom DOM transforms)
- Drop-in script for instant client-side fixes
- Server-side proxy mode for full HTML patching
- Priority queue based on severity/impact

### 3.3 — Revenue Impact Analytics ✅
- Revenue loss calculator using disability prevalence data
- Regional calculations (US, UK, EU, AU, CA)
- Legal risk assessment and recommendation engine
- Per-violation cost breakdown

### 3.4 — Real User Monitoring (RUM) ✅
- ~3KB production JS snippet
- 9 barrier types: focus traps, keyboard failures, ARIA errors, etc.
- Event aggregation with impact scoring
- Assistive technology detection
- Device and session tracking

### 3.5 — VPAT/ACR Generation ✅
- Full WCAG 2.1 criteria database (50 success criteria)
- 50+ axe rule-to-WCAG criterion mappings
- Output formats: JSON, Markdown, HTML (print-ready)
- Supports VPAT 2.4 Rev, Section 508, EN 301 549

---

## ✅ Phase 4: Scale & Enterprise (COMPLETE)

### 4.1 — Authenticated Scanning ✅
- Cookie-based auth injection for scans
- Encrypted credential storage (AuthConfig model)
- Form-fill automation for gated content
- Session management across multi-page crawls

### 4.2 — API-First Platform ✅
- Full REST API (116 routes) with Zod validation
- API key auth with SHA-256 hashed storage
- Rate limiting via Upstash Redis
- OpenAPI reference page at /api-reference

### 4.3 — Design System Compliance ✅
- Scan Storybook instances (stories.json / index.json)
- 8 component-level accessibility rules
- Hotspot detection (fix once → fix everywhere)
- Usage count tracking for impact prioritization
- Support for Storybook 6+ and 7+

### 4.4 — White-Label Agency Platform ✅
- Full rebranding: custom domain, logo, colors, brand name
- Agency client management with workspace isolation
- Agency API keys for programmatic access
- Plans: STARTER / PROFESSIONAL / ENTERPRISE
- Branded email templates

---

## ✅ Phase 5: Market Differentiation (COMPLETE)

### 5.1 — Lawsuit Risk Score Engine ✅
- Predictive legal liability (0–100) based on 2025 ADA filing patterns
- Industry/geography multipliers from public lawsuit data
- Financial exposure estimates per violation pattern
- Risk tier classification: LOW / MODERATE / HIGH / CRITICAL
- Executive-readable risk narrative

### 5.2 — Compliance Proof Vault ✅
- Cryptographically timestamped (SHA-256 hash chains) audit trail
- Auto-recording after every scan + violation status change
- Chain integrity verification
- PDF vault export for legal defense

### 5.3 — CI/CD Regression Guard ✅
- Guard policies with per-site threshold configuration
- GitHub App integration (PR comments + Checks API)
- CLI support for pipeline blocking
- Baseline comparison for regression detection

### 5.4 — Regulation Deadline Intelligence ✅
- 7 regulations seeded with real compliance dates
- Obligation engine maps regulations to industry + geography
- Countdown timers with urgency classification
- Gap analysis against each regulation's WCAG requirements

### 5.5 — Human Testing Network ✅
- Validator profiles with disability types + assistive tech
- Test request marketplace with budget and turnaround
- Matching engine: AT + disability + availability
- Payment tracking structure (ready for Stripe integration)

### 5.6 — Notification System ✅
- In-app notification bell with unread count
- Email notifications (scan complete, weekly digest)
- Per-type preference management
- Weekly digest cron job

### 5.7 — Onboarding & Personalization ✅
- Role-based onboarding (Developer/Designer/Legal/Executive)
- Getting started checklist (server-authoritative state)
- Smart visibility logic (hides for veteran users)
- Cross-device persistence via database

---

## ✅ Phase 6: Tier-1 Defensibility Moats (COMPLETE)

The five novel, hard-to-copy features that move RegLayer from "another scanner" to a defensible category leader: three **legal moats** (turning recorded data into court-grade evidence) and two **data-network moats** (cross-tenant datasets a single-site tool cannot build). Each follows the same shape — a **PURE core** (no Prisma/Next/`server-only`, exhaustively unit-testable like `chain.ts`), a thin `server-only` data loader, and a thin route handler doing auth + format negotiation. All generated HTML is `escapeHtml`-escaped; best-effort recorders never throw so a pending migration can't break the primary flow; every user-facing string lives in all 7 i18n locales (CI parity test).

### 6.1 — Anchored Evidence Chain ✅ (#165) — *legal moat*
- Replaces the forgeable in-row self-checksum with a Merkle-style, per-workspace hash chain: each proof's SHA-256 hash covers its canonical evidence **plus** `prevHash`, `chainIndex`, and `issuedAt`
- Tampering with one proof breaks its own hash; reordering or back-dating breaks the `prevHash` of every later proof
- Pure core `src/lib/vault/chain.ts`: `canonicalize`, `computeProofHash`, `verifyProofIntegrity`, `verifyChain` (detects hash-mismatch / broken-link / index-gap / duplicate-index)
- `src/lib/vault/proofEngine.ts`: `issueProof` appends with a P2002 retry on `@@unique([workspaceId, chainIndex])`; `verifyProof`, `verifyWorkspaceChain`
- `ComplianceProof` gained `prevHash` / `chainIndex` / `anchoredAt` / `anchorProof`; external timestamp anchoring is a graceful no-op stub (never claimed as fact)
- **Public, login-free verification**: page `/verify/[proofId]` + `GET /api/vault/[proofId]/verify` — independently verifiable by any third party from the proof data alone

### 6.2 — Litigation Defense File ✅ (#166) — *legal moat*
- One click assembles a chronological, hash-verified "ongoing good-faith remediation effort" dossier from data already recorded — no new data captured, no migration needed
- Pure core `src/lib/defense/defenseFile.ts`: `assembleDefenseFile`, `buildTimeline`, `computeGoodFaithMetrics`, `verifyProofsLocally` (reuses the chain's own `verifyProofIntegrity`), `renderDefenseFileHTML`, `escapeHtml`
- Timeline merges full scan time series (incl. FAILED attempts), per-violation status transitions (from `AuditLog`), re-scan fix verifications, and the Anchored Evidence Chain proof ledger (each proof independently re-verified)
- Good-faith metrics: monitoring span, % verified-fixed, mean/median time-to-remediate, accessibility-score trend, chain integrity
- Honest framing baked in: revoked/expired proofs are a lifecycle state, NOT tampering; an empty chain is reported "empty", never "verified"; no third-party anchoring claimed
- `GET`+`POST /api/sites/[siteId]/defense-file` (`?format=html|json`), IDOR-safe via `assertSiteAccess` on **both** verbs; trigger button on `RiskBreakdownCard`

### 6.3 — Demand-Letter Triage & Exposure-Delta Engine ✅ (#168) — *legal moat*
- Paste an ADA demand letter → each alleged claim is mapped onto the site's scan/violation/proof history and returned with a per-claim verdict (`never_detected` / `not_present_on_date` / `remediated` / `present_open` / `rule_unrecognized` / `no_scan_history`) plus a dollar exposure delta (gross alleged vs. net genuinely-open vs. rebutted)
- Pure core `src/lib/triage/demandLetter.ts`: `assessClaims`, `renderTriageHTML` — the dollar model is **injected** so the core never imports the server-only `legalRiskEngine` and stays pure
- `src/lib/triage/parseDemandLetter.ts` (gpt-4o-mini, zod-validated, graceful null); `loadTriageData.ts` builds the exposure model from `legalRiskEngine` LITIGATION_WEIGHTS / INDUSTRY_MULTIPLIERS / GEO_MULTIPLIERS
- `POST /api/sites/[siteId]/demand-letter` (`assertSiteAccess`, accepts pasted `letterText` OR a manual claims array, `html|json`); page `/demand-letter`
- Stateless — no migration

### 6.4 — Fix Genome ✅ (#169) — *data-network moat*
- Learns which specific fix actually worked (re-scan-verified), keyed by `ruleId` + a normalized structural fingerprint, aggregated **cross-tenant** → "for this barrier, this fix works X% of the time, median Y days," confidence-rated by sample size
- Pure core `src/lib/genome/fixGenome.ts`: `normalizeSelector`, `computeFingerprint`, `aggregateOutcomes`, `recommendForRule`
- `src/lib/genome/recordOutcome.ts` (best-effort, never throws) wired into `verifyViolationFix` in `src/lib/violations/status.ts` — records every outcome, success AND failure
- `GET /api/genome/recommend?ruleId=&scope=global|workspace&by=rule|fingerprint`
- New model `FixOutcomeRecord` (`fix_outcomes`); migration applied

### 6.5 — Vendor Accessibility Liability Graph (VALG) ✅ (#170) — *data-network moat*
- Scores every third-party widget (Intercom, OneTrust, Stripe, YouTube, …) by the real a11y liability it injects across **all** embedding sites — reach-weighted — with regression-over-time detection
- Pure core `src/lib/vendorgraph/vendorGraph.ts`: `aggregateVendorObservations`, `computeLiabilityScore` (reach-weighted), `detectVendorTrend` (split-period regression)
- `src/lib/vendorgraph/recordObservations.ts` (best-effort) wired into `src/app/api/vendor-risk/route.ts`, which also gained `assertScanAccess` (closing a cross-tenant IDOR)
- `GET /api/vendor-graph?vendor=&scope=global|workspace&splitDays=`
- New model `VendorObservation` (`vendor_observations`); migration applied

### 6.6 — Security-by-Construction ✅
- `src/lib/auth/access.ts`: `assertScanAccess(scanId, session)` / `assertSiteAccess(siteId, session)` returning a discriminated `AccessResult` (`{ok:true,userId,isMasterAdmin,workspaceId}` | `{ok:false,status:401|403|404,error}`)
- Master-admin bypass, else workspace membership (or legacy `userId` for workspace-less scans)
- One shared ownership helper across vault / vpat / statement / risk / score / simulate plus the new defense-file / demand-letter / vendor-risk routes
- Closed the proof-forgery (C-3) and IDOR (S-3) findings

---

## Phase 7: Revenue & Growth (NEXT)

| # | Feature | Impact | Effort | Why Now |
|---|---------|--------|--------|---------|
| 1 | **Stripe billing** | Critical | Medium | Revenue — users can't upgrade plans today |
| 2 | **Multi-region scanning** | High | Medium | Detect geo-specific accessibility differences |
| 3 | **Custom compliance policies** | High | Medium | Enterprise differentiation |
| 4 | **Public API SDKs** | High | Medium | Developer adoption, partner integrations |
| 5 | **Compliance certification badge** | Medium | Low | Public trust signal for verified sites |

---

## Architecture Evolution

```
V1 (Shipped):                V2 (Target):
──────────────              ──────────────
In-memory queue    →        Redis + BullMQ (persistent jobs)
In-memory RUM store →       ClickHouse / Tinybird (event analytics)
Single region scan →        Multi-region (US/EU/APAC)
Manual plans       →        Stripe billing + usage metering
301 tests / 18 suites →     + E2E Playwright suite + 80%+ coverage
Console logging    →        Structured JSON + correlation IDs
```
