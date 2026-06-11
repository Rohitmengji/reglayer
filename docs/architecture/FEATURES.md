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

### 16. Compliance Proof Vault
- **Cryptographic timestamping:** SHA-256 hash chains for tamper-evident records
- **Event types:** Scan completed, violation detected, status changed, report generated, vault exported
- **Chain verification:** Recalculate all hashes to detect tampering
- **PDF export:** Court-admissible compliance evidence with chain of custody
- **Automated recording:** Events captured after every scan and violation status change

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

---

## Technical Metrics

| Metric | Value |
|--------|-------|
| Total source files | ~200+ |
| API endpoints | 107 |
| UI pages | 70 |
| Components | 50+ |
| Dependencies | 55+ |
| Test files | 15 |
| Tests passing | 198 |
| Prisma models | 29 |
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
