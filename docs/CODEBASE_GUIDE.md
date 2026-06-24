# RegLayer — Complete Codebase Guide

> **Purpose**: This document explains every file in the RegLayer codebase — WHY it exists, WHAT it does, and HOW it works. Read this to understand the system as if you built it yourself.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Root Configuration Files](#root-configuration-files)
3. [Database Layer (Prisma)](#database-layer-prisma)
4. [Source Code: Application Pages](#source-code-application-pages)
5. [Source Code: API Routes](#source-code-api-routes)
6. [Source Code: Components](#source-code-components)
7. [Source Code: Library (Core Logic)](#source-code-library-core-logic)
8. [Source Code: Services, Stores, Hooks](#source-code-services-stores-hooks)
9. [Testing](#testing)
10. [Scripts & CI/CD](#scripts--cicd)
11. [Data Flow: How a Scan Works End-to-End](#data-flow-how-a-scan-works-end-to-end)

---

## Architecture Overview

RegLayer is a **web accessibility compliance platform** built with:

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Next.js 16 (App Router) + React 19 + Tailwind CSS 4 | UI rendering |
| State | Zustand (client) + React Query (server state) | Data management |
| Backend | Next.js API Routes (serverless functions) | Business logic |
| Database | PostgreSQL via Prisma ORM | Persistence |
| Scanner | Playwright + axe-core + @sparticuz/chromium | Accessibility scanning |
| Queue | In-memory (V1), designed for BullMQ+Redis (V2) | Async job processing |
| Auth | NextAuth.js (Google OAuth + Credentials) | Identity management |
| Monitoring | Sentry (errors) + Upstash Redis (rate limits) | Observability |
| i18n | Custom system (7 EU languages) | Internationalization |
| Deployment | Vercel (serverless) + Docker Compose (local) | Infrastructure |

### Key Architectural Decisions

1. **Thin API routes, fat service layer** — API routes validate input and delegate to services. Business logic lives in `src/services/` and `src/lib/`.

2. **Pipeline pattern for scanning** — Scans flow through: `crawl → analyze → normalize → classify → enrich → report`. Each step is independent and testable.

3. **Multi-tenant workspaces** — Users belong to workspaces via `WorkspaceMember`. All data (scans, schedules, webhooks) is scoped to a workspace.

4. **Credits-based billing** — Each plan has AI credit limits, scan limits, and feature gates. The `credits/` module enforces these.

5. **Fire-and-forget side effects** — After a scan completes, webhooks, emails, and integrations are dispatched asynchronously without blocking the response.

6. **Pure-core moat features** — The legal/data-network moat features (Anchored Evidence Chain, Litigation Defense File, Demand-Letter Triage, Fix Genome, VALG) each follow a strict trichotomy: a PURE core (no Prisma/Next/`server-only`, unit-testable like `chain.ts`) + a thin `server-only` loader + a thin route handler. Best-effort recorders never throw; all generated HTML is `escapeHtml`-escaped.

---

## Root Configuration Files

### `package.json`
- **WHY**: Defines the project identity, dependencies, and scripts
- **WHAT**: Lists all npm packages and their roles
- **HOW**: `npm run dev` starts Next.js dev server; `npm run build` compiles for production; `npm test` runs Vitest
- **Key deps**: `next` (framework), `prisma` (DB), `axe-core`/`playwright` (scanning), `next-auth` (auth), `zustand` (state), `zod` (validation), `openai` (AI features), `@sentry/nextjs` (monitoring)

### `next.config.ts`
- **WHY**: Configures Next.js build behavior and Sentry integration
- **WHAT**: Marks heavy packages (`chromium`, `playwright`, `pg`) as server-external so they don't bloat client bundles. Configures Turbopack (Next.js 16 default bundler), optimizes barrel imports, enables Sentry source maps
- **HOW**: `serverExternalPackages` tells the bundler not to bundle these server-only packages. `outputFileTracingIncludes` ensures Chromium binaries are deployed to Vercel. `withSentryConfig` wraps the config for error tracking

### `tsconfig.json`
- **WHY**: TypeScript compiler configuration
- **WHAT**: Enables strict mode, sets path aliases (`@/*` → `./src/*`), targets ES2017 with ESNext modules
- **HOW**: The `@/*` alias means `import { prisma } from "@/lib/database/prisma"` resolves to `src/lib/database/prisma.ts`

### `docker-compose.yml`
- **WHY**: Local development infrastructure
- **WHAT**: Runs PostgreSQL 16 and Redis containers
- **HOW**: `docker-compose up -d` starts both services. PostgreSQL runs on port 5432, Redis on 6379. Data persists via Docker volumes

### `vercel.json`
- **WHY**: Vercel deployment configuration
- **WHAT**: Sets function timeouts, memory limits, and route configuration for serverless deployment
- **HOW**: Scan endpoints get longer timeouts (60s) because browser scanning is slow

### `eslint.config.mjs`
- **WHY**: Code quality enforcement
- **WHAT**: Uses Next.js ESLint config for consistent code style
- **HOW**: `npm run lint` checks all files against these rules

### `postcss.config.mjs`
- **WHY**: PostCSS plugin configuration for Tailwind CSS 4
- **WHAT**: Registers the `@tailwindcss/postcss` plugin
- **HOW**: Processes `globals.css` and transforms Tailwind utilities into actual CSS

### `vitest.config.ts`
- **WHY**: Test runner configuration
- **WHAT**: Sets up Vitest with React support, path aliases, and coverage collection
- **HOW**: `npm test` uses this config. Tests in `src/__tests__/` run against mocked database

### `prisma.config.ts`
- **WHY**: Prisma CLI configuration
- **WHAT**: Tells Prisma where to find the schema and which adapter to use
- **HOW**: `prisma generate` reads this to produce the TypeScript client

### `instrumentation.ts` / `instrumentation-client.ts`
- **WHY**: Next.js instrumentation hooks for Sentry
- **WHAT**: Initializes Sentry error tracking on both server and client
- **HOW**: Next.js automatically calls these at startup to set up monitoring

### `sentry.server.config.ts` / `sentry.edge.config.ts`
- **WHY**: Sentry SDK configuration for server-side and edge runtime
- **WHAT**: Sets DSN, traces sample rate, and environment
- **HOW**: Imported by instrumentation files to configure error capturing

### `playwright.config.ts`
- **WHY**: E2E test configuration
- **WHAT**: Configures Playwright for smoke testing against the running app
- **HOW**: `npm run test:e2e` launches a browser and tests critical paths

---

## Database Layer (Prisma)

### `prisma/schema.prisma`
- **WHY**: Single source of truth for the entire data model
- **WHAT**: Defines all database tables, relationships, enums, and indexes
- **HOW**: `prisma generate` creates TypeScript types; `prisma db push` syncs to PostgreSQL

#### Data Models Explained:

| Model | Purpose |
|-------|---------|
| `User` | Identity: email, plan tier, AI credits, admin flag |
| `Workspace` | Multi-tenancy container: team boundary for all data |
| `WorkspaceMember` | Many-to-many: User ↔ Workspace with roles (OWNER/ADMIN/MEMBER/VIEWER) |
| `Site` | A monitored website URL within a workspace |
| `Scan` | One scan execution: URL, score, violation counts, status, timing |
| `Violation` | Individual accessibility issue found in a scan |
| `Schedule` | Cron-based recurring scan automation |
| `Webhook` | Event subscription: URL + events + HMAC secret |
| `ApiKey` | Programmatic access tokens (hashed, with prefix for identification) |
| `AuditLog` | Immutable action trail for compliance evidence |
| `AccessRequest` | OAuth onboarding queue: users request workspace access |
| `CreditGrant` | Admin-granted bonus AI credits |
| `ComplianceProof` | Tamper-evident compliance proof issued from a scan. Now a Merkle-style hash chain: gained `prevHash`/`chainIndex`/`anchoredAt`/`anchorProof` + `@@unique([workspaceId, chainIndex])` (the Anchored Evidence Chain) |
| `Monitor` (`monitors`) | Site monitoring rule: condition (score_below/score_drop/new_critical/new_violations) + threshold + notify channel |
| `CrawlJobRecord` (`crawl_jobs`) | Durable crawl-job state (status, progress, pages scanned, result/error) for multi-page crawls |
| `RumEventRecord` (`rum_events`) | Durable Real User Monitoring events (type, selector, page, session, viewport) |
| `FixOutcomeRecord` (`fix_outcomes`) | Crowd-verified remediation outcome (success/failure) keyed by `ruleId` + normalized `fingerprint`; standalone, no enforced relations. Powers the Fix Genome [#169] |
| `VendorObservation` (`vendor_observations`) | One row per (scan, vendor): vendor, category, violationCount, riskScore, observedAt; standalone. Powers the Vendor Accessibility Liability Graph [#170] |

> **Counts**: 34 models, 10 enums. Standalone records (`FixOutcomeRecord`, `VendorObservation`, `RumEventRecord`) deliberately omit enforced relations so an outcome/observation survives deletion of its source scan and best-effort recorders never break the primary flow.

#### Key Relationships:
```
User → WorkspaceMember → Workspace
Workspace → Site → Scan → Violation
Workspace → Schedule (references Site)
Workspace → Webhook
Workspace → ApiKey
```

---

## Source Code: Application Pages

All pages live in `src/app/` following Next.js App Router conventions. Each `page.tsx` is a route.

### Global Files

| File | Why | What | How |
|------|-----|------|-----|
| `layout.tsx` | Root HTML template | Loads fonts (Inter + JetBrains Mono), sets metadata/SEO, wraps everything in Providers, implements flash-free dark mode | Critical inline styles + script in `<head>` prevent white flash |
| `globals.css` | Global stylesheet | Tailwind CSS 4 base layer + custom properties for theming | Imports Tailwind and defines dark/light color tokens |
| `error.tsx` | Error boundary | Catches runtime errors in page renders | Shows user-friendly error + "Try Again" button |
| `global-error.tsx` | Top-level error boundary | Catches errors in layout itself | Fallback when even the layout fails |
| `not-found.tsx` | 404 page | Custom "page not found" UI | Friendly messaging with link back to home |
| `manifest.ts` | PWA manifest | Generates web app manifest for installability | Returns JSON with app name, icons, theme color |
| `robots.ts` | SEO robots.txt | Controls search engine crawling | Allows all crawlers, points to sitemap |
| `sitemap.ts` | SEO sitemap | Lists all public pages for search engines | Generates XML sitemap dynamically |

### Public Pages (No Auth Required)

| Page | Route | Purpose |
|------|-------|---------|
| `page.tsx` | `/` | Landing page — hero, features grid, social proof, testimonials, CTA |
| `pricing/page.tsx` | `/pricing` | 3-tier pricing (Free/Pro/Enterprise) with monthly/annual toggle |
| `features/page.tsx` | `/features` | Feature showcase: 8 feature cards with icons and descriptions |
| `standards/page.tsx` | `/standards` | Explains supported standards (WCAG, ADA, EAA, EN 301 549, etc.) |
| `contact/page.tsx` | `/contact` | Contact form + email addresses + location info |
| `privacy/page.tsx` | `/privacy` | GDPR-compliant privacy policy |
| `terms/page.tsx` | `/terms` | Terms of service |
| `cookie-policy/page.tsx` | `/cookie-policy` | EU cookie policy |
| `docs/page.tsx` | `/docs` | Documentation hub — links to all doc sections |
| `docs/getting-started/page.tsx` | `/docs/getting-started` | Quickstart guide |
| `docs/scanning/page.tsx` | `/docs/scanning` | How scanning works |
| `docs/monitoring/page.tsx` | `/docs/monitoring` | Scheduled monitoring docs |
| `docs/reports/page.tsx` | `/docs/reports` | Report generation docs |
| `docs/integrations/page.tsx` | `/docs/integrations` | Integration setup docs |
| `docs/team-management/page.tsx` | `/docs/team-management` | Team/workspace docs |
| `api-reference/page.tsx` | `/api-reference` | Full REST API documentation with code examples |
| `auth/login/page.tsx` | `/auth/login` | Login page (Google OAuth + credentials form) |
| `request-access/page.tsx` | `/request-access` | Access request form for new OAuth users |

### Authenticated Pages (Require Login)

| Page | Route | Purpose |
|------|-------|---------|
| `dashboard/page.tsx` | `/dashboard` | Main hub: scan form, stats cards, recent scans, compliance trend chart |
| `dashboard/loading.tsx` | `/dashboard` | Loading skeleton while dashboard data fetches |
| `dashboard/remediation/page.tsx` | `/dashboard/remediation` | AI-powered fix suggestions and remediation tracking |
| `dashboard/journey/page.tsx` | `/dashboard/journey` | User journey accessibility scanning |
| `dashboard/design-system/page.tsx` | `/dashboard/design-system` | Component-level accessibility audit |
| `dashboard/rum/page.tsx` | `/dashboard/rum` | Real User Monitoring for accessibility events |
| `dashboard/revenue/page.tsx` | `/dashboard/revenue` | Revenue impact calculator (cost of non-compliance) |
| `scans/page.tsx` | `/scans` | Scan history list with filters, pagination |
| `scans/[id]/page.tsx` | `/scans/:id` | Individual scan detail: violations, score, metadata |
| `scans/compare/page.tsx` | `/scans/compare` | Side-by-side scan comparison (base vs. head) |
| `scans/loading.tsx` | `/scans` | Loading skeleton for scan list |
| `compliance/page.tsx` | `/compliance` | WCAG compliance matrix + regulation mappings |
| `compliance/matrix-page.tsx` | `/compliance` | WCAG criteria matrix view (component) |
| `compliance/vpat/page.tsx` | `/compliance/vpat` | VPAT (Voluntary Product Accessibility Template) generator |
| `statement/page.tsx` | `/statement` | Accessibility statement generator (EN 301 549 Annex C) |
| `crawl/page.tsx` | `/crawl` | Multi-page site crawler: enter base URL, crawl + scan all pages |
| `priorities/page.tsx` | `/priorities` | AI-ranked fix priorities: "what to fix first" |
| `insights/page.tsx` | `/insights` | AI-powered accessibility insights and explanations |
| `analytics/page.tsx` | `/analytics` | Compliance score trending, charts, breakdown |
| `analysis/page.tsx` | `/analysis` | Combined analysis view (screen reader, visual audit) |
| `screen-reader/page.tsx` | `/screen-reader` | Screen reader simulation/narration |
| `automation/page.tsx` | `/automation` | Automation hub (schedules, remediation) |
| `automation/schedules-page.tsx` | `/automation` | Schedule management component |
| `team/page.tsx` | `/team` | Team member management (invite, roles, remove) |
| `team/loading.tsx` | `/team` | Loading skeleton for team page |
| `integrations/page.tsx` | `/integrations` | Connected integrations (GitHub, Slack, etc.) |
| `webhooks/page.tsx` | `/webhooks` | Webhook subscription management |
| `notifications/page.tsx` | `/notifications` | Notification preferences and history |
| `manage/page.tsx` | `/manage` | Management hub (team, webhooks, notifications) |
| `manage/notifications-page.tsx` | `/manage` | Notifications management component |
| `audit-log/page.tsx` | `/audit-log` | Audit trail viewer (who did what, when) |
| `settings/page.tsx` | `/settings` | User settings: API keys, profile, preferences |
| `settings/loading.tsx` | `/settings` | Loading skeleton for settings |
| `admin/page.tsx` | `/admin` | Master admin panel: user management, credit grants |
| `report/[id]/page.tsx` | `/report/:id` | Public shareable scan report (standalone, no sidebar) |
| `certificate/[id]/page.tsx` | `/certificate/:id` | Compliance certificate (shareable badge) |
| `demand-letter/page.tsx` | `/demand-letter` | Demand-Letter Triage: paste an ADA demand letter (or enter claims) and get a per-claim verdict + dollar exposure-delta against your scan/proof history |

### Public Pages (No Auth Required) — Verification

| Page | Route | Purpose |
|------|-------|---------|
| `verify/[proofId]/page.tsx` | `/verify/:proofId` | **Login-free** public verification of an Anchored Evidence Chain proof — recomputes the proof hash and walks the workspace chain so any third party can confirm tamper-evidence without trusting RegLayer |

---

## Source Code: API Routes

All API routes live in `src/app/api/`. Each `route.ts` exports HTTP method handlers (`GET`, `POST`, `PUT`, `DELETE`).

### Core Scanning

| Route | Methods | Purpose |
|-------|---------|---------|
| `scan/route.ts` | POST | **Main scan endpoint** — validates URL (Zod + SSRF check), enforces rate limits and plan limits, delegates to `scanService.performScan()` |
| `scan/crawl/route.ts` | POST | Multi-page crawl — crawls a site and scans each discovered page |
| `scans/route.ts` | GET | List all scans for the authenticated user's workspace |
| `scans/[id]/route.ts` | GET | Get a single scan by ID with all violations |
| `scans/[id]/export/route.ts` | GET | Export scan results as CSV/JSON |
| `scans/[id]/insights/route.ts` | GET | AI-generated insights for a scan |
| `scans/[id]/priorities/route.ts` | GET | Priority-ranked fixes for a scan |
| `scans/[id]/wcag-matrix/route.ts` | GET | WCAG criteria pass/fail matrix for a scan |
| `scans/compare/route.ts` | GET | Compare two scans: fixed, introduced, persistent violations |

### Reports & Compliance

| Route | Methods | Purpose |
|-------|---------|---------|
| `reports/route.ts` | POST | Generate PDF report from scan data |
| `compliance/vpat/route.ts` | GET, POST | Generate VPAT document |
| `statement/generate/route.ts` | POST | Generate accessibility statement text |
| `certificate/[id]/route.ts` | GET | Serve compliance certificate for embedding |
| `badge/route.ts` | GET | SVG compliance badge for websites |

### AI Features

| Route | Methods | Purpose |
|-------|---------|---------|
| `ai/explain/route.ts` | POST | AI explanation of a specific violation (uses OpenAI) |

### User & Team Management

| Route | Methods | Purpose |
|-------|---------|---------|
| `auth/[...nextauth]/route.ts` | GET, POST | NextAuth.js authentication endpoints (login, callback, session) |
| `auth/change-password/route.ts` | POST | Password change for credentials-based accounts |
| `team/route.ts` | GET, POST, DELETE | Team member CRUD (list, invite, remove) |
| `access-request/route.ts` | GET, POST, PATCH | Access request lifecycle (submit, list, approve/deny) |
| `admin/route.ts` | GET, POST | Admin panel API: list users, grant credits, modify plans |

### Monitoring & Automation

| Route | Methods | Purpose |
|-------|---------|---------|
| `monitors/route.ts` | GET, POST | Site monitoring configuration |
| `schedules/route.ts` | GET, POST, DELETE | Cron schedule management |
| `cron/run-schedules/route.ts` | POST | Cron trigger (called by Vercel Cron) — executes due schedules |
| `notifications/route.ts` | GET, POST | Notification preferences and history |

### Integrations

| Route | Methods | Purpose |
|-------|---------|---------|
| `integrations/route.ts` | GET, POST, DELETE | Integration connection management |
| `integrations/github/action/route.ts` | POST | GitHub Action scan trigger |
| `integrations/github/issues/route.ts` | POST | Create GitHub issues from violations |
| `webhooks/route.ts` | GET, POST, DELETE | Webhook CRUD |
| `webhooks/test/route.ts` | POST | Send test payload to a webhook |

### Infrastructure

| Route | Methods | Purpose |
|-------|---------|---------|
| `health/route.ts` | GET | Health check (public, no auth) — returns `{ status: "ok" }` |
| `credits/route.ts` | GET | Get current user's credit balance and plan info |
| `keys/route.ts` | GET, POST, DELETE | API key management (create, list, revoke) |
| `audit-log/route.ts` | GET | Query audit trail |
| `analytics/route.ts` | GET | Analytics data (score trends, violation trends) |
| `dashboard/stats/route.ts` | GET | Dashboard summary stats |

### Advanced Features

| Route | Methods | Purpose |
|-------|---------|---------|
| `crawl/route.ts` | GET, POST | Site crawl management |
| `gate/route.ts` | POST | CI/CD quality gate (pass/fail based on score threshold) |
| `gate/review/route.ts` | POST | PR review gate status |
| `visual-audit/route.ts` | POST | Visual regression audit |
| `design-system/scan/route.ts` | POST | Design system component scan |
| `journey/route.ts` | POST | User journey flow scan |
| `screen-reader/route.ts` | POST | Screen reader narration generation |
| `rum/events/route.ts` | POST | Ingest Real User Monitoring events |
| `rum/snippet/route.ts` | GET | Serve the RUM JavaScript snippet |
| `remediate/route.ts` | POST | AI remediation suggestions |
| `remediate/beacon/route.ts` | POST | Client-side remediation beacon |
| `remediate/script/route.ts` | GET | Serve remediation overlay script |
| `revenue-impact/route.ts` | GET | Calculate revenue impact of non-compliance |
| `violations/status/route.ts` | PATCH | Update violation status (fixed, in-progress, etc.) |

### Legal Moat & Data-Network Routes

These routes back the five newly-shipped moat features. Every one follows the same shape: **pure core → thin server loader → thin route handler** doing auth + format negotiation, with all generated HTML `escapeHtml`-escaped. All ownership-scoped routes use the shared `assertSiteAccess`/`assertScanAccess` helpers (see `src/lib/auth/access.ts`).

| Route | Methods | Purpose |
|-------|---------|---------|
| `vault/[proofId]/verify/route.ts` | GET, POST | **Public, login-free** verification of an Anchored Evidence Chain proof — calls `verifyProof()` to recompute the hash and walk the workspace chain |
| `sites/[siteId]/defense-file/route.ts` | GET, POST | Litigation Defense File — assembles a chronological, hash-verified good-faith remediation dossier (`?format=html\|json`). IDOR-safe via `assertSiteAccess` on **both** verbs |
| `sites/[siteId]/demand-letter/route.ts` | POST | Demand-Letter Triage — accepts pasted `letterText` **or** a manual `claims` array, maps each claim onto scan/violation/proof history, returns verdicts + exposure-delta (`html\|json`). `assertSiteAccess`-gated, stateless |
| `genome/recommend/route.ts` | GET | Fix Genome recommendations — `?ruleId=&scope=global\|workspace&by=rule\|fingerprint`; aggregates cross-tenant `FixOutcomeRecord`s into a confidence-rated "this fix works X% of the time" answer [#169] |
| `vendor-graph/route.ts` | GET | Vendor Accessibility Liability Graph — `?vendor=&scope=global\|workspace&splitDays=`; reach-weighted liability scoring + regression-over-time detection [#170] |
| `vendor-risk/route.ts` | GET | Per-scan third-party vendor risk. Now `assertScanAccess`-gated (closed a cross-tenant IDOR) and best-effort records observations into the VALG |

---

## Source Code: Components

### Layout Components (`src/components/layout/`)

| File | Purpose | How It Works |
|------|---------|--------------|
| `app-shell.tsx` | Main authenticated layout wrapper | Renders sidebar + main content area. Handles mobile responsive hamburger menu |
| `sidebar.tsx` | Navigation sidebar | Grouped nav items (main, analysis, manage), user menu popup with theme/language/sign-out |
| `footer.tsx` | Public page footer | 4-column footer with product/legal/support links |
| `embedded-context.tsx` | Context for embedded/iframe mode | Detects if app is in an iframe and adjusts layout accordingly |

### UI Primitives (`src/components/ui/`)

| File | Purpose | How It Works |
|------|---------|--------------|
| `button.tsx` | Reusable Button component | Uses `class-variance-authority` (CVA) for variant system: `default`, `outline`, `ghost`, `destructive` |
| `card.tsx` | Card container | CardHeader, CardTitle, CardContent, CardFooter composition |
| `badge.tsx` | Status badge | Colored pill with variants: `default`, `success`, `warning`, `destructive` |
| `input.tsx` | Form input | Styled text input with consistent focus rings |
| `tab-nav.tsx` | Tab navigation | Client-side tab switching component |

### Feature Components

| File | Purpose | How It Works |
|------|---------|--------------|
| `scanner/scan-form.tsx` | URL scan input form | Takes URL + options, POSTs to `/api/scan`, shows progress stages, returns results via callback |
| `scanner/violation-card.tsx` | Individual violation display | Shows rule, impact badge, affected elements, WCAG criteria, expandable details |
| `dashboard/score-card.tsx` | Numeric metric card | Displays a score/stat with label, trend arrow, and color coding |
| `charts/compliance-trend.tsx` | Line chart component | Renders compliance score history over time (uses canvas/SVG) |

### Provider Components

| File | Purpose | How It Works |
|------|---------|--------------|
| `providers.tsx` | Root provider composition | Wraps app with SessionProvider → QueryClientProvider → ThemeProvider → I18nProvider |
| `theme-provider.tsx` | Dark/light mode manager | React context providing `resolvedTheme`, `setTheme()`, `mounted` state. Syncs to localStorage key `reglayer-theme` |
| `theme-toggle.tsx` | Theme switch button | Sun/Moon icon button that cycles light↔dark |
| `i18n-provider.tsx` | Translation context | React context providing `t()` function, `locale`, `setLocale()`. Auto-detects browser language |
| `cookie-consent.tsx` | GDPR cookie banner | Shows consent banner on first visit, stores preference in localStorage |

---

## Source Code: Library (Core Logic)

### Scanner (`src/lib/scanner/`)

The heart of RegLayer — the accessibility scanning engine.

#### `scanner/accessibility/axeScanner.ts`
- **WHY**: Core scanning capability — this is what makes the product work
- **WHAT**: Launches a browser, navigates to target URL, injects axe-core, runs accessibility analysis
- **HOW**: 
  1. Launches browser via `launch.ts` (Playwright locally, puppeteer-core on Vercel)
  2. Blocks tracking scripts and unnecessary resources for faster scans
  3. Injects `axe-core` JavaScript directly into the page context
  4. Runs `axe.run()` with configured rules (WCAG 2.1 AA by default)
  5. Returns raw violation data with affected elements, HTML snippets, and WCAG tags

#### `scanner/accessibility/issueNormalizer.ts`
- **WHY**: Raw axe-core output needs transformation to our internal format
- **WHAT**: Maps axe-core violations to `AccessibilityViolation` type with consistent structure
- **HOW**: Extracts rule IDs, maps impact levels, collects affected element details (HTML, CSS selector, failure summary)

#### `scanner/accessibility/severityEngine.ts`
- **WHY**: Need to generate a composite score from raw violations
- **WHAT**: Calculates scan score (0-100) based on weighted violation severity
- **HOW**: `critical` × 10, `serious` × 6, `moderate` × 3, `minor` × 1. Score = 100 - (weighted_sum / max_possible × 100)

#### `scanner/accessibility/wcagMapper.ts`
- **WHY**: Violations need to map to specific WCAG success criteria
- **WHAT**: Maps axe rule IDs to WCAG criterion numbers (e.g., `color-contrast` → `1.4.3`)
- **HOW**: Lookup table based on axe-core tag conventions

#### `scanner/browser/launch.ts`
- **WHY**: Need different browser strategies for local vs. serverless
- **WHAT**: Factory function that returns a browser instance
- **HOW**: Detects environment (`VERCEL` env var). Local = full Playwright. Serverless = puppeteer-core + @sparticuz/chromium (compressed Chromium binary that fits in Lambda)

#### `scanner/browser/playwright.ts`
- **WHY**: Playwright-specific browser utilities
- **WHAT**: Helper functions for page navigation, waiting, and interaction

#### `scanner/browser/crawler.ts`
- **WHY**: Need to discover all pages on a site
- **WHAT**: Crawls links from a starting URL up to a max depth/page limit
- **HOW**: BFS traversal following same-origin links, respecting robots.txt

#### `scanner/browser/screenshot.ts`
- **WHY**: Visual evidence of accessibility issues
- **WHAT**: Captures full-page or viewport screenshots
- **HOW**: Uses Playwright's `page.screenshot()`, returns base64-encoded image

#### `scanner/crawler/siteCrawler.ts`
- **WHY**: Full-site accessibility audit
- **WHAT**: Crawls entire site and runs axe-core on each discovered page
- **HOW**: Combines crawler + scanner in a queue pattern with concurrency control

#### `scanner/pipelines/scanPipeline.ts`
- **WHY**: Orchestration — scanning involves multiple steps that must execute in order
- **WHAT**: Pipeline that runs: scan → normalize → classify → screenshot → package
- **HOW**: Each stage receives previous stage's output. Wrapped in Sentry spans for tracing. Progress callbacks enable real-time UI updates

#### `scanner/design-system/scanner.ts`
- **WHY**: Audit individual UI components in isolation
- **WHAT**: Scans component patterns for accessibility (buttons, forms, modals)

#### `scanner/journey/flow-scanner.ts`
- **WHY**: Multi-step user flows may introduce accessibility barriers
- **WHAT**: Scans a sequence of page interactions (click, type, navigate)

### Compliance (`src/lib/compliance/`)

The regulation intelligence layer.

#### `compliance/policyEvaluator.ts`
- **WHY**: A violation isn't necessarily a compliance failure — context matters
- **WHAT**: Evaluates scan results against specific compliance frameworks
- **HOW**: Takes violations + standard (WCAG 2.1, EN 301 549, EAA), matches violations to specific criteria, calculates pass/fail per rule, produces overall compliance percentage

#### `compliance/regulationEngine.ts`
- **WHY**: Different regulations have different criteria sets
- **WHAT**: Maps between regulation frameworks and their requirements
- **HOW**: Registry of regulations with their applicable WCAG criteria subsets

#### `compliance/rules/wcagRules.ts`
- **WHY**: WCAG 2.1 AA criteria definition
- **WHAT**: Array of all WCAG 2.1 Level A + AA success criteria with descriptions
- **HOW**: Each rule has: ID, criteria number, level, description, test conditions

#### `compliance/rules/en301549Rules.ts`
- **WHY**: EN 301 549 is the EU harmonized standard
- **WHAT**: EN 301 549 criteria mapped to WCAG + additional requirements (like captioning)
- **HOW**: Extends WCAG rules with EU-specific clauses (Section 9, 10, 11)

#### `compliance/rules/euAccessibilityRules.ts`
- **WHY**: European Accessibility Act (EAA) specific rules
- **WHAT**: EAA requirements mapped to testable criteria
- **HOW**: Broader than WCAG — includes service-level requirements

#### `compliance/vpat-generator.ts`
- **WHY**: Enterprise customers need VPAT documents for procurement
- **WHAT**: Generates Voluntary Product Accessibility Template (Section 508 format)
- **HOW**: Takes compliance results and formats them into VPAT structure

### Intelligence (`src/lib/intelligence/`)

AI-powered analysis layer.

#### `intelligence/priorityEngine.ts`
- **WHY**: "What should I fix first?" is the #1 user question
- **WHAT**: Ranks violations by fix priority using weighted scoring
- **HOW**: Factors: impact severity (critical=10x), element count, fix difficulty estimation, WCAG level (A > AA), recurrence rate. Outputs ranked list with estimated time and score uplift

#### `intelligence/alertEngine.ts`
- **WHY**: Proactive notification when compliance degrades
- **WHAT**: Evaluates scan results against alert rules (score dropped, new critical, etc.)
- **HOW**: Compares current scan to historical baseline, triggers notifications if thresholds crossed

#### `intelligence/analyticsEngine.ts`
- **WHY**: Trend analysis for compliance tracking
- **WHAT**: Calculates score trends, violation trends, improvement rates
- **HOW**: Queries scan history, computes statistical measures (mean, median, slope)

#### `intelligence/regressionDetector.ts`
- **WHY**: Detect when a previously-fixed issue returns
- **WHAT**: Compares consecutive scans to identify regressions
- **HOW**: Diff algorithm on violation sets: `current - previous = regressions`

### AI (`src/lib/ai/`)

OpenAI integration for intelligent explanations.

#### `ai/explainers/violationExplainer.ts`
- **WHY**: Developers need plain-language explanations of accessibility issues
- **WHAT**: Uses GPT to explain violations in context with fix suggestions
- **HOW**: Constructs prompt with violation details + affected HTML, calls OpenAI API, returns structured explanation

#### `ai/structuredOutput.ts`
- **WHY**: AI responses need to be parseable, not free-form text
- **WHAT**: Zod schemas for AI output validation
- **HOW**: Uses OpenAI's structured output mode with JSON schema enforcement

#### `ai/summaries/complianceSummary.ts`
- **WHY**: Executive summary of compliance status
- **WHAT**: Generates human-readable compliance summary from scan data
- **HOW**: Prompts GPT with scan metrics, returns markdown summary

### Anchored Evidence Chain (`src/lib/vault/`)

The legal moat: tamper-evident, independently verifiable compliance proofs. **Architecture pattern**: a PURE, framework-free core (`chain.ts`) any auditor can re-run, plus a thin `server-only` engine (`proofEngine.ts`) that persists to Prisma.

#### `vault/chain.ts` — **PURE** (no Prisma, no Next, no `server-only`)
- **WHY**: A proof whose checksum lives in the same row as its evidence is trivially forgeable, and there is no tamper-evidence *across* the proof set (delete/reorder/back-date leaves no trace)
- **WHAT**: A Merkle-style hash chain. Key exports: `canonicalize` (recursive key-sorted deterministic JSON), `computeProofHash` (SHA-256 over `{ evidence, prevHash, chainIndex, issuedAt }`), `verifyProofIntegrity` (single-link recompute), `verifyChain` (walks a sorted chain, returns `{ valid, length, brokenAt, issues }`). Detects four `ChainProblem`s: `hash-mismatch`, `broken-link`, `index-gap`, `duplicate-index`
- **HOW**: Tampering one proof's evidence breaks that proof's own hash; reordering/back-dating breaks the `prevHash` of every later proof. An empty chain is *vacuously valid*. Exhaustively unit-testable exactly as-is

#### `vault/proofEngine.ts` — thin `server-only` engine
- **WHY**: Turn the forgeable in-row self-checksum into a tamper-evident, independently verifiable chain
- **WHAT**: `issueProof` appends a proof to the workspace's hash chain (`prevHash` + `chainIndex`, with a P2002 retry loop for the `@@unique([workspaceId, chainIndex])` race); `verifyProof` recomputes a proof's hash and verifies the chain up to it; `verifyWorkspaceChain` verifies the whole chain. `revokeProof`/`listProofs`/`getProof` round out the API
- **HOW**: All hashing is delegated to the pure `chain.ts`. A best-effort `anchorProofHash` stub (no-op unless `OPENTIMESTAMPS_URL` is set) leaves room for external timestamp anchoring — **no third-party anchoring is claimed today**

### Litigation Defense File (`src/lib/defense/`)

Legal moat. One click assembles a chronological, hash-verified "ongoing good-faith remediation effort" dossier from data already recorded. **No migration needed.**

#### `defense/defenseFile.ts` — **PURE**
- **WHAT**: `assembleDefenseFile` (orchestrator), `buildTimeline` (full scan time series incl. FAILED attempts + per-violation status transitions from `AuditLog` + re-scan fix verifications + the proof ledger), `computeGoodFaithMetrics` (monitoring span, % verified-fixed, mean/median time-to-remediate, accessibility-score trend, chain integrity), `verifyProofsLocally` (re-verifies each proof independently), `renderDefenseFileHTML`, and `escapeHtml`
- **HOW**: Honest framing baked in — revoked/expired proofs are NOT tampering; an empty chain is `"empty"`, never `"verified"`; no third-party timestamp anchoring is claimed

#### `defense/loadDefenseFileData.ts` — thin `server-only` loader
- **WHAT**: `loadDefenseFileData(args)` gathers scans, violations, audit logs and proofs for a site and feeds the pure assembler. A button to invoke this lives on `src/components/risk/RiskBreakdownCard.tsx`

### Demand-Letter Triage (`src/lib/triage/`)

Legal moat [feature ③, PR #168]. Paste an ADA demand letter → each alleged claim is mapped onto your scan/violation/proof history with a per-claim verdict plus a dollar exposure-delta. **Stateless — no migration.**

#### `triage/demandLetter.ts` — **PURE**
- **WHAT**: `assessClaims` (maps each claim to a `ClaimVerdict`: `never_detected` / `not_present_on_date` / `remediated` / `present_open` / `rule_unrecognized` / `no_scan_history`, bucketed into `rebutted`/`mitigated`/`exposed`/`unquantified`), `renderTriageHTML`, and `escapeHtml`. The dollar `ExposureModel` is **injected** so the core stays pure (gross alleged vs. net genuinely-open vs. rebutted)

#### `triage/parseDemandLetter.ts`
- **WHAT**: `parseDemandLetter(letterText)` uses `gpt-4o-mini` with zod validation, returning a `DemandClaim[]` (graceful null on failure). Exposes `KNOWN_TRIAGE_RULES`

#### `triage/loadTriageData.ts` — thin `server-only` loader
- **WHAT**: `loadTriageData(args)` plus `buildExposureModel(industry, primaryGeo)`, which derives the exposure model from `legalRiskEngine`'s `LITIGATION_WEIGHTS` / `INDUSTRY_MULTIPLIERS` / `GEO_MULTIPLIERS`

### Fix Genome (`src/lib/genome/`)

Data-network moat [feature ④, PR #169]. Learns which specific fix actually worked (re-scan-verified) and aggregates **cross-tenant** into "for this barrier, this fix works X% of the time, median Y days," confidence-rated.

#### `genome/fixGenome.ts` — **PURE**
- **WHAT**: `normalizeSelector`, `computeFingerprint` (`ruleId` + normalized structural selector), `aggregateOutcomes`, `recommendForRule` (confidence rated by sample size via `CONFIDENCE_THRESHOLDS = { high: 10, medium: 4, low: 1 }` → `high`/`medium`/`low`/`insufficient`). `GroupBy` is `"rule" | "fingerprint"`

#### `genome/recordOutcome.ts` — **BEST-EFFORT** (never throws)
- **WHAT**: `recordFixOutcome(args)` writes one `FixOutcomeRecord` per verified outcome (success AND failure), keyed by `ruleId` + fingerprint. Wired into `verifyViolationFix` in `src/lib/violations/status.ts`. Because it never throws, a pending migration cannot break the primary fix-verification flow

### Vendor Accessibility Liability Graph / VALG (`src/lib/vendorgraph/`)

Data-network moat [feature ⑤, PR #170]. Scores every third-party widget (Intercom, OneTrust, Stripe, YouTube, …) by the real a11y liability it injects across ALL embedding sites (reach-weighted), with regression-over-time detection.

#### `vendorgraph/vendorGraph.ts` — **PURE**
- **WHAT**: `aggregateVendorObservations`, `computeLiabilityScore(avgRiskScore, sitesAffected)` (reach-weighted), `detectVendorTrend` (regression over time; `TREND_THRESHOLD_PCT = 10` → `regressed`/`improved`/`stable`/`insufficient-data`)

#### `vendorgraph/recordObservations.ts` — **BEST-EFFORT** (never throws)
- **WHAT**: `recordVendorObservations(report)` writes one `VendorObservation` per (scan, vendor). Wired into `src/app/api/vendor-risk/route.ts`, which also gained `assertScanAccess` (closing a cross-tenant IDOR)

### Authentication (`src/lib/auth/`)

#### `auth/config.ts`
- **WHY**: Central authentication configuration
- **WHAT**: NextAuth.js options: Google OAuth + Credentials providers, JWT strategy, callbacks
- **HOW**: Google OAuth for production users. Credentials for dev seed accounts (env var based, NOT hardcoded). JWT callback enriches token with user ID, plan, admin status

#### `auth/rbac.ts`
- **WHY**: Role-based access control for team features
- **WHAT**: Permission checks: `canManageTeam()`, `canEditSettings()`, `isAdmin()`
- **HOW**: Queries `WorkspaceMember.role` and checks against required permission level

#### `auth/access.ts` — **Security-by-construction**
- **WHY**: Several routes loaded a `Scan`/`Site` by a caller-supplied id and trusted it, enabling cross-tenant reads and forged proofs bound to another tenant's scan. The correct ownership pattern existed in only one place and was never shared
- **WHAT**: Single source of truth for "can this session access this scan/site?". Exports `assertScanAccess(scanId, session)` and `assertSiteAccess(siteId, session)`, each returning a discriminated `AccessResult` — `{ ok: true, userId, isMasterAdmin, workspaceId }` or `{ ok: false, status: 401|403|404, error }`
- **HOW**: Master-admin bypass; otherwise workspace-membership (or, for legacy workspace-less scans, ownership by `userId`). Returns a result rather than throwing so callers map denials to the right HTTP status. Used across vault/vpat/statement/risk/score/simulate plus the new defense-file/demand-letter/vendor-risk routes. Closed proof-forgery (C-3) and IDOR (S-3) findings

### Enterprise SSO (`src/lib/sso/` + `/api/auth/sso/`) — multi-tenant SAML/OIDC

Built on **BoxyHQ Jackson** bridged into NextAuth v4 (JWT, no adapter). Per-tenant IdP connections; employees JIT-provision into their workspace. **Feature-flagged OFF by default** (`SSO_ENABLED` env + per-connection `rolloutStage`); pricing stays "coming soon" until a real-IdP round-trip is verified. See `docs/architecture/SSO_REVIEW.md` for the adversarial review (the embedded→service swap path, revocation, verified-domain uniqueness).

**Dependency posture:** `@boxyhq/saml-jackson` is a **devDependency** — its tree carries high-severity, partly-unfixable vulns (`@grpc/grpc-js`/OpenTelemetry via `@boxyhq/metrics`) that fail `npm audit --omit=dev --audit-level=high`. The embedded backend is for **dev/test + the verified API contract**; **production GA uses the SERVICE backend** (a standalone, BoxyHQ-maintained Jackson over HTTPS) so that tree never enters our app's production deps. The `SsoBackend` seam makes the swap one factory line.

- **`sso/backend.ts`** — the `SsoBackend` seam (the single place the Jackson hosting choice lives). `getSsoBackend()` async-loads the impl by `SSO_BACKEND` mode (`embedded` default; `service` reserved for a standalone Jackson — review #3 scale path). Swapping = one new impl, nothing else moves.
- **`sso/backend-embedded.ts`** — `EmbeddedJacksonBackend` (server-only): runs Jackson in-process on the app Postgres. Maps authorize / token / userInfo / samlResponse / oidcResponse / connection CRUD to Jackson's controllers. Verified at runtime by `sso-jackson-embedded.test.ts` (in-memory engine + real mocksaml metadata).
- **`sso/resolve.ts`** — server-side email→tenant resolution from a VERIFIED domain (tenant = `SSOConnection.id`, supports multi-IdP, #27). Client never supplies the tenant (#14).
- **`sso/routing.ts`** / **`guards.ts`** / **`provision.ts`** — PURE, unit-tested: domain normalization + connection resolution; freemail/revocation/assertion-domain guards; the JIT `planProvisioning()` decision (domain re-check #4, role precedence, attribute→column mapping).
- **`sso/provision-execute.ts`** — executes the plan against Prisma (txn-safe `WorkspaceMember` upsert, never downgrades, never touches other workspaces #5/#15).
- **`/api/auth/sso/{discovery,authorize,token,userinfo,acs,oidc}`** — discovery returns a bare boolean (non-revealing #10); authorize/token/userinfo bridge NextAuth↔Jackson (PKCE+state); acs/oidc receive the IdP response and redirect back with the OAuth code.
- **`auth/config.ts`** — `boxyhq-saml` OAuth provider (gated on `SSO_ENABLED`) + JIT in the `signIn` callback (reads `requested.tenant`; failure never blocks sign-in — additive v1 #20).
- **`auth/login/page.tsx`** — "Continue with SSO": discovery check → `signIn("boxyhq-saml", …, { login_hint })`.

### Credits (`src/lib/credits/`)

#### `credits/plan-limits.ts`
- **WHY**: Each plan has different resource limits
- **WHAT**: Defines limits per plan: AI credits, scans/month, pages/scan, team members, features
- **HOW**: Static config object. FREE: 25 AI credits, 3 scans/month. PRO: 500 credits, 30 scans. ENTERPRISE: unlimited

#### `credits/plan-context.ts`
- **WHY**: API routes need to know current user's plan limits
- **WHAT**: Gets authenticated user's plan context (limits, usage, remaining)
- **HOW**: Reads session → queries user → returns plan limits + current usage

#### `credits/index.ts`
- **WHY**: Credit consumption tracking
- **WHAT**: Functions to consume/check AI credits
- **HOW**: Increments `user.aiCreditsUsed`, checks against plan limit, handles monthly reset

### Database (`src/lib/database/`)

#### `database/prisma.ts`
- **WHY**: Single Prisma client instance (prevents connection pool exhaustion)
- **WHAT**: Creates and caches PrismaClient with PostgreSQL adapter
- **HOW**: Uses global singleton pattern. In dev, stored on `globalThis` to survive HMR. Uses `PrismaPg` adapter for connection

#### `database/workspace.ts`
- **WHY**: Auto-provision workspace for new users
- **WHAT**: Gets or creates a personal workspace for a user
- **HOW**: Checks if user has a workspace membership. If not, creates one with user as OWNER

### Integrations (`src/lib/integrations/`)

#### `integrations/webhookDispatcher.ts`
- **WHY**: Notify external systems when events occur
- **WHAT**: Dispatches scan events to registered webhook URLs
- **HOW**: Queries registered webhooks, filters by event type, POSTs JSON payload with HMAC signature. Includes SSRF protection

#### `integrations/dispatcher.ts`
- **WHY**: Unified integration dispatch (webhooks + native integrations)
- **WHAT**: Routes events to all connected integrations
- **HOW**: Fan-out pattern: sends to webhooks, GitHub, Slack, etc.

#### `integrations/github.ts`
- **WHY**: GitHub integration for issue creation
- **WHAT**: Creates GitHub issues from accessibility violations
- **HOW**: Uses GitHub API with user's connected token

#### `integrations/github-review.ts`
- **WHY**: PR review comments for accessibility regressions
- **WHAT**: Posts inline PR review comments on accessibility issues
- **HOW**: Uses GitHub PR Review API

### Queue (`src/lib/queue/`)

#### `queue/scanQueue.ts`
- **WHY**: Scans take 10-30s — can't block HTTP requests
- **WHAT**: In-memory async job queue for scan operations
- **HOW**: Creates job → returns job ID immediately → processes in background → client polls for status. Jobs have stages (queued → launching → analyzing → complete). TTL eviction after 30 minutes. Max 500 concurrent jobs

#### `queue/scheduler.ts`
- **WHY**: Cron-based recurring scans
- **WHAT**: Evaluates which schedules are due and enqueues their scans
- **HOW**: Called by `/api/cron/run-schedules`. Queries schedules where `nextRunAt <= now`, creates scan jobs, updates `lastRunAt` and computes next `nextRunAt` using `cron-parser`

### Validation (`src/lib/validations/`)

#### `validations/scan.ts`
- **WHY**: Input validation at system boundary
- **WHAT**: Zod schema for scan request: URL format, allowed options
- **HOW**: `scanRequestSchema.safeParse(body)` — returns typed data or error details

#### `validations/ssrf.ts`
- **WHY**: **SECURITY** — prevent Server-Side Request Forgery
- **WHAT**: Blocks scan requests targeting internal/private networks
- **HOW**: Checks URL against: blocked hostnames (localhost, metadata), private IP ranges (127.x, 10.x, 172.16-31.x, 192.168.x), dangerous ports (Redis, PostgreSQL, MongoDB)

### Rate Limiting (`src/lib/rate-limit.ts`)

- **WHY**: Prevent abuse and enforce fair usage
- **WHAT**: Sliding window rate limiter with Redis backend + in-memory fallback
- **HOW**: If Upstash Redis configured → distributed rate limiting across serverless instances. Otherwise → in-memory fixed window (dev mode). Rate limits defined per action type (scan, API, auth)

### Other Library Files

| File | Purpose |
|------|---------|
| `env.ts` | Validates all required env vars at startup with Zod. Crashes immediately with clear error if misconfigured |
| `retry.ts` | Generic retry utility with exponential backoff |
| `upgrade-prompt.ts` | Helper to generate upgrade prompts when plan limits are hit |
| `crypto.ts` | Cryptographic utilities (hashing, HMAC signing) |
| `utils/cn.ts` | Tailwind class merge utility (`clsx` + `tailwind-merge`) |
| `utils/api-errors.ts` | Standardized API error response helpers |
| `constants/index.ts` | App-wide constants (scan defaults, limits, URLs) |
| `email/service.ts` | Email sending via Nodemailer (scan complete, alerts, invites) |
| `scheduling/scheduleService.ts` | Schedule CRUD operations |
| `telemetry/logger.ts` | Structured logging with context propagation |
| `types/index.ts` | Shared TypeScript interfaces (ScanResult, ComplianceReport, etc.) |
| `i18n/*.ts` | Translation files for 7 languages (en, de, fr, es, it, nl, pt) |
| `analytics/revenue-calculator.ts` | Estimates revenue impact of accessibility barriers |
| `remediation/engine.ts` | AI-powered code fix generation |
| `rum/collector.ts` | Real User Monitoring event collection |
| `screen-reader/narration-engine.ts` | Generates screen reader narration for pages |

---

## Source Code: Services, Stores, Hooks

### `src/services/scanService.ts`
- **WHY**: Bridge between API routes (HTTP) and pipeline (execution)
- **WHAT**: Orchestrates complete scan lifecycle: validate → execute pipeline → evaluate compliance → persist to DB → fire webhooks → send notifications
- **HOW**: `performScan()` is the main entry point. Calls `executeScanPipeline()`, then `evaluateCompliance()`, then persists via Prisma, then dispatches side-effects (webhooks, email, integrations) as fire-and-forget promises

### `src/stores/scanStore.ts`
- **WHY**: Client-side state for scan operations
- **WHAT**: Zustand store with localStorage persistence for scan history
- **HOW**: Stores current scan result + history of last 100 scans. Persists to `reglayer-scan-history` localStorage key. Actions: `setScanResult`, `setScanning`, `getScanById`, `deleteScan`, `clearHistory`

### `src/hooks/useScan.ts`
- **WHY**: Reusable scan execution hook for React components
- **WHAT**: Custom hook that wraps scan API call with loading/error state
- **HOW**: Uses React Query for caching and deduplication

---

## Testing

> **Suite size**: 301 tests passing across 18 Vitest suites. The pure cores of the moat features (`chain.ts`, `defenseFile.ts`, `demandLetter.ts`, `fixGenome.ts`, `vendorGraph.ts`) are exhaustively unit-testable with no mocking because they take plain inputs and touch no Prisma/Next. A CI parity test also enforces that every user-facing string exists in all 7 i18n locale files.

### `src/__tests__/setup.ts`
- **WHY**: Test environment configuration
- **WHAT**: Mocks Prisma, sets up test database, provides utilities
- **HOW**: Uses Vitest's `beforeAll`/`afterAll` to set up and tear down mocks

### Test Files

| File | What It Tests |
|------|--------------|
| `compliance.test.ts` | Policy evaluator correctly maps violations to compliance rules |
| `scheduler.test.ts` | Cron schedule evaluation and next-run calculation |
| `scan-api.test.ts` | Scan API route validation, auth, rate limiting |
| `scan-queue.test.ts` | Job queue lifecycle: create, process, complete, evict |
| `rate-limit.test.ts` | Rate limiter correctly blocks/allows requests |
| `rbac.test.ts` | Role-based access control permission checks |
| `rbac-db.test.ts` | RBAC with actual database queries |
| `severity-engine.test.ts` | Score calculation accuracy |
| `issue-normalizer.test.ts` | Violation normalization correctness |
| `api-errors.test.ts` | Error response format consistency |
| `export-api.test.ts` | Report export (CSV/JSON) format |
| `change-password.test.ts` | Password change security (hashing, validation) |

### `e2e/smoke.spec.ts`
- **WHY**: End-to-end smoke test
- **WHAT**: Verifies critical paths work: landing page loads, login works, scan executes
- **HOW**: Playwright launches real browser against running app

---

## Scripts & CI/CD

### `scripts/reset-google-user.ts`
- **WHY**: Development utility
- **WHAT**: Resets a Google OAuth user's data for testing
- **HOW**: Deletes user's scans, workspaces, memberships via Prisma

### `scripts/visual-audit.ts`
- **WHY**: Visual regression testing
- **WHAT**: Captures screenshots of all pages for visual comparison
- **HOW**: Playwright navigates to each route, captures viewport screenshots

### `push-personal.sh`
- **WHY**: Quick deployment to personal Vercel preview
- **WHAT**: Commits, pushes to personal remote, triggers Vercel build
- **HOW**: `bash push-personal.sh "commit message"` — stages all, commits, pushes

### `.github/workflows/`

| File | Purpose |
|------|---------|
| `ci.yml` | Runs on every PR: lint, type-check, test, build |
| `deploy.yml` | Production deployment pipeline |
| `codeql.yml` | GitHub CodeQL security scanning |
| `trufflehog.yml` | Secret detection in commits |

### `.github/dependabot.yml`
- **WHY**: Automated dependency updates
- **WHAT**: Checks for new versions weekly, creates update PRs

---

## Data Flow: How a Scan Works End-to-End

```
┌─────────────────────────────────────────────────────────────────┐
│ USER: Enters URL in dashboard scan form                          │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ FRONTEND (src/components/scanner/scan-form.tsx)                   │
│ • Validates URL format client-side                                │
│ • Shows loading state with progress stages                       │
│ • POSTs to /api/scan                                             │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ API ROUTE (src/app/api/scan/route.ts)                            │
│ • Checks authentication (NextAuth session)                       │
│ • Rate limits by IP (Upstash Redis)                              │
│ • Validates body with Zod schema                                 │
│ • SSRF check (blocks internal/private IPs)                       │
│ • Checks plan scan limit                                         │
│ • Delegates to performScan()                                     │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ SERVICE (src/services/scanService.ts)                             │
│ • Logs scan initiation                                           │
│ • Calls executeScanPipeline()                                    │
│ • Calls evaluateCompliance()                                     │
│ • Persists to database                                           │
│ • Fires side-effects (webhooks, email, integrations)             │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ PIPELINE (src/lib/scanner/pipelines/scanPipeline.ts)             │
│                                                                   │
│ Stage 1: SCAN (axeScanner.ts)                                    │
│   • Launch browser (Playwright or puppeteer-core)                │
│   • Navigate to URL                                              │
│   • Block tracking/media resources                               │
│   • Inject axe-core bundle                                       │
│   • Execute axe.run() with WCAG 2.1 AA rules                    │
│   • Close browser                                                │
│                                                                   │
│ Stage 2: NORMALIZE (issueNormalizer.ts)                          │
│   • Transform axe output to internal violation format            │
│   • Extract affected elements, HTML, CSS selectors              │
│                                                                   │
│ Stage 3: CLASSIFY (severityEngine.ts)                            │
│   • Calculate weighted score                                     │
│   • Count by severity (critical, serious, moderate, minor)       │
│                                                                   │
│ Stage 4: SCREENSHOT (optional)                                   │
│   • Capture page screenshot as visual evidence                   │
│                                                                   │
│ Stage 5: PACKAGE                                                 │
│   • Assemble ScanResult with ID, timestamp, metadata             │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ COMPLIANCE (src/lib/compliance/policyEvaluator.ts)               │
│ • Load WCAG 2.1 rules                                            │
│ • Match violations to criteria                                   │
│ • Calculate per-rule pass/fail                                   │
│ • Produce overall compliance percentage                          │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ PERSISTENCE (Prisma → PostgreSQL)                                │
│ • Create Scan record                                             │
│ • Create Violation records (nested create)                       │
│ • Link to User and Workspace                                     │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ SIDE EFFECTS (fire-and-forget)                                   │
│ • Webhook dispatch → registered endpoints                        │
│ • Email notification → user                                      │
│ • Alert evaluation → threshold checks                            │
│ • Integration dispatch → GitHub, Slack                           │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ RESPONSE → Frontend                                              │
│ • Returns { scan: ScanResult, compliance: ComplianceReport }     │
│ • Frontend stores in Zustand + renders results                   │
│ • Score card, violation cards, compliance breakdown visible       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `NEXTAUTH_SECRET` | Yes | JWT signing key (≥16 chars) |
| `NEXTAUTH_URL` | Yes | App base URL (e.g., `http://localhost:3000`) |
| `GOOGLE_CLIENT_ID` | No | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | No | Google OAuth client secret |
| `OPENAI_API_KEY` | No | OpenAI API key for AI features |
| `UPSTASH_REDIS_REST_URL` | No | Redis URL for distributed rate limiting |
| `UPSTASH_REDIS_REST_TOKEN` | No | Redis auth token |
| `SENTRY_DSN` | No | Sentry error tracking |
| `SENTRY_AUTH_TOKEN` | No | Sentry source map upload |
| `SEED_MASTER_EMAIL` | No | Dev master admin email |
| `SEED_MASTER_PASSWORD` | No | Dev master admin password |
| `SEED_ADMIN_EMAIL` | No | Dev admin email |
| `SEED_ADMIN_PASSWORD` | No | Dev admin password |

---

## Key Design Patterns

1. **Thin routes, fat services** — API routes only validate + delegate
2. **Pipeline architecture** — Scanning is a chain of independent stages
3. **Fire-and-forget side effects** — Don't block user response for notifications
4. **Singleton database client** — Prevent connection pool exhaustion
5. **Plan-gated features** — Credits system enforces tiered access
6. **SSRF protection** — All user-supplied URLs validated before scanning
7. **Structured logging** — Context-rich logs for debugging
8. **Progressive enhancement** — Works without AI/Redis/email (graceful degradation)
9. **Multi-tenant isolation** — All data scoped to workspaces
10. **Immutable audit trail** — Every action logged for compliance evidence
11. **Pure-core / loader / handler trichotomy** — Every moat feature is split into (a) a PURE core with no Prisma/Next/`server-only` (exhaustively unit-testable exactly like `chain.ts`), (b) a thin `server-only` data loader, and (c) a thin route handler doing auth + format negotiation. All generated HTML is `escapeHtml`-escaped
12. **Best-effort recorders never throw** — `recordFixOutcome` / `recordVendorObservations` swallow errors so a pending migration cannot break the primary flow
13. **Security-by-construction ownership** — Shared `assertScanAccess` / `assertSiteAccess` discriminated assertions guard every ownership-scoped route (closed proof-forgery C-3 and IDOR S-3)
14. **i18n parity in CI** — Every user-facing string exists in all 7 locale files; a parity test enforces this

---

## Recent Additions

Structural pieces added after the main snapshot (fold into the tables above when convenient):

- **Custom Compliance Rules** (Enterprise) — Prisma model `ComplianceRule` + enum `ComplianceRuleType`; pure engine `src/lib/compliance/customRules.ts`; API `src/app/api/rules/route.ts` + `[id]/route.ts` (CRUD) and `src/app/api/scans/[id]/custom-rules/route.ts` (per-scan eval); management UI `src/app/compliance/rules/page.tsx`; results card `src/components/scanner/custom-rules-card.tsx` on the scan detail page. Feature id `customRules` in `src/lib/features/feature-catalog.ts`.
- **Enterprise pricing model** — `src/lib/pricing/enterprise.ts` (typed feature list with availability status + per-feature `evidence`) drives `src/app/pricing/page.tsx` + `src/components/pricing/enterprise-section.tsx`.
- **Contact / sales flow** — real `src/app/api/contact/route.ts` (zod + rate-limit + honeypot + email) wired to `src/app/contact/page.tsx`.
- **White-label reports** — `src/lib/compliance/vpat-generator.ts` accepts sanitized agency branding; `src/app/api/compliance/vpat/route.ts` resolves it.
- **Honesty posture** — every public claim must be backed by code or softened. EU "data residency" / "SOC 2 Type II" claims were removed/softened (infra is US-default; OpenAI/US is a live sub-processor). Do **not** reintroduce hosting-location or certification claims without backing config.

---

*Generated for RegLayer codebase comprehension. Last updated: June 2026.*
