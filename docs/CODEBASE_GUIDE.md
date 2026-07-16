# RegLayer — Codebase Guide

> **Last updated**: 2026-07-16 | **Stats**: 87 pages, 180 API routes, 75 Prisma models, 1,150 tests

This is the authoritative map of the RegLayer codebase. AI agents and developers should read this BEFORE exploring the repo.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript 5 (strict) |
| Database | PostgreSQL (Neon serverless) via Prisma 7 |
| Cache | Upstash Redis |
| Auth | NextAuth.js v4 (JWT sessions, 24h expiry) |
| AI | OpenAI + Anthropic via custom gateway (`src/lib/ai/gateway/`) |
| Browser | Playwright (local) / puppeteer-core + @sparticuz/chromium (serverless) |
| Styling | Tailwind CSS 4 + design tokens in `globals.css` |
| State | Zustand with localStorage persistence |
| Testing | Vitest (unit) + Playwright (E2E) |
| CI | GitHub Actions (5-job gate: lint, build, test, security, E2E) |
| Hosting | Vercel (serverless, 60s max, 2048MB for scan routes) |
| Monitoring | Sentry (errors + performance + profiling) |

---

## Directory Structure

### Pages (`src/app/`) — 87 pages

**Public (no auth):** landing `/`, pricing, features, standards, docs, api-reference, contact, blog, privacy, terms, cookie-policy, auth/login, auth/register, verify/[proofId]

**Authenticated (AppShell + sidebar):**
- **Dashboard**: `/dashboard` (main), `/dashboard/ai-costs`, `/dashboard/revenue`, `/dashboard/rum`, `/dashboard/design-system`, `/dashboard/journey`, `/dashboard/remediation`
- **Testing Hub**: `/test` (tabbed: scans, crawl, manual), `/crawl`, `/scans`, `/manual-testing`
- **Analysis**: `/analysis`, `/violations`, `/screen-reader`, `/insights`, `/trends`, `/priorities`
- **Compliance**: `/compliance` (matrix), `/reports`, `/vault`, `/statement`, `/certificate`, `/warranty`
- **Risk**: `/risk`, `/demand-letter`, `/regulations`, `/competitive`, `/radar`
- **Workspace**: `/manage` (team/integrations), `/settings`, `/settings/sso`, `/agency`, `/integrations`, `/webhooks`
- **Admin**: `/admin` (master admin panel), `/admin/features` (feature gates)
- **Tools**: `/tools/contrast`, `/tools/color-vision`, `/tools/readability`

### API Routes (`src/app/api/`) — 180 routes across 80 domains

**Core scanning**: `/api/scan`, `/api/crawl`, `/api/scans`, `/api/violations`, `/api/journey`, `/api/visual-audit`, `/api/screen-reader`

**AI platform**: `/api/ai/chat` (streaming), `/api/ai/conversations` (CRUD), `/api/ai/conversations/[id]`, `/api/ai/usage` (cost dashboard)

**Compliance**: `/api/compliance`, `/api/vault`, `/api/statement`, `/api/certificate`, `/api/warranty`, `/api/guard`, `/api/regulations`

**Risk & legal**: `/api/risk`, `/api/sites/[siteId]/defense-file`, `/api/sites/[siteId]/demand-letter`, `/api/vendor-risk`, `/api/vendor-graph`, `/api/genome`

**Infrastructure**: `/api/health`, `/api/auth/*`, `/api/keys`, `/api/team`, `/api/billing/*`, `/api/webhooks/*`, `/api/cron/*`, `/api/admin`

**Enterprise**: `/api/sso/*`, `/api/v1/*` (API key auth), `/api/mcp/*`, `/api/agents/*`

### Domain Libraries (`src/lib/`) — 60 modules

**AI**: `ai/gateway/` (multi-provider routing, cost calculation), `ai/chat/` (tools, context), `ai/observability/` (event logging, usage queries), `ai/prompts/` (versioned system prompts), `ai/lineage/` (trace builder), `ai/memory/` (user context extraction), `ai/safety/` (guardrails), `ai/routing/` (model router), `ai/explainers/` (violation explainer), `ai/summaries/` (compliance summary)

**Scanner**: `scanner/browser/launch.ts` (Playwright/puppeteer dual-mode), `scanner/crawler/siteCrawler.ts` (BFS engine), `scanner/crawler/job-manager.ts` (in-memory + durable state), `scanner/pipelines/scanPipeline.ts` (axe-core execution), `scanner/auth.ts` (form/cookie/header auth)

**Auth**: `auth/config.ts` (NextAuth), `auth/rbac.ts` (role checks), `auth/api-guard.ts` (requireWorkspacePermission), `auth/api-key.ts` (SHA-256 key auth), `auth/access.ts` (resource-access asserts)

**Credits**: `credits/index.ts` (check/consume/refund), `credits/plan-limits.ts` (FREE/PRO/ENTERPRISE limits)

**Key patterns**: Every authenticated API route calls `requireWorkspacePermission()` or checks `getServerSession()`. Workspace-scoped data always filters by `workspaceId`. Rate limiting via `applyRateLimit()`.

### Components (`src/components/`) — 22 directories

**AI chat**: `ai/ChatPanel.tsx` (slide-out panel), `ai/ChatMessage.tsx` (markdown + code blocks + actions), `ai/ChatInput.tsx` (composer with focus ring, char count)

**Layout**: `layout/app-shell.tsx` (auth gate, sidebar, chat FAB), `layout/sidebar.tsx` (nav sections with feature gates)

**Scanner**: `scanner/scan-form.tsx`, `scanner/violation-card.tsx`, `scanner/scan-auth-section.tsx`

**UI primitives**: `ui/button.tsx`, `ui/card.tsx`, `ui/badge.tsx`, `ui/input.tsx`, `ui/info-hint.tsx`, `ui/feature-gate.tsx`, `ui/modern-select.tsx`

### State (`src/stores/`)

- `chatStore.ts` — Messages, conversationId, streaming state. Zustand + localStorage. Actions: send, edit, regenerate, truncate, feedback.
- `scanStore.ts` — Scan results, compliance reports. Zustand + localStorage.

### Hooks (`src/hooks/`)

- `use-chat.ts` — Streaming chat (sendMessage, regenerate, editAndResend, stopStreaming)
- `use-chat-sync.ts` — Server persistence (auto-save 3s debounce, sendBeacon on unload, conversation CRUD)
- `use-animated-number.ts`, `use-keyboard-shortcuts.ts`, `use-i18n.ts`

---

## Data Model (75 Prisma models)

**Identity**: User (aiCreditsUsed, bonusCredits, creditResetAt, isMasterAdmin), PasswordReset, CreditGrant

**Multi-tenancy**: Workspace, WorkspaceMember (role: OWNER/ADMIN/MEMBER/VIEWER), WorkspaceFeature

**Scanning**: Site, Scan (score, violations JSON, screenshot), Violation (status lifecycle), Schedule, Monitor, CrawlJobRecord (durable job state)

**AI**: AiEvent (every API call: model, tokens, cost, latency), AiMemory (user/workspace preferences), ChatConversation, ChatMessage (server-persisted chat history), AgentBlueprint, AgentConversation, AgentMessage, AgentSchedule, AgentScheduleRun

**Compliance**: ComplianceProof (hash chain: prevHash, chainIndex, anchoredAt), ComplianceRule, GuardPolicy

**Risk**: LitigationRiskScore, LitigationWeight

**Integrations**: Integration, Webhook, ApiKey (SHA-256 hash, prefix), AuthConfig (encrypted credentials), NotificationPreference

**SSO**: SSOConnection, SsoDomain, VerifiedDomain, SsoRoleMapping, SsoAttributeMapping, SsoConnectionAudit, ServiceAccount

**Agency**: Agency, AgencyClient, AgencyApiKey

**Content**: Article, ArticleVersion

**Analytics**: AuditLog, ConversionEvent, AccessRequest, RumEventRecord, FixOutcomeRecord, VendorObservation

---

## Key Architectural Decisions

1. **JWT sessions (not DB)** — 24h expiry, revocation via `sessionsRevokedAt` timestamp check. Tradeoff: faster auth, but revoked users retain access up to 24h.

2. **AI gateway abstraction** — `src/lib/ai/gateway/` provides a provider-agnostic `complete()` / `stream()` / `embed()` API. Models registered in `providers/registry.ts` with pricing. Cost calculated per-call and logged to `AiEvent`.

3. **Crawl architecture** — `after()` runs the crawl asynchronously after the POST response. Progress persisted to `CrawlJobRecord` every 2.5s. Client polls the durable record (SSE is unreliable on serverless). Stale-job recovery at 65s marks abandoned crawls as failed.

4. **Chat persistence** — Client uses Zustand + localStorage for instant session persistence. `useChatSync` hook auto-saves to server (3s debounce after streaming completes). `sendBeacon` on tab close ensures no data loss.

5. **Workspace isolation** — All data queries include `workspaceId` filter. `requireWorkspacePermission()` resolves the caller's workspace and role before any data access. API keys are scoped to the workspace they were created in.

6. **Feature gates** — `WorkspaceFeature` table + `requireFeature()` middleware. Features tied to plan (FREE/PRO/ENTERPRISE). Master admins bypass all gates.

---

## Build & Test Commands

```bash
npx tsc --noEmit          # Gate 1: zero TypeScript errors
npx vitest run            # Gate 2: 1,150 tests must pass
npx next build            # Gate 3: production build must succeed
npx playwright test       # E2E: smoke tests (runs in CI)
```

All 3 gates must pass before push. E2E runs automatically in CI on every PR.

---

## Environment Variables

Required: `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`

AI: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` (at least one required for AI features)

Optional: `SENTRY_DSN`, `REDIS_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SMTP_*`, `CRON_SECRET`

Never commit `.env` files. All secrets in Vercel environment settings.
