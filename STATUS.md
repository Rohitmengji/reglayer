# RegLayer — Project Status

> **Status (2026-06-15):** Five strategic-moat features shipped — Anchored Evidence Chain (PR #165), Litigation Defense File (PR #166), Demand-Letter Triage & Exposure-Delta Engine (PR #168), Fix Genome (PR #169), and the Vendor Accessibility Liability Graph / VALG (PR #170). The live Neon database is fully in sync as of 2026-06-15 (all migrations — including `fix_outcomes` and `vendor_observations` — applied). Current metrics: **301 tests passing across 18 vitest suites**, **34 Prisma models / 10 enums**, **116 API route files**, **72 UI pages**.

## Completed Features (Production-Ready)

### Core Scanning
- **URL Scanning** — Axe-core powered accessibility analysis with WCAG 2.1 AA rules
- **Score Calculation** — Weighted scoring (0-100) based on violation severity
- **Violation Detection** — Critical/Serious/Moderate/Minor categorization
- **EN 301 549** — European standard compliance rules integrated
- **Site Crawling** — Multi-page crawl with depth/concurrency controls
- **User Journey Flow Scanning** — Playwright-based multi-step flow analysis (focus management, keyboard traps, live regions)

### Compliance & Reporting
- **WCAG Compliance Matrix** — Visual grid of all WCAG 2.1 AA criteria (pass/fail/not-tested) with progress gauge
- **PDF Reports** — Exportable scan reports with branding
- **Accessibility Statement Generator** — WCAG-compliant statement output
- **Compliance Certificates** — Shareable achievement certificates
- **Scan Comparison** — Side-by-side diff between two scans
- **VPAT/ACR Generator** — Auto-generated Voluntary Product Accessibility Conformance Reports (JSON/Markdown/HTML)

### Automation & Remediation
- **Auto-Remediation Engine** — jsdom-based server-side DOM transforms (lang, skip-links, landmarks, alt-text, form-labels, button-labels, focus-order)
- **Drop-in Script** — <2KB embeddable JS for instant client-side fixes
- **CI Gatekeeper** — POST /api/gate/review: scan → AI fixes → GitHub PR review with inline fix suggestions
- **GitHub Action Generator** — Ready-to-use workflow YAML (gate + review modes)
- **Revenue Impact Calculator** — Quantifies dollar cost of accessibility violations using disability prevalence data
- **Real User Monitoring (RUM)** — Production JS snippet detecting live accessibility barriers (focus traps, keyboard failures, ARIA errors, etc.)
- **Design System Compliance** — Scan Storybook instances for component-level a11y issues with hotspot detection

### Notifications & Integrations (Verified Working)
- **Email Notifications** — Gmail SMTP via Nodemailer (scan complete, new violations, weekly digest, compliance alerts)
- **Slack Integration** — Rich Block Kit messages to channels on scan completion
- **Notification Preferences** — Per-user toggle controls (email types)
- **Integration Dispatcher** — Automatic notifications after each scan to connected integrations
- **Webhooks** — Custom webhook endpoints for scan events

### Intelligence
- **AI Insights** — Violation explanations and fix suggestions (OpenAI-powered)
- **Priority Engine** — Smart ordering of fixes by impact/effort
- **Alert Engine** — Score threshold and new-critical detection rules

### Legal & Evidence Moat
- **Anchored Evidence Chain** (PR #165) — Compliance proofs are linked into a Merkle-style, per-workspace SHA-256 hash chain. Each proof's hash covers `evidence + prevHash + chainIndex + issuedAt`, so tampering with one proof breaks its own hash and reordering/back-dating breaks the `prevHash` of every later proof. `issueProof` appends with a P2002 retry against `@@unique([workspaceId, chainIndex])`; `verifyChain` detects hash-mismatch / broken-link / index-gap / duplicate-index. The pure core (`src/lib/vault/chain.ts`) is framework-free and independently runnable by an external auditor. **Public, login-free verification** at `/verify/[proofId]` + `GET /api/vault/[proofId]/verify`. Turns the previously forgeable in-row self-checksum into tamper-evident, independently verifiable evidence.
- **Litigation Defense File** (PR #166) — One click assembles a chronological, hash-verified "ongoing good-faith remediation effort" dossier from data already recorded: full scan time series (including FAILED attempts), per-violation status transitions (from the audit log), re-scan fix verifications, and the Anchored Evidence Chain proof ledger (each proof independently re-verified). Good-faith metrics: monitoring span, % verified-fixed, mean/median time-to-remediate, accessibility-score trend, chain integrity. Honest framing baked in — revoked/expired proofs are reported as lifecycle state (NOT tampering), an empty chain is "empty" (NOT "verified"), and no third-party timestamp anchoring is claimed. `GET`/`POST /api/sites/[siteId]/defense-file` (`?format=html|json`), IDOR-safe on both verbs; launched from the Risk Breakdown card. No migration.
- **Demand-Letter Triage & Exposure-Delta Engine** (PR #168) — Paste an ADA demand letter (parsed via gpt-4o-mini, zod-validated, graceful null) or a manual claims array, and each alleged claim is mapped onto the site's scan/violation/proof history with a per-claim verdict (`never_detected` / `not_present_on_date` / `remediated` / `present_open` / `rule_unrecognized` / `no_scan_history`) plus a dollar exposure-delta (gross alleged vs. net genuinely-open vs. rebutted). The dollar model (LITIGATION_WEIGHTS / INDUSTRY_MULTIPLIERS / GEO_MULTIPLIERS) is INJECTED so the core stays pure. `POST /api/sites/[siteId]/demand-letter` (`html|json`), page at `/demand-letter`. Stateless — no migration.

### Data-Network Moat
- **Fix Genome** (PR #169) — Records every fix outcome (success AND failure, keyed by `ruleId` + a normalized structural fingerprint) the moment a re-scan verifies it, then aggregates CROSS-TENANT into "for this barrier, this fix works X% of the time, median Y days," confidence-rated by sample size. Best-effort recorder wired into `verifyViolationFix`; query via `GET /api/genome/recommend?ruleId=&scope=global|workspace&by=rule|fingerprint`. New model `FixOutcomeRecord` (`fix_outcomes`) — migration applied.
- **Vendor Accessibility Liability Graph / VALG** (PR #170) — Scores every third-party widget (Intercom, OneTrust, Stripe, YouTube, …) by the real a11y liability it injects across ALL embedding sites, reach-weighted (a mediocre-risk widget embedded everywhere outranks a high-risk one seen once), with regression-over-time detection. Best-effort recorder wired into the vendor-risk scan path (which also gained `assertScanAccess`, closing a cross-tenant IDOR); query via `GET /api/vendor-graph?vendor=&scope=global|workspace&splitDays=`. New model `VendorObservation` (`vendor_observations`) — migration applied.

### Team & Workspace
- **Multi-tenant Workspaces** — Auto-created per user, membership roles (Owner/Admin/Member/Viewer)
- **Team Management** — Invite by email, role assignment, member removal
- **Audit Log** — Tracks workspace actions with actor/timestamp
- **API Keys** — Secure key generation (hashed storage), per-user scoped
- **RBAC** — Role-based access control on all sensitive endpoints

### Platform
- **Google OAuth** — Login via Google account
- **Dashboard** — Stats overview (total scans, avg score, trends, recent scans)
- **Analytics** — Trend charts, score distribution, violation frequency
- **Dark Mode** — Full dark theme support
- **Responsive** — Mobile-friendly layout
- **Monitoring** — Scheduled scan rules (cron-based)
- **Privacy Policy & Cookie Consent** — GDPR-compliant
- **Landing Page** — Marketing page with feature highlights
- **Pricing Page** — Tier comparison (Free/Pro/Enterprise)
- **Plan Gating** — Feature access based on workspace plan (Free/Pro/Enterprise)

### Security
- **IDOR Protection** — All data endpoints verify workspace ownership
- **Security-by-Construction** — One shared ownership helper (`src/lib/auth/access.ts`): `assertScanAccess(scanId, session)` / `assertSiteAccess(siteId, session)` return a discriminated `AccessResult` (`{ok:true,userId,isMasterAdmin,workspaceId}` | `{ok:false,status:401|403|404,error}`) — master-admin bypass, else workspace membership (or legacy userId). Used across vault/vpat/statement/risk/score/simulate plus the new defense-file / demand-letter / vendor-risk routes. Closed the proof-forgery (C-3) and IDOR (S-3) findings.
- **Input Validation** — Zod schemas on all mutation endpoints
- **Rate Limiting** — Applied on scan, crawl, AI, and heavy endpoints
- **SSRF Protection** — URL validation on all fetch operations
- **Security Headers** — CSP, HSTS, X-Frame-Options, Referrer-Policy via proxy
- **API Key Auth** — Hashed storage with SHA-256, timing-safe comparison

### Deployment
- **Vercel** — Auto-deploy from GitHub (https://reglayer.vercel.app)
- **Neon Postgres** — Serverless database with Prisma 7 driver adapter
- **Sentry** — Error tracking and performance monitoring
- **Environment Config** — Secure env var management

---

## Architecture

```
src/
├── app/                    # Next.js 16 App Router pages & API routes
│   ├── api/               # 116 REST API route files
│   │   ├── scan/          # Core scanning (single, async, crawl)
│   │   ├── gate/          # CI pipeline gatekeeper
│   │   ├── remediate/     # Auto-remediation (proxy, script, beacon)
│   │   ├── rum/           # Real User Monitoring (events, snippet)
│   │   ├── design-system/ # Design system scanner
│   │   ├── journey/       # User journey flow scanner
│   │   ├── revenue-impact/# Revenue loss calculator
│   │   ├── compliance/    # VPAT/ACR generation
│   │   └── ...            # Admin, team, webhooks, integrations
│   ├── dashboard/         # Main dashboard + automation pages
│   ├── scans/             # Scan history & detail views
│   ├── compliance/        # WCAG compliance matrix + VPAT
│   ├── analytics/         # Trend analytics
│   ├── integrations/      # Slack/Jira/GitHub/Teams connections
│   ├── notifications/     # Email notification preferences
│   ├── team/              # Workspace member management
│   └── ...
├── components/            # Reusable UI components
├── lib/                   # Core libraries
│   ├── scanner/           # Axe-core engine, journey scanner, design-system scanner
│   ├── compliance/        # Policy evaluator, WCAG rules, VPAT generator
│   ├── remediation/       # DOM transform engine
│   ├── rum/               # RUM event collector & aggregator
│   ├── analytics/         # Revenue impact calculator
│   ├── integrations/      # Slack, GitHub review, webhook dispatchers
│   ├── intelligence/      # AI, alert, priority engines
│   ├── vault/             # Anchored Evidence Chain (pure chain.ts + proofEngine)
│   ├── defense/           # Litigation Defense File (pure assembly + loader)
│   ├── triage/            # Demand-letter triage & exposure-delta (pure + AI parse + loader)
│   ├── genome/            # Fix Genome (pure aggregation + best-effort recorder)
│   ├── vendorgraph/       # Vendor Accessibility Liability Graph (pure + best-effort recorder)
│   ├── database/          # Prisma client & helpers
│   ├── email/             # Nodemailer SMTP service
│   └── auth/              # NextAuth config + access.ts ownership assertions
├── services/              # Business logic (scan orchestration)
└── stores/                # Zustand client-side state
```

### Feature Pattern (Anchored Evidence Chain, Defense File, Triage, Fix Genome, VALG)

Each new moat feature is built as three layers:
1. **Pure core** — no Prisma, no Next, no `"server-only"`; exhaustively unit-testable exactly like `vault/chain.ts`. Holds all legally/statistically load-bearing logic.
2. **Thin `"server-only"` data loader** — fetches plain data and hands it to the pure core.
3. **Thin route handler** — auth (`assertScanAccess`/`assertSiteAccess`) + format negotiation (`?format=html|json`).

All generated HTML is `escapeHtml`-escaped. Best-effort recorders (`recordFixOutcome` / `recordVendorObservations`) never throw, so a pending migration can't break the primary scan/verify flow. Every user-facing string exists in all 7 i18n locale files (a parity test enforces this in CI).

---

## Known Limitations

| Area | Status | Notes |
|------|--------|-------|
| Email delivery | Requires Gmail App Password | SMTP_PASS env var must be set |
| Jira/GitHub integrations | UI ready, not yet tested | Needs real API tokens to verify |
| Teams integration | UI ready, not yet tested | Needs webhook URL from Teams |
| Payment/Billing | Not implemented | Users can't upgrade plans (Stripe needed) |
| Multi-workspace switching | Not implemented | Users currently see only first workspace |
| Rate limiting on serverless | In-memory Map resets per cold start | Needs Redis/Upstash for production |
| RUM storage | Persisted to Postgres (`rum_events` / RumEventRecord) | Now durable across instances |
| Design System storage | In-memory per-instance | Needs persistent store (Redis/ClickHouse) |
| External timestamp anchoring | Not implemented (graceful no-op stub) | `OPENTIMESTAMPS_URL` hook present; chain integrity is self-contained SHA-256 only, no third-party anchor claimed |

---

## Roadmap (Suggested Next Steps)

### High Priority
1. **Stripe checkout** — Payment flow for Pro/Enterprise upgrades
2. **Redis rate limiting** — Upstash integration for production-grade rate limits
3. **Authenticated scanning** — Scan behind-login pages with session injection
4. **OpenAPI spec** — Full REST API documentation with auto-generated SDKs

### Medium Priority
5. **E2E tests** — Playwright test suite for critical flows
6. **Custom compliance policies** — Policy builder with custom rules
7. **Executive dashboard** — Portfolio-level compliance posture for CTOs
8. **CSV/Excel export** — Violations data export

### Nice to Have
9. **Compliance certification badge** — Public "RegLayer Certified" embeddable badge
10. **Browser extension** — Scan current page from Chrome toolbar
11. **White-label reports** — Custom branding on PDFs/certificates
