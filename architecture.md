# RegLayer — Architecture Overview

> Root overview. For the full directory map, key design decisions, environment
> config, and deployment, see `docs/architecture/PLATFORM.md` — this file stays
> consistent with it and zooms out to the layering principles.

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                          │
│                                                             │
│   Next.js App Router → Dashboard, Scan UI, Reports          │
│   State: Zustand + React Query                              │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          │ HTTP / REST
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                        API LAYER                             │
│                                                             │
│   /api/scan      → Initiate scans                           │
│   /api/reports   → Retrieve reports                         │
│   /api/health    → System health                            │
│                                                             │
│   Validation: Zod schemas at boundary                       │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          │ Service Layer
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                      SERVICE LAYER                           │
│                                                             │
│   scanService        → Orchestrates scan pipeline           │
│   reportService      → Generates compliance reports         │
│   complianceService  → Evaluates policy rules               │
└──────────┬──────────────────────────────┬───────────────────┘
           │                              │
           │                              │
┌──────────▼──────────┐    ┌──────────────▼───────────────────┐
│   SCANNER ENGINE    │    │       COMPLIANCE ENGINE           │
│                     │    │                                   │
│   Playwright        │    │   Rule Definitions                │
│   axe-core          │    │   Policy Evaluator                │
│   Crawling          │    │   WCAG Mapper                     │
│   Screenshots       │    │   Severity Engine                 │
└─────────────────────┘    └───────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│              EVIDENCE & LEGAL ENGINES (moats)                │
│                                                             │
│   vault/        → Anchored Evidence Chain (hash chain)      │
│   defense/      → Litigation Defense File (dossier)         │
│   triage/       → Demand-Letter Triage & Exposure Delta     │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│        DATA-NETWORK ENGINES (cross-tenant aggregation)      │
│                                                             │
│   genome/       → Fix Genome (which fixes actually work)    │
│   vendorgraph/  → Vendor Accessibility Liability Graph      │
└─────────────────────────────────────────────────────────────┘
```

## Design Principles

1. **Pipeline Architecture**: Every operation is a pipeline of discrete steps.
2. **Boundary Validation**: All external input validated at system boundaries.
3. **Separation of Concerns**: Scanner, compliance, AI, and UI are fully decoupled.
4. **Infrastructure Mindset**: Built for scale from day one.
5. **AI as Augmentation**: AI assists reasoning but is never the core system.
6. **Pure Core / Loader / Route**: Every domain engine splits into a framework-free
   pure core, a thin server-only data loader, and a thin route handler (see below).
7. **Security by Construction**: Resource ownership is asserted through one shared
   helper, so cross-tenant access cannot be forgotten per-route.

## Feature Module Pattern

Every newer feature is built as three thin layers so the logic stays exhaustively
unit-testable and the framework stays at the edges:

1. **Pure core** — no Prisma, no Next.js, no `"server-only"`. Plain functions over
   plain data, unit-tested directly in vitest (e.g. `vault/chain.ts`). All generated
   HTML is escaped via `escapeHtml` inside the core.
2. **Server-only data loader** — a thin module that reads from Prisma and shapes the
   plain-data inputs the pure core expects (e.g. `loadDefenseFileData.ts`).
3. **Route handler** — does authentication + format negotiation only (`?format=html|json`),
   delegating all logic to the core (e.g. `sites/[siteId]/defense-file/route.ts`).

**Best-effort recorders never throw.** `recordFixOutcome` and `recordVendorObservations`
swallow their own errors, so a not-yet-applied migration can never break the primary
scan/verify flow that calls them.

**i18n parity is enforced in CI.** Every user-facing string lives in all 7 locale files;
a parity test fails the build if a key is missing in any locale.

## Domain Engines

### Evidence & legal engines (moats)

- **Anchored Evidence Chain** (`src/lib/vault/`). `chain.ts` is the pure core:
  `canonicalize` (recursive key-sorted JSON), `computeProofHash` (SHA-256 over
  `evidence + prevHash + chainIndex + issuedAt`), `verifyProofIntegrity`, and
  `verifyChain` (detects `hash-mismatch` / `broken-link` / `index-gap` /
  `duplicate-index`). `proofEngine.ts` is the server side: `issueProof` appends to a
  Merkle-style per-workspace hash chain (`prevHash` + `chainIndex`, with a P2002 retry),
  plus `verifyProof` / `verifyWorkspaceChain`. `ComplianceProof` gained
  `prevHash` / `chainIndex` / `anchoredAt` / `anchorProof` and a
  `@@unique([workspaceId, chainIndex])`. This converts a forgeable in-row self-checksum
  into tamper-evident, *independently* verifiable evidence: altering one proof breaks its
  own hash; reordering or back-dating breaks every later `prevHash`. A **public,
  login-free** verifier lives at `/verify/[proofId]` backed by
  `GET /api/vault/[proofId]/verify`.

- **Litigation Defense File** (`src/lib/defense/`). `defenseFile.ts` is the pure core
  (`assembleDefenseFile`, `buildTimeline`, `computeGoodFaithMetrics`,
  `verifyProofsLocally`, `renderDefenseFileHTML`, `escapeHtml`); `loadDefenseFileData.ts`
  is the loader; `sites/[siteId]/defense-file/route.ts` serves `?format=html|json` over
  both GET and POST, IDOR-safe via `assertSiteAccess` on **both** verbs. One click
  assembles a chronological, hash-verified "ongoing good-faith remediation effort"
  dossier from data already on record: the full scan time series (including FAILED
  attempts), per-violation status transitions (from `AuditLog`), re-scan fix
  verifications, and the Anchored Evidence Chain ledger (each proof independently
  re-verified). Honest framing: revoked/expired proofs are not tampering, an empty chain
  is not "verified", and no third-party timestamp anchoring is claimed. No migration.

- **Demand-Letter Triage & Exposure-Delta Engine** (`src/lib/triage/`). `demandLetter.ts`
  is the pure core (`assessClaims`, `renderTriageHTML` — the dollar model is *injected* so
  the core stays pure); `parseDemandLetter.ts` extracts claims via gpt-4o-mini
  (zod-validated, degrades to null gracefully); `loadTriageData.ts` builds the exposure
  model from `legalRiskEngine`'s `LITIGATION_WEIGHTS` / `INDUSTRY_MULTIPLIERS` /
  `GEO_MULTIPLIERS`; `sites/[siteId]/demand-letter/route.ts` (POST, `assertSiteAccess`)
  accepts pasted `letterText` or a manual claims array and renders html|json; UI at
  `/demand-letter`. Each alleged claim is mapped onto your scan/violation/proof history and
  returned with a per-claim verdict (`never_detected` / `not_present_on_date` /
  `remediated` / `present_open` / `rule_unrecognized` / `no_scan_history`) plus a dollar
  exposure delta (gross alleged vs. net genuinely-open vs. rebutted). Stateless — no
  migration.

### Data-network engines (cross-tenant aggregation)

- **Fix Genome** (`src/lib/genome/`). `fixGenome.ts` is the pure core (`normalizeSelector`,
  `computeFingerprint`, `aggregateOutcomes`, `recommendForRule` — confidence rated by
  sample size); `recordOutcome.ts` is a best-effort recorder wired into
  `verifyViolationFix` (`src/lib/violations/status.ts`) that records every outcome —
  success *and* failure — keyed by `ruleId` + normalized structural fingerprint;
  `api/genome/recommend/route.ts` serves `?ruleId=&scope=global|workspace&by=rule|fingerprint`.
  Aggregated **cross-tenant**, this answers "for this barrier, this fix works X% of the
  time, median Y days." Backed by the new `FixOutcomeRecord` (`fix_outcomes`) model.

- **Vendor Accessibility Liability Graph (VALG)** (`src/lib/vendorgraph/`). `vendorGraph.ts`
  is the pure core (`aggregateVendorObservations`, `computeLiabilityScore` — reach-weighted,
  `detectVendorTrend` — regression over time); `recordObservations.ts` is a best-effort
  recorder wired into `api/vendor-risk/route.ts` (which also gained `assertScanAccess`,
  closing a cross-tenant IDOR); `api/vendor-graph/route.ts` serves
  `?vendor=&scope=global|workspace&splitDays=`. Scores every third-party widget (Intercom,
  OneTrust, Stripe, YouTube, …) by the real a11y liability it injects across **all**
  embedding sites (reach-weighted). Backed by the new `VendorObservation`
  (`vendor_observations`) model.

### Shared access control

`src/lib/auth/access.ts` is the single ownership helper: `assertScanAccess(scanId, session)`
and `assertSiteAccess(siteId, session)` return a discriminated `AccessResult`
(`{ ok: true, userId, isMasterAdmin, workspaceId }` or `{ ok: false, status: 401|403|404,
error }`). Master admins bypass; otherwise access requires workspace membership (or, for
legacy workspace-less scans, the owning `userId`). It is shared across the
vault / vpat / statement / risk / score / simulate routes and the new defense-file /
demand-letter / vendor-risk routes — closing the proof-forgery (C-3) and IDOR (S-3)
findings.

## Data Flow

```
User submits URL
    ↓
API validates with Zod
    ↓
Service layer orchestrates
    ↓
Scanner pipeline executes:
    → Launch browser
    → Navigate to page
    → Run axe-core
    → Normalize results
    → Classify severity
    → Generate score
    ↓
Compliance engine evaluates:
    → Match violations to rules
    → Calculate compliance %
    → Generate report
    ↓
Response returned to client
```

## Persistence & Scale

The data layer is live, not future. Prisma 7 (with the Neon serverless driver
adapter) models **34 models** and **10 enums**, all migrated and in sync with the
live Neon PostgreSQL database as of 2026-06-15. Recent additions: `Monitor`,
`CrawlJobRecord` (`crawl_jobs`), and `RumEventRecord` (`rum_events`) [#164];
`FixOutcomeRecord` (`fix_outcomes`) for the Fix Genome [#169]; and
`VendorObservation` (`vendor_observations`) for VALG [#170].

```
User submits URL
    ↓
API validates with Zod + asserts access (assertScanAccess/assertSiteAccess)
    ↓
Async scan enqueued (in-memory scanQueue) / scheduled (cron-parser)
    ↓
Scanner pipeline executes
    ↓
Results persisted (Neon PostgreSQL via Prisma)
    ↓
Best-effort recorders fan out cross-tenant signal
    (recordFixOutcome → fix_outcomes, recordVendorObservations → vendor_observations)
    ↓
Client polls for completion
```

The queue is in-memory today (V1 simplicity); the architecture is ClickHouse/Tinybird-
and BullMQ-ready for production scale. See `docs/architecture/PLATFORM.md` for the
deployment and environment details.

## Technology Decisions

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Frontend | Next.js 16 | App Router, RSC, API routes |
| Styling | Tailwind v4 + custom components | Consistent, accessible components |
| State | Zustand + React Query | Minimal boilerplate, server state |
| Validation | Zod | Runtime safety at boundaries |
| Scanner | Playwright (local) + puppeteer-core (serverless) + axe-core | Industry standard tools; serverless-compatible Chromium |
| Database | Neon PostgreSQL via Prisma 7 | Relational data, JSONB support, serverless pooling |
| Queue | In-memory scanQueue (BullMQ-ready) | V1 simplicity, scale-out path reserved |
| AI | OpenAI (gpt-4o-mini) | Explanation generation, demand-letter parsing |

## Surface & Test Coverage

| Surface | Count |
|---------|-------|
| API route files | 116 |
| UI pages | 72 |
| Prisma models / enums | 34 / 10 |
| Tests | 301 passing across 18 vitest suites |

The pure cores (`chain.ts`, `defenseFile.ts`, `demandLetter.ts`, `fixGenome.ts`,
`vendorGraph.ts`) carry the bulk of the unit tests precisely because they are
framework-free — no Prisma or Next mocking required.
