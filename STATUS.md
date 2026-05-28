# RegLayer — Project Status

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
│   ├── api/               # 30+ REST API endpoints
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
│   ├── database/          # Prisma client & helpers
│   ├── email/             # Nodemailer SMTP service
│   └── auth/              # NextAuth config
├── services/              # Business logic (scan orchestration)
└── stores/                # Zustand client-side state
```

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
| RUM/Design System storage | In-memory per-instance | Needs persistent store (Redis/ClickHouse) |

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
