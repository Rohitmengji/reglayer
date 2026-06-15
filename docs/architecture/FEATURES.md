# RegLayer — Feature Inventory (v1.0.0)

## Platform Overview

RegLayer is an enterprise accessibility compliance operating system. It combines automated scanning, AI-powered remediation, real-time monitoring, and regulatory intelligence into a single platform for digital accessibility governance.

---

## Shipped Features

### 1. Accessibility Scanning Engine
- **Single-page scan:** axe-core 4.11 powered WCAG 2.1 analysis
- **Multi-page crawl:** BFS crawler with configurable depth/concurrency
- **Async scanning:** Non-blocking job queue with polling
- **Dual-environment browser:** Playwright (local) / puppeteer-core (serverless)
- **Screenshot evidence:** Full-page capture at 1280×720
- **User Journey Flow Scanning:** Playwright-based multi-step flow execution with focus, keyboard trap, live region, heading, and landmark monitoring
- **Design System Scanner:** Storybook integration — scan components individually, detect hotspots across design systems

### 2. Compliance Intelligence
- **WCAG 2.1 AA mapping:** Full criteria database (50 success criteria)
- **European Accessibility Act (EAA):** Rules aligned to EN 301 549
- **Section 508:** US Federal accessibility standard support
- **Compliance scoring:** 0-100 weighted score based on severity
- **Severity classification:** Critical / Serious / Moderate / Minor
- **Per-criterion results:** Pass/Fail per WCAG success criterion
- **VPAT/ACR Generator:** Auto-generated Voluntary Product Accessibility Conformance Reports with 50+ axe rule-to-WCAG mappings, output in JSON/Markdown/HTML

### 3. AI-Powered Intelligence (GPT-4o-mini)
- **Violation explainer:** Plain-language description + fix suggestion
- **Compliance summary:** Executive report with prioritized recommendations
- **CI Fix Suggestions:** AI-generated code fixes posted as GitHub PR review comments
- **Graceful degradation:** Works without API key (AI features disabled)

### 4. Auto-Remediation
- **Server-side engine:** jsdom-based DOM transform pipeline
- **Fix categories:** lang attribute, skip-links, landmarks, alt-text, form-labels, button-labels, focus-order
- **Drop-in script:** <2KB vanilla JS snippet for instant client-side fixes
- **Proxy mode:** Fetch URL → apply fixes → return patched HTML
- **Analytics beacon:** Track fix counts per page

### 5. Real User Monitoring (RUM)
- **Production snippet:** ~3KB JS detecting live accessibility barriers
- **9 barrier types:** Focus traps, keyboard nav failures, missing labels, low contrast, missing alt, ARIA errors, screen reader issues, small touch targets, motion violations
- **Event aggregation:** Impact scoring, device breakdown, top pages/selectors
- **Assistive tech detection:** NVDA, JAWS, VoiceOver, TalkBack identification

### 6. CI/CD Integration
- **CI Gatekeeper:** POST /api/gate/review — scan, generate AI fixes, post GitHub PR review
- **GitHub Action Generator:** Ready-to-use workflow YAML (gate + review modes)
- **Inline fix suggestions:** One-click apply from PR review UI
- **Deployment triggers:** Auto-scan on Vercel/Netlify deploy via deployment_status events

### 7. Revenue Impact Analytics
- **Revenue loss calculator:** Quantifies dollar cost per violation using disability prevalence data
- **Regional data:** WHO (16% global), CDC (26% US), UK, EU, AU, CA
- **Household multiplier:** 2.3x influence factor from Purple Pound research
- **Legal risk assessment:** Lawsuit probability and litigation cost estimates
- **Per-severity breakdown:** Cost attributed to critical/serious/moderate/minor issues

### 8. Reporting & Exports
- **PDF export:** Multi-page professional compliance report with branding
- **Accessibility Statement:** WCAG-compliant statement generator
- **Compliance Certificates:** Shareable achievement badges
- **Scan Comparison:** Side-by-side diff between any two scans
- **VPAT/ACR:** Print-ready HTML with professional styling

### 9. Notifications & Integrations
- **Email:** Gmail SMTP (scan complete, new violations, weekly digest, compliance alerts)
- **Slack:** Rich Block Kit messages to channels
- **Webhooks:** Custom HTTP endpoints for scan events
- **GitHub:** PR review integration, issue creation
- **Dispatcher:** Automatic notifications after each scan to all connected integrations

### 10. Scheduled Monitoring
- **Cron schedules:** Recurring scans with custom frequency
- **Alert rules:** Score threshold, score drop, new critical, new violations
- **Multi-channel alerts:** Webhook + email notification on trigger
- **CRUD management:** Create, enable/disable, delete, manual trigger

### 11. Team & Workspace
- **Multi-tenant workspaces:** Auto-created per user, org-level container
- **Roles:** Owner → Admin → Member → Viewer (RBAC enforced)
- **Team management:** Email invites, role assignment, member removal
- **Plan-based limits:** Team size, scan quotas, feature access per tier
- **Audit log:** Full action trail with actor, timestamp, workspace scoping
- **API keys:** Hashed storage (SHA-256), per-user scoped, timing-safe comparison

### 12. Authentication & Security
- **Google OAuth:** SSO via next-auth
- **Credentials auth:** Email/password with bcrypt hashing
- **JWT sessions:** 24-hour expiry, stateless
- **Proxy middleware:** Route-level auth gate with security headers
- **IDOR protection:** Workspace ownership verification on all data endpoints
- **Input validation:** Zod schemas on all mutation boundaries
- **Security headers:** CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy
- **SSRF protection:** URL validation on all server-side fetch operations

### 13. Dashboard & UI
- **Landing page:** Marketing page with feature showcase
- **Dashboard:** Stats overview (total scans, avg score, trends, recent)
- **Analytics:** Trend charts, score distribution, violation frequency
- **Automation section:** Remediation, Revenue Impact, VPAT, Journey, RUM, Design System
- **Dark mode:** Full dark theme support
- **Responsive:** Mobile-friendly layout
- **Sidebar navigation:** Organized sections (Main, Analysis, Automation, Manage, Admin)

### 14. Infrastructure
- **Vercel deployment:** Auto-deploy from GitHub push
- **Neon Postgres:** Serverless database with Prisma 7 driver adapter
- **Sentry:** Error tracking (edge + server + client configs)
- **Database indexes:** Optimized queries on all hot paths
- **Plan gating:** Feature access controlled by workspace plan tier

### 15. Lawsuit Risk Score Engine
- **Predictive legal liability:** 0–100 score based on 2025 ADA filing patterns
- **6 high-litigation violations:** Weighted model (image-alt, label, color-contrast, link-name, keyboard, form-labels)
- **Industry multipliers:** E-commerce 1.8×, restaurant 1.7×, healthcare 1.6×, etc.
- **Geography multipliers:** NY 1.9×, FL 1.7×, CA 1.6×, EU 1.8×
- **Financial exposure estimate:** Dollar liability per violation pattern
- **Risk tiers:** LOW / MODERATE / HIGH / CRITICAL with color-coded badges
- **Executive narrative:** Plain-English explanation for non-technical stakeholders
- **Legal disclaimer:** Non-dismissable notice on all risk displays

### 16. Compliance Proof Vault — Anchored Evidence Chain
- **Merkle-style hash chain:** Each proof's SHA-256 hash covers its canonical evidence **plus** the previous proof's hash, its `chainIndex`, and its `issuedAt` — so tampering with one proof breaks that proof's own hash, and reordering or back-dating breaks the `prevHash` of every later proof
- **Independently verifiable:** Pure, framework-free core (`src/lib/vault/chain.ts`) — `canonicalize` (recursive key-sorted JSON), `computeProofHash`, `verifyProofIntegrity`, `verifyChain` — runnable by any third party from the proof data alone, with no trust in RegLayer
- **Detected integrity problems:** hash-mismatch, broken-link, index-gap, duplicate-index (`ChainVerificationReport` reports `valid`, `length`, `brokenAt`, `issues[]`)
- **Append engine (`proofEngine.ts`):** `issueProof` appends to a per-workspace chain with `prevHash` + `chainIndex` and a P2002 retry loop for concurrent-issuance contention; `verifyProof` (own hash + chain up to the proof), `verifyWorkspaceChain` (whole chain)
- **Schema:** `ComplianceProof` gained `prevHash`, `chainIndex`, `anchoredAt`, `anchorProof` + `@@unique([workspaceId, chainIndex])`
- **Public, login-free verification:** Page `src/app/verify/[proofId]/page.tsx` + `GET /api/vault/[proofId]/verify` return only non-sensitive integrity fields (never the full evidence payload) so auditors, regulators, or customers can confirm tamper-evidence without an account
- **External anchoring stub:** Best-effort `anchorProofHash` (no-op unless `OPENTIMESTAMPS_URL` is configured) — no third-party timestamp anchoring is claimed today
- **Turns a forgeable self-checksum into court-grade evidence:** a checksum stored in the same row as its evidence is trivially recomputable; the chain makes the whole proof set tamper-evident
- **Automated recording:** Proofs issued after qualifying scans; revocation supported (`revokeProof`)

### 17. CI/CD Regression Guard
- **Guard policies:** Per-site threshold configuration
- **Deploy blocking:** Exit code 1 on critical violations or score regression
- **GitHub integration:** PR comments with violation summary and fix suggestions
- **CLI support:** `reglayer check --url --threshold --block-on-critical`
- **Baseline comparison:** Detect new violations introduced in a PR

### 18. Regulation Deadline Intelligence
- **7 regulations seeded:** EAA, ADA Title II/III, HHS Section 504, Section 508, AODA, EN 301 549
- **Obligation engine:** Auto-maps regulations to your industry + geography
- **Countdown timers:** Days remaining to each applicable deadline
- **Urgency classification:** CRITICAL (<30d), HIGH (30–90d), MEDIUM (90–180d), LOW (180d+)
- **Compliance gap count:** Violations failing each regulation's required criteria

### 19. White-Label Agency Platform
- **Full rebranding:** Custom domain, logo, colors, favicon, brand name
- **Client management:** Add/remove clients, each with isolated workspace
- **Agency API keys:** Programmatic access with SHA-256 hashed storage
- **Plans:** STARTER (10 clients), PROFESSIONAL (50, full white-label), ENTERPRISE (unlimited)
- **Branded emails:** Agency logo + colors in all transactional emails
- **Revenue share model:** Configurable platform fee percentage

### 20. Human Testing Network
- **Validator profiles:** Disability types, assistive tech, OS, browser
- **Test requests:** Specify URL, user journeys, required AT, budget
- **Matching engine:** Auto-match validators by AT + disability + availability
- **Payment tracking:** Budget hold, per-validator payment, platform fee (30%)
- **Session management:** Assigned → Started → Submitted → Approved flow
- **Quality ratings:** 1–5 client ratings per session

### 21. Notification System
- **In-app bell:** Unread count badge + dropdown in header
- **Notification types:** Scan complete, new violations, weekly digest, compliance alerts
- **Read/unread management:** Mark individual or all as read
- **Preferences:** Per-type opt-in/out for email + in-app channels
- **Weekly digest cron:** Scheduled summary of compliance status

### 22. Onboarding UX
- **Role-based personalization:** Developer / Designer / Legal / Executive personas
- **Getting started checklist:** 5-step widget (add site, scan, invite, connect CI, fix)
- **Server-side state:** Persona + dismissal persisted to DB (cross-device)
- **Smart visibility:** Hides for returning users (≥5 scans or dismissed)
- **Confetti celebration:** On checklist completion

### 23. Blog CMS
- **Admin editor:** Rich text editing with version history
- **AI generation:** GPT-powered article drafts
- **Article states:** DRAFT → PUBLISHED → ARCHIVED
- **SEO:** Meta tags, structured data, sitemap integration

### 24. Litigation Defense File
- **One-click good-faith dossier:** Assembles a chronological, hash-verified record of an *ongoing remediation effort* from data RegLayer already records — no new data captured, no migration
- **Five chronological sources:** Completed scans **and** failed scan attempts (failures still evidence effort), per-violation status transitions (from the AuditLog), re-scan fix verifications, and the Anchored Evidence Chain proof ledger (each proof independently re-verified via the chain's own `verifyProofIntegrity`)
- **Good-faith metrics:** Monitoring span, % verified-fixed, mean/median time-to-remediate, accessibility-score trend, and chain integrity
- **Honest framing (no over-claiming in a legal document):** revoked/expired proofs are reported as lifecycle states, **not** tampering; an empty chain is "empty", never "verified"; no third-party timestamp anchoring is claimed; status history is framed as a "record of activity", not an exhaustive audit trail
- **Pure core + thin loader + thin route:** `src/lib/defense/defenseFile.ts` (`assembleDefenseFile`, `buildTimeline`, `computeGoodFaithMetrics`, `verifyProofsLocally`, `renderDefenseFileHTML`, `escapeHtml`), `loadDefenseFileData.ts` (server loader), `GET`/`POST /api/sites/[siteId]/defense-file?format=html|json` (IDOR-safe via `assertSiteAccess` on **both** verbs)
- **Output:** Fully `escapeHtml`-escaped, self-contained, print-ready HTML; one-click button on `RiskBreakdownCard`

### 25. Demand-Letter Triage & Exposure-Delta Engine
- **Adversarial claim rebuttal:** Paste an ADA demand letter (or supply a manual claims array) and each alleged claim is mapped onto the site's recorded scan/violation/proof history
- **Per-claim verdicts:** `never_detected`, `not_present_on_date`, `remediated`, `present_open`, `rule_unrecognized`, `no_scan_history` — each with an evidence-grounded finding line
- **Dollar exposure-delta:** Gross alleged exposure vs. net genuinely-open exposure vs. exposure the recorded evidence rebuts — with claims corroborated by tamper-evident proofs flagged
- **Injected dollar model keeps the core pure:** `src/lib/triage/demandLetter.ts` (`assessClaims`, `renderTriageHTML`) never imports the server-only `legalRiskEngine`; the route builds the `ExposureModel` from `LITIGATION_WEIGHTS` / `INDUSTRY_MULTIPLIERS` / `GEO_MULTIPLIERS`
- **AI letter parsing:** `parseDemandLetter.ts` (gpt-4o-mini, zod-validated, graceful null when no key); `loadTriageData.ts` server loader; `POST /api/sites/[siteId]/demand-letter` (`assertSiteAccess`, html|json); page `src/app/demand-letter/page.tsx`
- **Stateless:** No migration, no mutation — read-only over existing history

### 26. Fix Genome
- **Learns which fix actually worked:** Records every re-scan-verified remediation outcome — success **and** failure — keyed by `ruleId` + a normalized structural fingerprint, wired into `verifyViolationFix` (`src/lib/violations/status.ts`)
- **Cross-tenant network effect:** Aggregates anonymized outcome counts across all tenants → "for this barrier, this fix works X% of the time, median Y days to take effect"
- **Confidence-rated:** Confidence (`high` ≥10 / `medium` ≥4 / `low` ≥1 / `insufficient`) is grounded in sample size, so a 100%-of-1 result is never dressed up as certainty
- **Pure core:** `src/lib/genome/fixGenome.ts` (`normalizeSelector`, `computeFingerprint`, `aggregateOutcomes`, `recommendForRule`); best-effort recorder `recordOutcome.ts` never throws
- **API:** `GET /api/genome/recommend?ruleId=&scope=global|workspace&by=rule|fingerprint` — `global` returns only anonymized success rates, never tenant data; returns an empty genome (not a 500) if the migration is pending
- **Schema:** New model `FixOutcomeRecord` (`fix_outcomes`) — migration applied

### 27. Vendor Accessibility Liability Graph (VALG)
- **Scores every third-party widget:** Intercom, OneTrust, Stripe, YouTube, etc. — by the real a11y liability it injects across **all** embedding sites
- **Reach-weighted liability score:** `computeLiabilityScore` scales per-instance risk by cross-site reach (`reachMultiplier = 1 + log10(sitesAffected)·0.5`, capped at 100) — a mediocre-risk widget embedded everywhere outranks a high-risk one seen once
- **Regression-over-time detection:** `detectVendorTrend` splits observations into prior vs. recent periods and flags `regressed` / `improved` / `stable` against a 10-point threshold
- **Pure core:** `src/lib/vendorgraph/vendorGraph.ts` (`aggregateVendorObservations`, `computeLiabilityScore`, `detectVendorTrend`); best-effort recorder `recordObservations.ts` wired into `/api/vendor-risk` (which **also** gained `assertScanAccess`, closing a cross-tenant IDOR)
- **API:** `GET /api/vendor-graph?vendor=&scope=global|workspace&splitDays=` — no `vendor` returns the cross-tenant ranking; with `vendor` adds a regression trend
- **Schema:** New model `VendorObservation` (`vendor_observations`) — migration applied

### 28. Security-by-Construction
- **One shared ownership helper:** `src/lib/auth/access.ts` — `assertScanAccess(scanId, session)` / `assertSiteAccess(siteId, session)` return a discriminated `AccessResult` (`{ok:true,userId,isMasterAdmin,workspaceId}` | `{ok:false,status:401|403|404,error}`)
- **Consistent policy:** Master-admin bypass, else workspace-membership (or legacy `userId` ownership for workspace-less scans)
- **Used across:** vault, vpat, statement, risk, score, simulate, and the new defense-file / demand-letter / vendor-risk routes
- **Closed findings:** Proof-forgery (C-3) and IDOR (S-3)

---

## Technical Metrics

| Metric | Value |
|--------|-------|
| Total source files | ~200+ |
| API endpoints | 116 |
| UI pages | 72 |
| Components | 50+ |
| Dependencies | 55+ |
| Test files | 18 |
| Tests passing | 301 |
| Prisma models | 34 |
| Prisma enums | 10 |
| i18n languages | 7 |
| Scan duration (avg) | 6-18s |
| Journey scan duration | 30-90s |
| PDF size (avg) | ~17KB |
| RUM snippet size | ~3KB |
| Remediation script | ~2KB |
| Vercel function timeout | 60s |
| Vercel function memory | 1024MB |

---

## API Surface

| Endpoint | Method | Auth | Plan | Description |
|----------|--------|------|------|-------------|
| /api/scan | POST | Session | Free+ | Single-page accessibility scan |
| /api/scan/async | POST/GET | Session | Free+ | Async scan with polling |
| /api/scan/crawl | POST | Session | Pro+ | Multi-page crawl scan |
| /api/gate/review | POST | API Key | Pro+ | CI pipeline gatekeeper with PR review |
| /api/remediate | POST/GET | Session | Pro+ | Server-side remediation |
| /api/remediate/script | GET | Public | — | Embeddable fix script |
| /api/revenue-impact | POST/GET | Session | Free+ | Revenue loss calculator |
| /api/compliance/vpat | POST/GET | Session | Pro+ | VPAT/ACR generation |
| /api/vault/[proofId]/verify | GET/POST | Public | — | Independent proof integrity verification (non-sensitive fields only) |
| /api/sites/[siteId]/defense-file | GET/POST | Session | Pro+ | Litigation Defense File (?format=html\|json, IDOR-safe on both verbs) |
| /api/sites/[siteId]/demand-letter | POST | Session | Pro+ | Demand-letter triage & exposure-delta (letterText or claims[], html\|json) |
| /api/genome/recommend | GET | Session | Free+ | Fix Genome recommendation (?ruleId=&scope=global\|workspace&by=rule\|fingerprint) |
| /api/vendor-graph | GET | Session | Free+ | Vendor Accessibility Liability Graph (?vendor=&scope=global\|workspace&splitDays=) |
| /api/journey | GET/POST | Session | Pro+ | Journey flow scanner |
| /api/rum/snippet | GET | Public | — | RUM JavaScript snippet |
| /api/rum/events | POST/GET | API Key/Session | Free+ | RUM event collection |
| /api/design-system/scan | POST/GET | Session | Pro+ | Design system scanner |
| /api/scans | GET | Session | Free+ | List user's scans |
| /api/scans/[id] | GET/DELETE | Session | Free+ | Scan detail (workspace-scoped) |
| /api/monitors | GET/POST | Session | Free+ | Monitoring rules CRUD |
| /api/webhooks | GET/POST/DELETE | Session | Free+ | Webhook management |
| /api/team | GET/POST/PATCH/DELETE | Session | Free+ | Team management |
| /api/keys | GET/POST/DELETE | Session | Free+ | API key management |
| /api/integrations/* | Various | Session | Pro+ | Slack, GitHub, Jira, Teams |
| /api/notifications | GET/PATCH | Session | Free+ | Notification preferences |
| /api/admin | GET/POST | Master Admin | — | Admin panel operations |
| /api/badge | GET | Public | — | Compliance badge SVG |
| /api/health | GET | Public | — | Health check |
