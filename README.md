# RegLayer

**The accessibility compliance operating system** — enterprise-grade WCAG scanning, lawsuit risk intelligence, automated remediation, and regulatory deadline tracking. Built for engineering teams, compliance officers, and accessibility agencies.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma)
![Tests](https://img.shields.io/badge/Tests-301_passing-brightgreen)
![License](https://img.shields.io/badge/License-MIT-green)

## Why RegLayer

Over 5,000 ADA lawsuits targeted websites in 2025 — a 37% surge. 94.8% of websites still fail basic WCAG checks. Overlay solutions are getting fined (accessiBe: $1M FTC fine). No tool provides the governance documentation courts require.

RegLayer is the first platform that combines automated scanning with **lawsuit risk scoring**, **cryptographic compliance proof**, and **regulation deadline intelligence** — turning accessibility from a developer checkbox into executive-level risk management.

---

## Platform Features

### Core Scanning Engine
| Feature | Description |
|---------|-------------|
| **Single-page Scan** | axe-core 4.11 + Playwright real-browser evaluation |
| **Multi-page Crawl** | BFS crawler with configurable depth/concurrency (up to 10 pages) |
| **Authenticated Scanning** | Scan behind login walls with stored credentials |
| **User Journey Testing** | Multi-step flow scanning (checkout, login, forms) |
| **Design System Scanner** | Scan Storybook components individually |
| **Screenshot Evidence** | Full-page capture at 1280×720 for visual proof |
| **Async Queue** | Non-blocking job processing with polling |
| **Scan Comparison** | Side-by-side diff between any two scans |

### Intelligence & Risk
| Feature | Description |
|---------|-------------|
| **Lawsuit Risk Score** | Predictive legal liability score (0–100) based on 2025 filing patterns |
| **Financial Exposure** | Estimated dollar exposure from violation profile |
| **Industry/Geography Multipliers** | Risk adjusted for your sector (e-commerce 1.8×) and state (NY 1.9×) |
| **Compliance Forecasting** | Predict future compliance trajectory |
| **Vendor Risk Scanner** | Third-party accessibility risk assessment |
| **Vendor Accessibility Liability Graph (VALG)** | Cross-tenant, reach-weighted liability score per third-party widget (Intercom, OneTrust, Stripe, YouTube, …) with regression-over-time detection |
| **Fix Genome** | Cross-tenant learning of which fix actually works (re-scan-verified), confidence-rated by sample size — "for this barrier, this fix works X% of the time, median Y days" |
| **AI Explanations** | GPT-4o-mini powered plain-language violation context |

### Compliance & Regulatory
| Feature | Description |
|---------|-------------|
| **WCAG 2.1 AA** | Full 50-criteria evaluation |
| **EAA (EN 301 549)** | European Accessibility Act compliance |
| **ADA Title II/III** | US federal accessibility standards |
| **Section 508** | Federal contractor requirements |
| **VPAT/ACR Generator** | Auto-generated conformance reports |
| **Regulation Deadline Engine** | Countdown timers for applicable deadlines |
| **Compliance Proof Vault** | Cryptographically timestamped audit trail |

### Legal Defense & Evidence
| Feature | Description |
|---------|-------------|
| **Anchored Evidence Chain** | Merkle-style per-workspace SHA-256 hash chain (each proof commits to evidence + prevHash + chainIndex + issuedAt) — tampering one proof breaks its hash; reordering/back-dating breaks every later `prevHash`. Independently verifiable via a public, login-free `/verify/[proofId]` page |
| **Litigation Defense File** | One-click, chronological, hash-verified "ongoing good-faith remediation effort" dossier — scan time series (incl. failed attempts), per-violation status transitions, re-scan fix verifications, and the re-verified proof ledger, plus good-faith metrics (monitoring span, % verified-fixed, mean/median time-to-remediate, score trend, chain integrity) |
| **Demand-Letter Triage & Exposure-Delta** | Paste an ADA demand letter → each alleged claim is mapped onto your scan/violation/proof history with a per-claim verdict (never_detected / not_present_on_date / remediated / present_open / rule_unrecognized / no_scan_history) plus a gross-vs-net-vs-rebutted dollar exposure delta |

### Remediation & Automation
| Feature | Description |
|---------|-------------|
| **Auto-Remediation Engine** | Server-side DOM transforms (lang, skip-links, landmarks, alt-text) |
| **Drop-in Fix Script** | <2KB vanilla JS snippet for instant client-side fixes |
| **CI/CD Regression Guard** | Block deploys when critical violations introduced |
| **Scheduled Monitoring** | Cron-based recurring scans with alert rules |
| **Priority Engine** | AI-driven fix prioritization by impact |

### Business & Agency
| Feature | Description |
|---------|-------------|
| **White-Label Platform** | Agencies resell under their own brand (custom domain, logo, colors) |
| **Multi-Tenant Workspaces** | Full data isolation per organization |
| **Revenue Impact Calculator** | Dollar cost per violation using disability prevalence data |
| **Human Testing Network** | Crowdsourced validation by users with disabilities |
| **Executive Dashboard** | C-suite risk overview with financial exposure |

### Integrations & Notifications
| Feature | Description |
|---------|-------------|
| **GitHub** | PR review with inline fix suggestions, issue creation |
| **Slack** | Rich Block Kit messages to channels |
| **Email (SMTP)** | Scan complete, new violations, weekly digest |
| **Webhooks** | Custom HTTP endpoints for all scan events |
| **Real User Monitoring** | ~3KB JS snippet detecting 9 barrier types in production |

### Platform Infrastructure
| Feature | Description |
|---------|-------------|
| **RBAC** | Owner → Admin → Member → Viewer per workspace |
| **Resource-Access Asserts** | One shared `assertScanAccess` / `assertSiteAccess` ownership helper (master-admin bypass → workspace membership → legacy userId) used across vault/vpat/statement/risk/score/simulate + defense-file/demand-letter/vendor-risk — closes proof-forgery (C-3) and cross-tenant IDOR (S-3) |
| **API Key Auth** | SHA-256 hashed keys with timing-safe comparison |
| **Audit Log** | Full action trail with actor, timestamp, IP |
| **i18n** | 7 EU languages (EN, DE, FR, ES, IT, NL, PT) |
| **Blog CMS** | Admin editor with AI generation |
| **Feature Gates** | Plan-based access control per workspace |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 16 (App Router, Turbopack, Server Components) |
| **Language** | TypeScript 5 (strict mode) |
| **Database** | PostgreSQL (Neon serverless) via Prisma 7 ORM |
| **Auth** | NextAuth.js 4 (Google OAuth + Credentials + JWT) |
| **Styling** | Tailwind CSS v4 |
| **State** | Zustand (client) + React Query (server) |
| **Scanner** | Playwright + axe-core + @sparticuz/chromium |
| **AI** | OpenAI GPT-4o-mini |
| **Monitoring** | Sentry (errors) + Upstash Redis (rate limits) |
| **Email** | Nodemailer / SMTP |
| **PDF** | jsPDF + jspdf-autotable |
| **Validation** | Zod |
| **Testing** | Vitest + Playwright (E2E) |
| **Deployment** | Vercel (serverless) |

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
git clone https://github.com/Rohitmengji/reglayer.git
cd reglayer
npm install
npx playwright install chromium
```

### Environment Variables

Create a `.env.local` file:

```env
# Database
DATABASE_URL=postgresql://user:pass@host:5432/neondb

# Auth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-here
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...

# AI (optional — features degrade gracefully without)
OPENAI_API_KEY=sk-...

# Rate Limiting
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...

# Monitoring
SENTRY_DSN=...
```

### Development

```bash
npm run dev          # Start dev server (Turbopack)
npm test             # Run unit tests (Vitest)
npm run test:e2e     # Run E2E tests (Playwright)
npm run lint         # ESLint
npm run build        # Production build
```

Open [http://localhost:3000](http://localhost:3000).

---

## Project Structure

```
src/
├── app/                         # Next.js App Router (72 pages, 116 API routes)
│   ├── api/                     # REST API endpoints
│   │   ├── scan/                # Scanning endpoints
│   │   ├── violations/          # Violation management
│   │   ├── auth/                # Authentication flows
│   │   ├── agency/              # White-label agency APIs
│   │   ├── notifications/       # In-app notification system
│   │   ├── onboarding/          # Onboarding state management
│   │   └── cron/                # Scheduled job handlers
│   ├── dashboard/               # Main dashboard + sub-pages
│   ├── risk/                    # Lawsuit risk score page
│   ├── vault/                   # Compliance proof vault
│   ├── verify/                  # Public, login-free Anchored Evidence Chain verification
│   ├── demand-letter/           # Demand-letter triage & exposure-delta
│   ├── regulations/             # Regulation deadline intelligence
│   ├── agency/                  # White-label agency admin
│   ├── testing/                 # Human testing network
│   └── auth/                    # Login, register, forgot-password
├── components/                  # React components (50+)
│   ├── ui/                      # Design system primitives
│   ├── layout/                  # App shell, sidebar, footer, brand provider
│   ├── onboarding/              # Role selector, getting started checklist
│   ├── risk/                    # Risk score badge, breakdown, context form
│   ├── scanner/                 # Scan form, violation cards
│   ├── charts/                  # Compliance trend, dashboard charts
│   └── notifications/           # Bell icon, notification dropdown
├── lib/                         # Core business logic
│   ├── scanner/                 # Scan engine, crawlers, pipelines
│   │   ├── accessibility/       # axe-core integration, normalization
│   │   ├── browser/             # Playwright/Chromium management
│   │   └── pipelines/           # Scan orchestration
│   ├── risk/                    # Litigation risk scoring engine
│   ├── vault/                   # Compliance proof + Anchored Evidence Chain (chain.ts, proofEngine.ts)
│   ├── defense/                 # Litigation Defense File (pure assembly core + loader)
│   ├── triage/                  # Demand-letter triage & exposure-delta engine
│   ├── genome/                  # Fix Genome (cross-tenant fix-outcome learning)
│   ├── vendorgraph/             # Vendor Accessibility Liability Graph (VALG)
│   ├── regulations/             # Regulation deadline engine
│   ├── compliance/              # Policy evaluator, VPAT generator
│   ├── guard/                   # CI/CD regression guard engine
│   ├── testing/                 # Human testing network logic
│   ├── intelligence/            # AIS engine, alerts, regression detection
│   ├── auth/                    # NextAuth config, RBAC, shared resource-access asserts (access.ts)
│   ├── email/                   # Nodemailer service, branded templates
│   ├── ai/                      # OpenAI explainers, structured output
│   ├── integrations/            # GitHub, Slack, webhook dispatchers
│   ├── queue/                   # Job queue, scheduler, workers
│   ├── credits/                 # Plan limits, credit tracking
│   ├── database/                # Prisma client, repositories
│   └── i18n/                    # 7 EU language translations
├── services/                    # Service layer (scanService)
├── stores/                      # Zustand state (scanStore)
├── hooks/                       # React hooks (features, trends, violations)
└── __tests__/                   # Unit tests (18 test files, 301 passing)
```

---

## Database Schema

34 models organized into domains:

| Domain | Models |
|--------|--------|
| **Identity** | User, PasswordReset, CreditGrant |
| **Multi-tenancy** | Workspace, WorkspaceMember, WorkspaceFeature |
| **Scanning** | Site, Scan, Violation, Schedule, Monitor, CrawlJobRecord |
| **Integrations** | Webhook, ApiKey, Integration, AuthConfig, NotificationPreference |
| **Agency** | Agency, AgencyClient, AgencyApiKey |
| **Risk & Compliance** | LitigationRiskScore, LitigationWeight, ComplianceProof, GuardPolicy |
| **Data-Network Intelligence** | FixOutcomeRecord (fix_outcomes), VendorObservation (vendor_observations), RumEventRecord (rum_events) |
| **Marketplace** | Tester, AuditRequest |
| **Content** | Article, ArticleVersion |
| **Analytics** | AuditLog, ConversionEvent, AccessRequest |

`ComplianceProof` carries the Anchored Evidence Chain fields (`prevHash`, `chainIndex`, `anchoredAt`, `anchorProof`) with a `@@unique([workspaceId, chainIndex])` constraint. 10 enums.

---

## API Overview

116 API routes organized by domain:

| Domain | Key Endpoints | Auth |
|--------|--------------|------|
| **Scanning** | `POST /api/scan`, `POST /api/scan/crawl` | Session / API Key |
| **Violations** | `GET /api/violations`, `PATCH /api/violations/status` | Session |
| **Risk** | `GET /api/risk`, `POST /api/risk/recalculate` | Session |
| **Vault** | `GET /api/vault/events`, `POST /api/vault/export` | Session |
| **Legal Defense** | `GET\|POST /api/sites/[siteId]/defense-file` (`?format=html\|json`), `POST /api/sites/[siteId]/demand-letter` | Session |
| **Evidence Verification** | `GET /api/vault/[proofId]/verify` | None |
| **Data-Network** | `GET /api/genome/recommend`, `GET /api/vendor-graph` | Session |
| **Agency** | `POST /api/agency`, `PATCH /api/agency/[id]` | Owner |
| **Notifications** | `GET /api/notifications/inbox`, `PATCH /api/notifications/read` | Session |
| **CI/CD** | `POST /api/gate/review` | API Key |
| **Integrations** | `POST /api/integrations/github/issues` | Session |
| **Admin** | `GET /api/admin`, `POST /api/admin` | Master Admin |
| **Public** | `GET /api/badge/[siteId]`, `GET /api/health` | None |

Full API reference available at `/api-reference` in the running app.

---

## Testing

```bash
npm test                # Unit tests (Vitest)
npm run test:e2e        # E2E tests (Playwright)
npm run visual-audit    # Visual regression screenshots
```

- 18 test suites, 301 tests passing
- Coverage: rate-limit, RBAC, scan API, queue, scheduler, compliance, auth, Anchored Evidence Chain, Litigation Defense File, demand-letter triage, Fix Genome, VALG, i18n locale parity

---

## Deployment

Deployed on Vercel with:
- Serverless functions (60s timeout for scan endpoints)
- Neon PostgreSQL (serverless Postgres)
- Upstash Redis (rate limiting)
- Sentry (error tracking)

```bash
npm run build    # Verify production build
vercel deploy    # Deploy to Vercel
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow, coding standards, and PR process.

---

## License

MIT
