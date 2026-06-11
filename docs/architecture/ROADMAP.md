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
- Full REST API (107 routes) with Zod validation
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

## Phase 6: Revenue & Growth (NEXT)

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
15 test files      →        E2E Playwright suite + 80%+ coverage
Console logging    →        Structured JSON + correlation IDs
```
