# RegLayer — Platform Architecture

## Overview

RegLayer is an enterprise accessibility compliance platform that scans websites for WCAG 2.1 violations, maps them to European regulatory frameworks, and generates actionable compliance intelligence.

**Live:** https://reglayer.vercel.app  
**Stack:** Next.js 16 · TypeScript · Tailwind CSS v4 · Playwright · puppeteer-core · axe-core · OpenAI

---

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENT (React 19)                     │
├─────────────────────────────────────────────────────────┤
│  Pages: Landing · Dashboard · Scans · Settings · Login  │
│  State: Zustand (localStorage) · React Query            │
│  UI: Tailwind v4 · Lucide Icons · Custom Components     │
└──────────────────────────┬──────────────────────────────┘
                           │ HTTPS
┌──────────────────────────▼──────────────────────────────┐
│                  SERVER (Next.js App Router)             │
├─────────────────────────────────────────────────────────┤
│  Proxy (Auth Gate): /dashboard, /scans, /settings, /api │
│  API Routes: /api/scan · /api/reports · /api/ai · ...   │
│  Auth: NextAuth 4 (JWT, Credentials + Google OAuth)     │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│                   CORE ENGINE LAYER                      │
├─────────────────────────────────────────────────────────┤
│  Scanner Pipeline:                                      │
│    axeScanner → issueNormalizer → severityEngine        │
│    → wcagMapper → scanPipeline (orchestrator)           │
│                                                         │
│  Browser Abstraction:                                   │
│    launch.ts (Playwright local / puppeteer-core Vercel) │
│    crawler.ts · screenshot.ts · playwright.ts           │
│                                                         │
│  Compliance Engine:                                     │
│    policyEvaluator → wcagRules + euAccessibilityRules   │
│                                                         │
│  AI Layer:                                              │
│    violationExplainer · complianceSummary (GPT-4o-mini) │
│                                                         │
│  Evidence & Legal Engines (PURE core + loader + route): │
│    vault/chain (Anchored Evidence Chain hash chain)     │
│    defense/defenseFile (Litigation Defense File)        │
│    triage/demandLetter (demand-letter exposure delta)   │
│                                                         │
│  Data-Network Engines (cross-tenant aggregation):       │
│    genome/fixGenome (Fix Genome) · vendorgraph (VALG)   │
│                                                         │
│  Queue & Scheduling:                                    │
│    scanQueue (in-memory) · scheduler (cron-parser)      │
│                                                         │
│  Reporting:                                             │
│    jsPDF + autotable → PDF compliance reports           │
└─────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
src/
├── app/                          # Next.js App Router
│   ├── page.tsx                  # Public landing page
│   ├── layout.tsx                # Root layout (fonts, providers)
│   ├── dashboard/page.tsx        # Main scanner interface
│   ├── scans/page.tsx            # Scan history
│   ├── scans/[id]/page.tsx       # Scan detail view
│   ├── settings/page.tsx         # Scheduled scans config
│   ├── auth/login/page.tsx       # Login (credentials + Google)
│   ├── demand-letter/page.tsx    # Demand-letter triage UI
│   ├── verify/[proofId]/page.tsx # PUBLIC, login-free Anchored Evidence Chain verification
│   └── api/
│       ├── scan/route.ts         # POST: single-page scan
│       ├── scan/async/route.ts   # POST/GET: async scan + polling
│       ├── scan/crawl/route.ts   # POST: multi-page crawl scan
│       ├── reports/route.ts      # POST: generate PDF report
│       ├── ai/explain/route.ts   # POST: AI explanations
│       ├── schedules/route.ts    # GET/POST: CRUD schedules
│       ├── vault/[proofId]/verify/route.ts   # GET: public, login-free proof verification
│       ├── sites/[siteId]/defense-file/route.ts   # GET/POST: Litigation Defense File (html|json)
│       ├── sites/[siteId]/demand-letter/route.ts  # POST: demand-letter triage (html|json)
│       ├── genome/recommend/route.ts          # GET: Fix Genome recommendation (global|workspace)
│       ├── vendor-graph/route.ts              # GET: cross-tenant vendor liability ranking
│       ├── health/route.ts       # GET: health check
│       └── auth/[...nextauth]/   # NextAuth handler
├── lib/
│   ├── scanner/                  # Core scanning engine
│   │   ├── accessibility/        # axe-core, normalization, scoring
│   │   ├── browser/              # Browser launch, crawl, screenshot
│   │   ├── journey/              # Multi-step flow scanner (Playwright)
│   │   ├── design-system/        # Storybook component scanner
│   │   └── pipelines/            # Orchestration
│   ├── compliance/               # Policy evaluation, WCAG rules, VPAT generator
│   ├── vault/                    # Anchored Evidence Chain: chain.ts (PURE hash chain) + proofEngine
│   ├── defense/                  # Litigation Defense File: defenseFile.ts (PURE) + loader
│   ├── triage/                   # Demand-letter triage: demandLetter.ts (PURE) + parse + loader
│   ├── genome/                   # Fix Genome: fixGenome.ts (PURE) + recordOutcome (best-effort)
│   ├── vendorgraph/              # VALG: vendorGraph.ts (PURE) + recordObservations (best-effort)
│   ├── remediation/              # jsdom-based DOM transform engine
│   ├── rum/                      # Real User Monitoring event collector
│   ├── analytics/                # Revenue impact calculator
│   ├── ai/                       # OpenAI integration
│   ├── auth/                     # NextAuth config + access.ts (assertScanAccess/assertSiteAccess)
│   ├── credits/                  # Plan limits & credit management
│   ├── integrations/             # Slack, GitHub review, webhook dispatch
│   ├── intelligence/             # Alert engine, priority engine, analytics
│   ├── queue/                    # Job queue & scheduler
│   ├── database/                 # Prisma client & helpers
│   ├── email/                    # Nodemailer SMTP service
│   ├── telemetry/                # Structured logging
│   ├── types/                    # TypeScript definitions
│   ├── validations/              # Zod schemas
│   ├── constants/                # App-wide constants
│   └── utils/                    # Utilities
├── components/
│   ├── ui/                       # Base components (button, card, badge, etc.)
│   ├── layout/                   # App shell, sidebar
│   ├── scanner/                  # Scan form, violation cards
│   ├── dashboard/                # Score cards, stats
│   ├── forms/                    # Form components
│   ├── reports/                  # Report components
│   └── charts/                   # Compliance trend, analytics
├── stores/                       # Zustand state
├── hooks/                        # Custom React hooks
├── services/                     # Service orchestration
└── proxy.ts                      # Auth middleware (Next.js 16)
```

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Playwright local + puppeteer-core serverless | Playwright's full install is too large for Lambda. puppeteer-core + @sparticuz/chromium is the proven serverless combo |
| jsdom for remediation (not Playwright) | Lighter weight, no browser spin-up. Fast DOM manipulation for fix application |
| `src/proxy.ts` middleware (not middleware.ts) | Next.js 16 convention for request interception — acts as auth gate + security headers |
| Prisma 7 with driver adapter | Neon serverless compatibility, connection pooling via @neondatabase/serverless |
| In-memory stores for RUM/Design System | V1 simplicity. ClickHouse/Tinybird ready architecture for production scale |
| Plan gating via WorkspaceMember → Workspace.plan | Enables team-level plan management (not per-user) |
| Zod for all API input validation | Runtime type safety at system boundaries, auto-generates error details |
| SHA-256 hashed API keys | Keys stored securely, timing-safe comparison prevents enumeration |
| Workspace-scoped data access | All queries filter by workspace to prevent IDOR across tenants |
| PURE core + server loader + thin route per feature | Legally/financially load-bearing logic (chain, defense file, triage, genome, VALG) lives in framework-free PURE modules (no Prisma/Next/`server-only`) so it is exhaustively unit-testable; a thin `server-only` loader fetches data and a thin route does auth + format negotiation |
| Merkle-style hash chain for proofs (not in-row checksum) | An in-row self-checksum is forgeable; `vault/chain.ts` binds each proof to its predecessor (`prevHash` + `chainIndex` + `issuedAt`) so tampering/reordering/back-dating is detectable by any third party from the data alone |
| Best-effort recorders (`recordFixOutcome`/`recordVendorObservations`) | Never throw — a pending migration or transient write failure cannot break the primary flow (fix verification, vendor-risk response) |
| Shared `assertScanAccess`/`assertSiteAccess` ownership helper | One discriminated `AccessResult` used across vault/vpat/statement/risk/score/simulate + the new defense-file/demand-letter/vendor-risk routes; closed proof-forgery (C-3) and IDOR (S-3) |
| All generated HTML `escapeHtml`-escaped | Every interpolated untrusted value in defense-file/triage HTML is escaped; only derived enums/numbers (class names) interpolate raw |

---

## Feature Architecture Pattern

Every recent moat feature follows the same three-layer split. The point is to keep the
legally/financially load-bearing logic in a **PURE core** that can be tested without a
database or a browser, exactly like `vault/chain.ts`:

| Layer | Contains | Constraint |
|-------|----------|------------|
| **(a) PURE core** | `vault/chain.ts`, `defense/defenseFile.ts`, `triage/demandLetter.ts`, `genome/fixGenome.ts`, `vendorgraph/vendorGraph.ts` | No Prisma, no Next, no `server-only`, no AI. Takes already-loaded plain data, returns plain data + escaped HTML. Exhaustively unit-tested. |
| **(b) `server-only` loader** | `defense/loadDefenseFileData.ts`, `triage/loadTriageData.ts`, `vault/proofEngine.ts`, `genome/recordOutcome.ts`, `vendorgraph/recordObservations.ts` | Thin. Fetches/writes via Prisma and feeds the pure core. Recorders are **best-effort** and never throw. |
| **(c) Thin route handler** | `sites/[siteId]/defense-file`, `sites/[siteId]/demand-letter`, `genome/recommend`, `vendor-graph`, `vault/[proofId]/verify` | Auth (`assertSiteAccess`/`assertScanAccess`) + `?format=html\|json` negotiation. No business logic. |

**Cross-tenant aggregation (Fix Genome, VALG).** Unlike the per-workspace evidence
engines, the data-network engines aggregate **across tenants**. `genome/fixGenome.ts`
keys outcomes by `ruleId` + a normalized structural fingerprint (`computeFingerprint`)
and reports "for this barrier, this fix works X% of the time, median Y days," confidence-
rated by sample size. `vendorgraph/vendorGraph.ts` rolls per-`(scan, vendor)` observations
into a reach-weighted `liabilityScore` (a widget embedded on many sites outranks a riskier
one seen once) with regression-over-time detection. Both expose a `scope=global|workspace`
toggle on their routes.

**Best-effort recording.** `recordFixOutcome` (wired into `verifyViolationFix`) and
`recordVendorObservations` (wired into `/api/vendor-risk`) write every outcome — success
**and** failure — but wrap the write in a try/catch that swallows errors. This is why their
backing tables (`fix_outcomes`, `vendor_observations`) could ship before their migrations
applied without risking the primary flow.

**i18n parity.** Every user-facing string exists in all 7 locale files; a parity test
enforces this in CI.

---

## Data Model

- **Prisma models:** 34 · **enums:** 10 (Neon Postgres, fully in sync as of 2026-06-15)

Models added since the last revision:

| Model | Table | Purpose | Migration |
|-------|-------|---------|-----------|
| `Monitor` | `monitors` | Continuous monitoring schedules (#164) | applied |
| `CrawlJobRecord` | `crawl_jobs` | Real-discovery crawl jobs (#164) | applied |
| `RumEventRecord` | `rum_events` | Real User Monitoring events (#164) | applied |
| `FixOutcomeRecord` | `fix_outcomes` | Fix Genome: re-scan-verified fix outcomes, cross-tenant (#169) | applied |
| `VendorObservation` | `vendor_observations` | VALG: per-`(scan, vendor)` liability observations (#170) | applied |

`ComplianceProof` gained `prevHash` / `chainIndex` / `anchoredAt` / `anchorProof` and a
`@@unique([workspaceId, chainIndex])` constraint, turning the forgeable in-row checksum
into a tamper-evident, independently-verifiable Anchored Evidence Chain. `issueProof`
appends to the per-workspace chain with a P2002 retry to resolve concurrent-issuance races.

---

## Testing

- **301 tests** passing across **18 vitest suites**. The PURE cores (`chain.ts`,
  `defenseFile.ts`, `demandLetter.ts`, `fixGenome.ts`, `vendorGraph.ts`) carry the bulk of
  the coverage precisely because they are framework-free and deterministic. An i18n parity
  test ensures every user-facing string exists in all 7 locale files.

---

## Environment Configuration

| Variable | Required | Purpose |
|----------|----------|---------|
| `NEXTAUTH_URL` | Yes | App base URL |
| `NEXTAUTH_SECRET` | Yes (prod) | JWT signing secret |
| `DATABASE_URL` | Yes | Neon PostgreSQL connection string |
| `OPENAI_API_KEY` | No | Enables AI explanations + fix suggestions |
| `GOOGLE_CLIENT_ID` | No | Enables Google OAuth |
| `GOOGLE_CLIENT_SECRET` | No | Enables Google OAuth |
| `SMTP_HOST` | No | Email notification SMTP server |
| `SMTP_USER` | No | Email sender address |
| `SMTP_PASS` | No | Email SMTP password |
| `SENTRY_DSN` | No | Error tracking |
| `SENTRY_AUTH_TOKEN` | No | Sentry source maps upload |
| `OPENTIMESTAMPS_URL` | No | External proof-hash anchoring endpoint; unset = no-op (chain works without it, no third-party anchoring claimed) |

---

## Deployment

- **Platform:** Vercel (auto-deploy from GitHub)
- **Database:** Neon PostgreSQL (serverless, connection pooling)
- **Functions:** 60s timeout, 1024MB memory for scan routes
- **External Packages:** @sparticuz/chromium, playwright, puppeteer-core, jsdom
- **Chromium Binary:** Included via `outputFileTracingIncludes` + `vercel.json includeFiles`
- **Error Tracking:** Sentry (edge, server, client instrumentation)
- **CI/CD:** GitHub Actions (lint → build → test → security audit)
