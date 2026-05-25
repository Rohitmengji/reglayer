# RegLayer — Architecture Overview

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                          │
│                                                             │
│   Next.js App Router → Dashboard, Scan UI, Reports          │
│   State: Zustand + React Query                              │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          │ HTTP / REST
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                        API LAYER                             │
│                                                             │
│   /api/scan      → Initiate scans                           │
│   /api/reports   → Retrieve reports                         │
│   /api/health    → System health                            │
│                                                             │
│   Validation: Zod schemas at boundary                       │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          │ Service Layer
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                      SERVICE LAYER                           │
│                                                             │
│   scanService        → Orchestrates scan pipeline           │
│   reportService      → Generates compliance reports         │
│   complianceService  → Evaluates policy rules               │
└──────────┬──────────────────────────────┬───────────────────┘
           │                              │
           │                              │
┌──────────▼──────────┐    ┌──────────────▼───────────────────┐
│   SCANNER ENGINE    │    │       COMPLIANCE ENGINE           │
│                     │    │                                   │
│   Playwright        │    │   Rule Definitions                │
│   axe-core          │    │   Policy Evaluator                │
│   Crawling          │    │   WCAG Mapper                     │
│   Screenshots       │    │   Severity Engine                 │
└─────────────────────┘    └───────────────────────────────────┘
```

## Design Principles

1. **Pipeline Architecture**: Every operation is a pipeline of discrete steps.
2. **Boundary Validation**: All external input validated at system boundaries.
3. **Separation of Concerns**: Scanner, compliance, AI, and UI are fully decoupled.
4. **Infrastructure Mindset**: Built for scale from day one.
5. **AI as Augmentation**: AI assists reasoning but is never the core system.

## Data Flow

```
User submits URL
    ↓
API validates with Zod
    ↓
Service layer orchestrates
    ↓
Scanner pipeline executes:
    → Launch browser
    → Navigate to page
    → Run axe-core
    → Normalize results
    → Classify severity
    → Generate score
    ↓
Compliance engine evaluates:
    → Match violations to rules
    → Calculate compliance %
    → Generate report
    ↓
Response returned to client
```

## Future Architecture (Queue-based)

```
User submits URL
    ↓
API enqueues job (BullMQ)
    ↓
Worker picks up job
    ↓
Scanner pipeline executes
    ↓
Results stored (PostgreSQL)
    ↓
WebSocket notifies client
```

## Technology Decisions

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Frontend | Next.js 15 | App Router, RSC, API routes |
| Styling | Tailwind + shadcn | Consistent, accessible components |
| State | Zustand + React Query | Minimal boilerplate, server state |
| Validation | Zod | Runtime safety at boundaries |
| Scanner | Playwright + axe-core | Industry standard tools |
| Database | PostgreSQL (future) | Relational data, JSONB support |
| Queue | BullMQ (future) | Redis-backed, reliable |
| AI | OpenAI (future) | Explanation generation |
