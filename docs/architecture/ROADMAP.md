# RegLayer — Platform Roadmap

## Strategic Vision

RegLayer evolves from a scan tool into the **compliance operating system** for European digital businesses. The platform should feel like Datadog meets Stripe — developer-first infrastructure that compliance teams actually want to use.

---

## Phase 2: Foundation (Next Sprint)

These are the features that turn a "tool" into a "platform."

### 2.1 — Multi-Tenant Workspaces & Teams
**Why:** No enterprise tool works without organizations.
- Workspace creation (org-level container)
- Team invitations (email invite flow)
- Role-based access: Owner → Admin → Member → Viewer
- Per-workspace scan history, schedules, and settings
- Workspace billing meter (scan count tracking)

### 2.2 — Persistent Database (PostgreSQL + Prisma)
**Why:** localStorage doesn't scale. Real compliance needs audit trails.
- Prisma ORM with PostgreSQL (Neon/Supabase serverless)
- Tables: users, workspaces, scans, violations, schedules, audit_log
- Full scan history queryable by date, score, URL, status
- Audit trail: who scanned what, when, what changed

### 2.3 — Scan Comparison & Regression Detection
**Why:** Compliance isn't a one-time check. It's continuous.
- Compare current scan vs. previous scan for same URL
- Highlight: new violations, resolved violations, score delta
- Regression alerts: "3 new critical issues since last scan"
- Visual diff of violation lists

### 2.4 — Webhook & CI/CD Integration
**Why:** Developers live in CI pipelines, not dashboards.
- GitHub Action: scan on PR, block merge if score drops
- Webhook notifications (Slack, Teams, email)
- API key auth for programmatic access
- `reglayer scan --url https://... --threshold 85` CLI concept

---

## Phase 3: Intelligence Layer

### 3.1 — Compliance Dashboard (Executive View)
**Why:** CTOs and compliance officers need portfolio-level visibility.
- Organization-wide compliance posture score
- Heat map: which properties are at risk
- Trend lines across all monitored sites
- Exportable board-level compliance summary
- SLA tracking: "95% of properties above 80 score"

### 3.2 — Remediation Workflow
**Why:** Finding issues is 10% of the work. Fixing them is 90%.
- Auto-generate Jira/Linear tickets from violations
- Assign violations to team members
- Track fix status: Open → In Progress → Verified → Closed
- Re-scan to verify fix (one-click revalidation)
- Priority queue: fix the highest-impact issues first

### 3.3 — Custom Compliance Policies
**Why:** Every org has unique requirements beyond WCAG.
- Policy builder: define custom rules (e.g., "all images must have alt text > 10 chars")
- Policy templates: WCAG 2.1 AA, EAA, Section 508, AODA
- Compliance scoring weights per policy
- Exception management: mark "accepted risk" violations

### 3.4 — Real User Monitoring (RUM) for Accessibility
**Why:** Automated scans miss runtime issues.
- Lightweight JS snippet for production sites
- Detect: focus traps, keyboard navigation failures, screen reader issues
- Real session data: which users hit accessibility barriers
- Correlation: scan violations vs. actual user impact

---

## Phase 4: Scale & Enterprise

### 4.1 — Multi-Region Scanning Infrastructure
**Why:** Sites render differently by geography.
- Scan from US, EU, APAC regions
- Detect geo-specific content/accessibility differences
- CDN-aware: test what users actually see
- Parallel execution across regions

### 4.2 — Authenticated Scanning
**Why:** Most enterprise apps are behind login walls.
- Cookie-based auth injection for scans
- OAuth flow recording (scan as authenticated user)
- Form-fill automation for gated content
- Session management across multi-page crawls

### 4.3 — Design System Compliance
**Why:** Fix at the component level, not the page level.
- Scan Storybook/Chromatic instances
- Map violations back to design system components
- "This violation appears in Button variant X, used on 47 pages"
- Component-level compliance scoring

### 4.4 — API-First Platform
**Why:** Enterprise customers embed compliance into their own tools.
- Full REST API with OpenAPI spec
- SDKs: Node.js, Python, Go
- Rate limiting, usage metering, API key management
- Billing integration (Stripe)

---

## Phase 5: Market Differentiation

### 5.1 — Regulatory Intelligence Feed
- Track EU regulatory changes (EAA amendments, new directives)
- Auto-update compliance rules when regulations change
- Notification: "New regulation affects 12 of your properties"
- Country-specific compliance requirements

### 5.2 — Accessibility Testing Marketplace
- Manual audit booking (connect with certified auditors)
- Assistive technology testing (screen reader, voice control)
- User testing with people with disabilities
- Combined automated + manual compliance score

### 5.3 — Compliance Certification
- "RegLayer Certified" badge for websites
- Public compliance status page (like status.io for accessibility)
- Continuous verification (badge revoked if score drops)
- Trust signal for customers/regulators

---

## Implementation Priority (Next 5 Features to Build)

| # | Feature | Impact | Effort | Why Now |
|---|---------|--------|--------|---------|
| 1 | **PostgreSQL + Prisma** | Critical | Medium | Everything else depends on persistent data |
| 2 | **Multi-tenant workspaces** | Critical | Medium | Platform identity — orgs, teams, roles |
| 3 | **Scan comparison & regression** | High | Low | Massive value with minimal code — diff two scans |
| 4 | **Webhook notifications** | High | Low | Slack/email alerts when scores drop |
| 5 | **GitHub Action / CI gate** | High | Medium | Developer adoption driver — scan on every PR |

---

## Architecture Evolution

```
Current (V1):              Target (V2):
─────────────             ─────────────
In-memory queue    →      Redis + BullMQ (persistent jobs)
localStorage       →      PostgreSQL + Prisma (server-side)
Single user        →      Multi-tenant workspaces
Manual scans       →      CI/CD triggered + scheduled
PDF only           →      PDF + Jira + Slack + API
Demo auth          →      Google/GitHub/SAML SSO
Vercel only        →      Vercel + dedicated scan workers
```
