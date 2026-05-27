# RegLayer — Project Status

## Completed Features (Production-Ready)

### Core Scanning
- **URL Scanning** — Axe-core powered accessibility analysis with WCAG 2.1 AA rules
- **Score Calculation** — Weighted scoring (0-100) based on violation severity
- **Violation Detection** — Critical/Serious/Moderate/Minor categorization
- **EN 301 549** — European standard compliance rules integrated
- **Site Crawling** — Multi-page crawl with depth/concurrency controls

### Compliance & Reporting
- **WCAG Compliance Matrix** — Visual grid of all WCAG 2.1 AA criteria (pass/fail/not-tested) with progress gauge
- **PDF Reports** — Exportable scan reports with branding
- **Accessibility Statement Generator** — WCAG-compliant statement output
- **Compliance Certificates** — Shareable achievement certificates
- **Scan Comparison** — Side-by-side diff between two scans

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

### Deployment
- **Vercel** — Auto-deploy from GitHub (https://reglayer.vercel.app)
- **Neon Postgres** — Serverless database with Prisma 7 driver adapter
- **Environment Config** — Secure env var management

---

## Architecture

```
src/
├── app/                    # Next.js 16 App Router pages & API routes
│   ├── api/               # REST API endpoints
│   ├── dashboard/         # Main dashboard with scan form
│   ├── scans/             # Scan history & detail views
│   ├── compliance/        # WCAG compliance matrix
│   ├── analytics/         # Trend analytics
│   ├── integrations/      # Slack/Jira/GitHub/Teams connections
│   ├── notifications/     # Email notification preferences
│   ├── team/              # Workspace member management
│   └── ...
├── components/            # Reusable UI components
├── lib/                   # Core libraries
│   ├── scanner/           # Axe-core scanning engine & pipeline
│   ├── compliance/        # Policy evaluator & WCAG rules
│   ├── database/          # Prisma client & helpers
│   ├── email/             # Nodemailer SMTP service
│   ├── integrations/      # Slack/webhook dispatchers
│   ├── intelligence/      # AI & alert engines
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

---

## Roadmap (Suggested Next Steps)

### High Priority
1. **Stripe checkout** — Payment flow for Pro/Enterprise upgrades
2. **Jira/GitHub integration testing** — Verify issue creation with real tokens
3. **User settings page** — Profile editing, password change

### Medium Priority
4. **CSV/Excel export** — Violations data export
5. **Historical compliance tracking** — Store matrix snapshots, show trend over time
6. **Custom WCAG rule sets** — Let users enable/disable specific criteria
7. **Bulk scanning** — Upload list of URLs, process in batch

### Nice to Have
8. **Browser extension** — Scan current page from Chrome toolbar
9. **Slack bot commands** — `/reglayer scan https://example.com` slash command
10. **White-label reports** — Custom branding on PDFs/certificates
