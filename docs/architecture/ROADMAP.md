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

## ✅ Phase 4: Scale & Enterprise (PARTIALLY COMPLETE)

### 4.3 — Design System Compliance ✅
- Scan Storybook instances (stories.json / index.json)
- 8 component-level accessibility rules
- Hotspot detection (fix once → fix everywhere)
- Usage count tracking for impact prioritization
- Support for Storybook 6+ and 7+

### 4.1 — Multi-Region Scanning ⬜
- Scan from US, EU, APAC regions
- Detect geo-specific content/accessibility differences
- CDN-aware: test what users actually see

### 4.2 — Authenticated Scanning ⬜
- Cookie-based auth injection for scans
- OAuth flow recording (scan as authenticated user)
- Form-fill automation for gated content
- Session management across multi-page crawls

### 4.4 — API-First Platform ⬜
- Full REST API with OpenAPI spec
- SDKs: Node.js, Python, Go
- Usage metering and billing integration (Stripe)
- Rate limiting via Redis/Upstash

---

## Phase 5: Market Differentiation (NEXT)

### 5.1 — Custom Compliance Policies
- Policy builder: define custom rules
- Policy templates: WCAG 2.1, EAA, Section 508, AODA
- Compliance scoring weights per policy
- Exception management: mark "accepted risk" violations

### 5.2 — Executive Compliance Dashboard
- Portfolio-level compliance posture for CTOs
- Heat map: which properties are at risk
- SLA tracking: "95% of properties above 80 score"
- Board-level exportable compliance summary

### 5.3 — Regulatory Intelligence Feed
- Track EU regulatory changes (EAA amendments)
- Auto-update compliance rules when regulations change
- Country-specific compliance requirements
- Notification: "New regulation affects 12 of your properties"

### 5.4 — Compliance Certification
- "RegLayer Certified" badge for websites
- Public compliance status page
- Continuous verification (badge revoked if score drops)
- Trust signal for customers/regulators

### 5.5 — Accessibility Testing Marketplace
- Manual audit booking (connect with certified auditors)
- Assistive technology testing
- User testing with people with disabilities
- Combined automated + manual compliance score

---

## Implementation Priority (Next 5 Features)

| # | Feature | Impact | Effort | Why Now |
|---|---------|--------|--------|---------|
| 1 | **Stripe billing** | Critical | Medium | Revenue — users can't upgrade plans today |
| 2 | **Redis rate limiting** | Critical | Low | Current in-memory rate limits don't work on serverless |
| 3 | **Authenticated scanning** | High | Medium | Most enterprise apps are behind login walls |
| 4 | **OpenAPI spec + SDKs** | High | Medium | Developer adoption, partner integrations |
| 5 | **Custom policies** | High | Medium | Enterprise differentiation — every org has unique rules |

---

## Architecture Evolution

```
V1 (Shipped):                V2 (Target):
──────────────              ──────────────
In-memory queue    →        Redis + BullMQ (persistent jobs)
In-memory rate limit →      Upstash Redis (serverless rate limiting)
In-memory RUM store →       ClickHouse / Tinybird (event analytics)
Single region scan →        Multi-region (US/EU/APAC)
Manual plans       →        Stripe billing + usage metering
No API docs        →        OpenAPI 3.1 + auto-generated SDKs
12 test files      →        E2E Playwright suite + 80%+ coverage
Console logging    →        Structured JSON + correlation IDs
```
