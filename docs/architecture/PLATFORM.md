# RegLayer — Platform Architecture

## Overview

RegLayer is an enterprise accessibility compliance platform that scans websites for WCAG 2.1 violations, maps them to European regulatory frameworks, and generates actionable compliance intelligence.

**Live:** https://reglayer.vercel.app  
**Stack:** Next.js 16 · TypeScript · Tailwind CSS v4 · Playwright · puppeteer-core · axe-core · OpenAI

---

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENT (React 19)                     │
├─────────────────────────────────────────────────────────┤
│  Pages: Landing · Dashboard · Scans · Settings · Login  │
│  State: Zustand (localStorage) · React Query            │
│  UI: Tailwind v4 · Lucide Icons · Custom Components     │
└──────────────────────────┬──────────────────────────────┘
                           │ HTTPS
┌──────────────────────────▼──────────────────────────────┐
│                  SERVER (Next.js App Router)             │
├─────────────────────────────────────────────────────────┤
│  Proxy (Auth Gate): /dashboard, /scans, /settings, /api │
│  API Routes: /api/scan · /api/reports · /api/ai · ...   │
│  Auth: NextAuth 4 (JWT, Credentials + Google OAuth)     │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│                   CORE ENGINE LAYER                      │
├─────────────────────────────────────────────────────────┤
│  Scanner Pipeline:                                      │
│    axeScanner → issueNormalizer → severityEngine        │
│    → wcagMapper → scanPipeline (orchestrator)           │
│                                                         │
│  Browser Abstraction:                                   │
│    launch.ts (Playwright local / puppeteer-core Vercel) │
│    crawler.ts · screenshot.ts · playwright.ts           │
│                                                         │
│  Compliance Engine:                                     │
│    policyEvaluator → wcagRules + euAccessibilityRules   │
│                                                         │
│  AI Layer:                                              │
│    violationExplainer · complianceSummary (GPT-4o-mini) │
│                                                         │
│  Queue & Scheduling:                                    │
│    scanQueue (in-memory) · scheduler (cron-parser)      │
│                                                         │
│  Reporting:                                             │
│    jsPDF + autotable → PDF compliance reports           │
└─────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
src/
├── app/                          # Next.js App Router
│   ├── page.tsx                  # Public landing page
│   ├── layout.tsx                # Root layout (fonts, providers)
│   ├── dashboard/page.tsx        # Main scanner interface
│   ├── scans/page.tsx            # Scan history
│   ├── scans/[id]/page.tsx       # Scan detail view
│   ├── settings/page.tsx         # Scheduled scans config
│   ├── auth/login/page.tsx       # Login (credentials + Google)
│   └── api/
│       ├── scan/route.ts         # POST: single-page scan
│       ├── scan/async/route.ts   # POST/GET: async scan + polling
│       ├── scan/crawl/route.ts   # POST: multi-page crawl scan
│       ├── reports/route.ts      # POST: generate PDF report
│       ├── ai/explain/route.ts   # POST: AI explanations
│       ├── schedules/route.ts    # GET/POST: CRUD schedules
│       ├── health/route.ts       # GET: health check
│       └── auth/[...nextauth]/   # NextAuth handler
├── lib/
│   ├── scanner/                  # Core scanning engine
│   │   ├── accessibility/        # axe-core, normalization, scoring
│   │   ├── browser/              # Browser launch, crawl, screenshot
│   │   └── pipelines/            # Orchestration
│   ├── compliance/               # Policy evaluation & rules
│   ├── ai/                       # OpenAI integration
│   ├── auth/                     # NextAuth config
│   ├── queue/                    # Job queue & scheduler
│   ├── database/                 # (scaffolded) Future persistence
│   ├── telemetry/                # Structured logging
│   ├── types/                    # TypeScript definitions
│   ├── validations/              # Zod schemas
│   ├── constants/                # App-wide constants
│   └── utils/                    # Utilities
├── components/
│   ├── ui/                       # Base components (button, card, etc.)
│   ├── layout/                   # App shell, sidebar
│   ├── scanner/                  # Scan form, violation cards
│   ├── dashboard/                # Score card
│   └── charts/                   # Compliance trend
├── stores/                       # Zustand state
├── hooks/                        # Custom React hooks
├── services/                     # Service orchestration
└── proxy.ts                      # Auth middleware (Next.js 16)
```

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Playwright local + puppeteer-core serverless | Playwright's full install is too large for Lambda. puppeteer-core + @sparticuz/chromium is the proven serverless combo |
| Manual axe-core injection (not @axe-core/playwright) | The wrapper has a `module.exports` bug in browser evaluate context |
| JWT sessions (no DB) | V1 simplicity. No infrastructure dependency for auth |
| In-memory queue/scheduler | V1 simplicity. Redis/BullMQ ready architecture |
| Zustand + localStorage | Client-side persistence without a database for scan history |
| `outputFileTracingIncludes` + `includeFiles` | Ensures @sparticuz/chromium binaries ship in serverless bundle |

---

## Environment Configuration

| Variable | Required | Purpose |
|----------|----------|---------|
| `NEXTAUTH_URL` | Yes | App base URL |
| `NEXTAUTH_SECRET` | Yes (prod) | JWT signing secret |
| `OPENAI_API_KEY` | No | Enables AI explanations |
| `GOOGLE_CLIENT_ID` | No | Enables Google OAuth |
| `GOOGLE_CLIENT_SECRET` | No | Enables Google OAuth |

---

## Deployment

- **Platform:** Vercel (auto-deploy from GitHub)
- **Functions:** 60s timeout, 1024MB memory for scan routes
- **External Packages:** @sparticuz/chromium, playwright, puppeteer-core
- **Chromium Binary:** Included via `outputFileTracingIncludes` + `vercel.json includeFiles`
