# RegLayer

**Developer-native compliance infrastructure** — an enterprise-grade accessibility scanner platform built with Next.js.

RegLayer scans web pages for WCAG 2.1 / ADA / Section 508 violations, generates compliance reports, and provides AI-powered remediation guidance.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![License](https://img.shields.io/badge/License-MIT-green)

## Features

| Feature | Description |
|---------|-------------|
| **Accessibility Scanning** | Powered by axe-core 4.11 + Playwright for real browser evaluation |
| **Multi-page Crawling** | Crawl up to 10 pages from a single domain in one scan |
| **Compliance Engine** | WCAG 2.1 AA, ADA Title III, Section 508 rule evaluation |
| **PDF Reports** | Export compliance reports with scores, violations, and recommendations |
| **Screenshot Evidence** | Capture full-page screenshots as visual evidence |
| **AI Explanations** | GPT-4o-mini powered plain-language violation explanations |
| **Async Queue** | Background job processing for long-running scans |
| **Scheduled Scans** | Cron-based recurring scans for continuous monitoring |
| **Compliance Trends** | Track accessibility scores over time |
| **Authentication** | NextAuth.js with credentials provider |
| **Persistent History** | Scan history stored locally with Zustand |

## Tech Stack

- **Framework:** Next.js 16 (App Router, Turbopack)
- **Language:** TypeScript 5
- **Styling:** Tailwind CSS v4
- **Scanner:** Playwright + axe-core (manual injection)
- **State:** Zustand (client) + React Query (server)
- **Auth:** NextAuth.js 4
- **AI:** OpenAI GPT-4o-mini
- **PDF:** jsPDF + jspdf-autotable
- **Validation:** Zod

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

Create a `.env` file:

```env
NEXT_PUBLIC_APP_NAME=RegLayer
NEXT_PUBLIC_APP_VERSION=0.1.0
SCAN_TIMEOUT=30000
MAX_CONCURRENT_SCANS=5

# Auth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-here

# OpenAI (optional — AI features disabled without this)
OPENAI_API_KEY=sk-...
```

### Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Build for Production

```bash
npm run build
npm start
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/scan` | Run accessibility scan on a URL |
| POST | `/api/scan/async` | Enqueue async scan job |
| GET | `/api/scan/async?jobId=...` | Poll async job status |
| POST | `/api/scan/crawl` | Multi-page crawl scan |
| POST | `/api/reports` | Generate PDF compliance report |
| POST | `/api/ai/explain` | AI-powered violation explanation |
| GET/POST | `/api/schedules` | Manage recurring scan schedules |
| GET | `/api/health` | Health check |

## Authentication

Default credentials for development:

- **Email:** admin@reglayer.dev
- **Password:** reglayer2024

## Project Structure

```
src/
├── app/                    # Next.js App Router pages & API routes
│   ├── api/               # REST API endpoints
│   ├── dashboard/         # Main scanner dashboard
│   ├── scans/             # Scan history & detail views
│   ├── settings/          # Schedule management
│   └── auth/              # Login page
├── components/            # React components
│   ├── ui/                # Primitives (Button, Card, Input, Badge)
│   ├── scanner/           # Scanner-specific components
│   ├── charts/            # Compliance trend charts
│   └── layout/            # App shell, navigation
├── lib/                   # Core business logic
│   ├── scanner/           # Scan engine, pipelines, normalization
│   ├── regulations/       # Compliance rules & evaluation
│   ├── ai/               # AI explainers & summaries
│   ├── queue/            # Job queue & scheduler
│   └── telemetry/        # Structured logging
├── stores/               # Zustand state stores
└── hooks/                # React Query hooks
```

## License

MIT
