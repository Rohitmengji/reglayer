# RegLayer — Codebase Guide

> **Last updated**: 2026-07-16 | **Stats**: 87 pages, 180 API routes, 75 Prisma models, 1,150 tests

This is the authoritative map of the RegLayer codebase. AI agents and developers should read this BEFORE exploring the repo.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 22 (minimum 22.17); local and CI pins aligned with locked AI/browser dependencies |
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

**Production deployment**: Vercel's Git integration owns automatic deployment of
`main`. `.github/workflows/deploy.yml` is a main-only `workflow_dispatch` fallback,
not a second automatic deployment after CI. Keep PR checks as the merge gate and
verify the exact commit's Vercel status before requesting a manual rebuild.

---

## Directory Structure

### Pages (`src/app/`) — 87 pages

**Public (no auth):** landing `/`, pricing, features, standards, docs, api-reference, contact, blog, privacy, terms, cookie-policy, auth/login, auth/register, verify/[proofId]

**SEO and indexing (September 21)**: `src/lib/seo.ts` owns the reviewed public
route list, protected page roots, canonical origin, and public/private metadata
builders. `SITE_URL` (fallback `NEXT_PUBLIC_APP_URL`, then the current production
domain) is separate from `NEXTAUTH_URL`. Vercel production may index; previews
and development may not. Self-hosted production requires
`SEO_INDEXING_ENABLED=true`; `false` always disables indexing. Root metadata is
noindex, and public pages explicitly opt in. Proxy response headers also enforce
private/noncanonical-host noindex, permit robots/sitemap/manifest and published
blog URLs, and rewrite unknown roots to `not-found-page` for a genuine 404.
`src/lib/blog/public-articles.ts` shares publication-aware reads across the
server blog index, article metadata, and sitemap. `scripts/seo-audit.mjs
--production` builds and audits a temporary credential-free copy. See
[SEO_AUDIT.md](SEO_AUDIT.md) for coverage, environment settings, and limits.

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

**AI boundary contracts (September 21 audit)**: `ai/mcp/server.ts` resource/tool
calls require an authorized workspace; vector search requires `workspaceId`, and
hybrid retrieval rejects absent scope. The legacy RAG helper now requires a
workspace option. AI tool creator fallback is restricted to workspace-less scans.
`/api/ai/explain` validates requests and availability before credits and attempts
refunds for null/failed generation. `/api/workflows/builder/run` is explicitly a
validated structure preview (`executed: false`), not an executor. Agent run
admission uses selected-workspace `scans.view` / `scans.run` permissions.
See [ENTERPRISE_AUDIT.md](ENTERPRISE_AUDIT.md) for tests and unresolved boundaries.

**Release acceptance contracts (September 21 follow-up)**: `/api/v1/*` sessions
reuse `requireWorkspacePermission`; agent/workflow/embed execution requires
`scans.run`, other current v1 operations require `scans.view`. API keys retain
their own workspace and require a current creator membership/role. Explicit
invalid credentials do not fall back to cookies. The proxy delegates only the
seven exact reviewed v1 paths to this gateway, preserving session CSRF checks.
Key authentication queries the unique full SHA-256 hash as well as prefix/expiry.
v1 feedback reads pass workspace scope; global proposal counters are `null` for
tenant clients. `getBlueprint(slug, workspaceId)` admits owned/public/system
definitions only; A2A turns and handoffs use persisted conversation scope.
See [RELEASE_ACCEPTANCE_REPORT.md](RELEASE_ACCEPTANCE_REPORT.md) for the final
checklist, 2,094-unit/25-browser/63-PostgreSQL verification and withheld release.

**Scanner**: `scanner/browser/launch.ts` (Playwright/puppeteer dual-mode), `scanner/crawler/siteCrawler.ts` (BFS engine), `scanner/crawler/job-manager.ts` (in-memory + durable state), `scanner/pipelines/scanPipeline.ts` (axe-core execution), `scanner/auth.ts` (form/cookie/header auth)

**Auth**: `auth/config.ts` (NextAuth), `auth/rbac.ts` (role checks), `auth/api-guard.ts` (requireWorkspacePermission), `auth/api-key.ts` (SHA-256 key auth), `auth/access.ts` (resource-access asserts)

**Member invitations (September 21)**: `auth/invite-credential.ts` issues one
expiring temporary password per invited account, stored as a bcrypt hash in the
existing `password_resets` table behind an `invite$` tag so it can never be
redeemed as a reset code (and a reset code can never be used as a password). No
schema change was required. `/api/team` POST creates the credential only when it
can be delivered, emails it through `buildTeamInviteEmail`, retires it when
sending fails, and never returns it to the inviter. Without SMTP, development
prints it to the server console and production reports the invitation as
undeliverable. Sign-in accepts the credential only when the account has no
password of its own and marks the session `mustSetPassword`; the proxy then
allows just `/auth/set-password` and `/api/account/set-password` until the
member chooses a password, after which the token heals itself.

**Selected workspace**: `auth/workspace-selection.ts` reads the HttpOnly
`reglayer-workspace` cookie using async `cookies()`. Shared permissions/features,
default workspace lookup, scan-role limits, dashboard/history and AI retrieval
use the selected membership; only an absent selection defaults to the earliest
membership. Invalid selections fail closed. `/api/workspaces` returns
`activeWorkspaceId` and `selectionInvalid` for the sidebar. Confirmed switches
clear local scan/chat state and broadcast a dashboard reload to other tabs.
Retrieval cache namespaces include user/workspace/scan/settings. Team now uses
selected membership for all methods and the selected workspace plan for seats.
Direct member-password reset is system-admin-only, selected-workspace-scoped,
and revokes sessions. This migration is incomplete: SSO and other direct
membership resolvers remain separate, and saved chat history is still personal.
See the September 21 follow-up in
[PRODUCT_AUDIT.md](PRODUCT_AUDIT.md) for the exact scope and remaining blockers.

**Credits**: `credits/index.ts` (check/consume/refund), `credits/plan-limits.ts` (FREE/PRO/ENTERPRISE limits)

**Jobs**: `jobs/queue.ts` is a pg-boss foundation for short transactional database
tasks: explicit connection, migrations disabled, versioned reference-only
payload, atomic enqueue via caller transaction, bounded retries and singleton
workspace concurrency. It is not wired into browser crawls or deployed workers.

**Crawl checkpoints**: `scanner/crawler/page-checkpoint.ts` defines stable page
identity and versioned snapshot validation. `src/services/crawlPageService.ts`
loads or atomically persists a scan, violations, and checkpoint through the
existing `scanService.persistScan` mapping. `CRAWL_PAGE_CHECKPOINTS_ENABLED=true`
opts the crawler into replay; it defaults off and requires the additive migration.

**Crawl ownership**: `src/services/crawlAttemptService.ts` implements database-clock
leases, monotonic generation/token fencing, renewal, and terminal writes inside
short job-row-lock transactions. Page execution/persistence requires current
ownership when a lease row exists. No HTTP executor or hosted worker claims leases
yet; legacy route progress/finalization is not lease-aware. Both checkpoint and
lease SQL migrations are prerequisites for enabling checkpointing.

**Owned execution**: `src/services/crawlExecutor.ts` claims, renews serially, and
aborts on ownership loss or shutdown with a conservative monotonic watchdog.
`src/services/ownedCrawlService.ts` invokes the crawler with forced checkpointing,
an internal ownership token, and an AbortSignal, then performs fenced settlement
with page counters. `scanner/browser/lifetime.ts` owns and closes browsers on abort.
Scanner, screenshot, pipeline and discovery paths propagate the signal. No HTTP
or queue dispatcher invokes the owned service yet; durable config/discovery and
cross-instance progress are unfinished.

**Key patterns**: Every authenticated API route calls `requireWorkspacePermission()` or checks `getServerSession()`. Workspace-scoped data always filters by `workspaceId`. Rate limiting via `applyRateLimit()`.

### Components (`src/components/`) — 22 directories

**AI chat**: `ai/ChatPanel.tsx` (slide-out panel), `ai/ChatMessage.tsx` (markdown + code blocks + actions), `ai/ChatInput.tsx` (composer with focus ring, char count)

**Layout**: `layout/app-shell.tsx` (auth gate, sidebar, chat FAB), `layout/sidebar.tsx` (nav sections with feature gates)

**Scanner**: `scanner/scan-form.tsx`, `scanner/violation-card.tsx`, `scanner/scan-auth-section.tsx`

**UI primitives**: `ui/button.tsx`, `ui/card.tsx`, `ui/badge.tsx`, `ui/input.tsx`, `ui/info-hint.tsx`, `ui/feature-gate.tsx`, `ui/modern-select.tsx`

**Viewing preferences**: `a11y/viewing-preferences.tsx` keeps one widget in
`ViewingPreferencesHost`. The app shell supplies its header slot via context;
the widget is portaled there, inline on mobile and floating on desktop. Public
pages retain the global floating widget. Chat uses the same responsive header
area so mobile launchers no longer cover primary actions.

**Audit follow-up (September 21)**: the status-reason editor in
`EnhancedViolationCard` is a native modal with keyboard wrap, unique labels,
success-only dismissal and retained failed drafts. `/api/workspace/features`
publishes selected-membership capabilities from existing RBAC; `useFeatures`
invalidates identity/revision-scoped scan permission on refresh, fails closed,
and supports retry. AppShell distinguishes failed/throttled workspace checks
from genuinely missing membership. Settings labels user-plan allowances as
account scope; this does not change billing policy.

**Shared request follow-up (September 21)**: `FeaturesProvider` is mounted once
inside the existing QueryClient/Session providers. `useFeatures` reads its context;
all consumers share a single TanStack Query request, keyed by auth status, identity,
master status and invalidation revision. Explicit invalidation/retry discards old
access; background refresh keeps feature content mounted but disables scan access
until fresh capabilities arrive. Requests time out after 15 seconds, do not retry
automatically, refresh every 60 seconds while active, and revalidate stale data
on focus. Query data is not persisted and unused entries have zero GC retention.
The two sidebar instances also share an identity-keyed workspace-list query;
only a successful server switch updates selection, followed by existing state
clearing and cross-tab navigation. `/api/workspaces` is private/no-store.

Measured initial dashboard feature requests fell from six to one. Browser and
real-backend tests both assert one initial feature request and one workspace-list
request. Five focused unit cases cover duplicate consumers, invalidation/retry,
late old-account responses, master bypass and preservation of drafts on background
refresh. Latest snapshot: 2,163 units/176 files, 42 isolated browser journeys,
four real-backend journeys, types, scoped lint and isolated production build pass.

`/api/audit-log` now requires selected-workspace `scans.view`, validates bounded
pagination, scopes both count and rows even for master administrators, omits raw
metadata and reduces URL targets to origins. The UI uses safe summaries and a
bounded retry state, retaining the last successful page when pagination fails.
Stored events are unchanged. The PDF now describes automated evidence, and
VPAT HTML/Markdown is prominently a draft with catalog limits. Level A drafts
exclude AA criteria; unevaluated manual criteria prevent an overall Supports
verdict when no failures are detected.

Chat unload saving now shares `persistConversation` serialization/known-ID
deduplication rather than issuing a separate create request. The sync hook adopts
known IDs even on skipped saves and passes the current version. Keepalive remains
best-effort, not a guarantee of delivery after a browser process exits.

Follow-up verification snapshot: TypeScript, 2,144 units/174 files, isolated
production build, 42 isolated browser journeys, 63 PostgreSQL regressions, and
four real customer journeys passed. Follow-up scoped lint: zero errors/warnings.
The real runner now uses two workspaces, three users, separate synthetic client
IP rate-limit budgets, and non-delivering loopback SMTP. It tests successful PDF
text/VPAT HTML, proactive viewer restrictions plus direct API denial, core
cross-tenant reads/writes, and owner/viewer workspace switching. See
REAL_USER_AUDIT.md for failures repaired during testing and unverified limits.

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

**Scanning**: Site, Scan (score, violations JSON, screenshot), Violation (status lifecycle), Schedule, Monitor, CrawlJobRecord (durable job state), CrawlPageCheckpoint (opt-in atomic page replay), CrawlAttemptLease (internal fenced ownership; additive migrations required)

**AI**: AiEvent (every API call: model, tokens, cost, latency), AiMemory (user/workspace preferences), ChatConversation, ChatMessage (server-persisted chat history), AgentBlueprint, AgentConversation, AgentMessage, AgentSchedule, AgentScheduleRun

**Compliance**: ComplianceProof (hash chain: prevHash, chainIndex, anchoredAt), ComplianceRule, GuardPolicy

**Risk**: LitigationRiskScore, LitigationWeight

**Integrations**: Integration, Webhook, ApiKey (SHA-256 hash, prefix), AuthConfig (encrypted credentials), NotificationPreference

**SSO**: SSOConnection, SsoDomain, VerifiedDomain, SsoRoleMapping, SsoAttributeMapping, SsoConnectionAudit, ServiceAccount

**Agency**: Agency, AgencyClient, AgencyApiKey

**Content**: Article, ArticleVersion

**Analytics**: AuditLog, ConversionEvent, AccessRequest, RumEventRecord, FixOutcomeRecord, VendorObservation

---

## Public Docs And Notifications (September 21)

- Public guides now share `src/lib/docs/content.ts` and
	`src/components/docs/docs-article.tsx`, with all six explicit URLs preserved.
	The hub searches the same content. Guides include quick starts, section links,
	review dates and real destination links; plan values derive from `PLAN_LIMITS`.
- `use-notifications.ts` stores explicit read IDs per account/server feed scope,
	syncs local consumers/tabs, and exposes loading/error/retry/storage-failure states.
	`notification-bell.tsx` marks read only on explicit item/bulk actions, keeps the
	action above the scrolling list, and handles nested Escape/focus. "View activity"
	accurately names the audit-log destination. No cross-device persistence or deletion.
- `/api/notifications/feed` now uses the selected-workspace `scans.view` guard,
	shared workspace scan scope, preference filters and private no-store response.
	It does not provision workspaces or write notification records.
- Verification: 14 focused tests, TypeScript, latest 2,009 unit tests/165 files,
	all 23 isolated product browser journeys, targeted lint (zero errors/warnings),
	and an isolated production build passed. Browser checks include notification
	state/refresh/error/reload/focus plus all guides at 390/1440px with zero axe
	findings in the tested regions. Synthetic-session API interception prevented
	real mutations; shared-browser docs were also re-browsed read-only.
- `.gitignore` now anchors private notes to `/docs/`; the earlier unanchored rule
	hid application docs source and caused a release-copy build failure. The fixed
	build used only Git-visible source. No commit, push, deployment or DB migration.
	See PRODUCT_AUDIT.md for remaining limits and the maintenance checklist in
	CONTRIBUTING.md; tests cannot verify every prose claim automatically.

## Key Architectural Decisions

1. **JWT sessions (not DB)** — 24h expiry, revocation via `sessionsRevokedAt` timestamp check. Tradeoff: faster auth, but revoked users retain access up to 24h.

2. **AI gateway abstraction** — `src/lib/ai/gateway/` provides a provider-agnostic `complete()` / `stream()` / `embed()` API. Models registered in `providers/registry.ts` with pricing. Cost calculated per-call and logged to `AiEvent`.

3. **Crawl architecture** — admission requires a successful `CrawlJobRecord` write before scheduling `after()`; persistence failure returns 503. Progress is persisted every 2.5s. Progress, finalization, and cancellation writes require a still-processing record. The DB fallback status path conditionally persists failure after a 65s stale heartbeat and re-reads concurrent changes. Partial live snapshots are not returned as terminal results. Opt-in page checkpoints reuse committed results and deduplicate scan/violation persistence per workspace/job/URL. The flag defaults off pending migration; discovery and execution remain function-bound without automatic resume. The jobs/queue.ts foundation is not yet connected to browser execution.

4. **Chat persistence** — Client uses Zustand + localStorage for instant session persistence. `useChatSync` hook auto-saves to server (3s debounce after streaming completes). `sendBeacon` on tab close ensures no data loss.

5. **Workspace isolation** — All data queries include `workspaceId` filter. `requireWorkspacePermission()` resolves the caller's workspace and role before any data access. API keys are scoped to the workspace they were created in.

6. **Feature gates** — `WorkspaceFeature` table + `requireFeature()` middleware. Features tied to plan (FREE/PRO/ENTERPRISE). Master admins bypass all gates.

---

## Build & Test Commands

```bash
npx tsc --noEmit          # Gate 1: zero TypeScript errors
npx vitest run            # Gate 2: every test must pass
npx next build            # Gate 3: production build must succeed
npm run test:postgres     # Isolated real-PostgreSQL crawl lifecycle tests
node scripts/test-postgres.mjs --walkthrough # Opt-in real login/scan/PDF UI flow
npx playwright test       # E2E: smoke tests (runs in CI)
```

All 3 gates must pass before push. E2E runs automatically in CI on every PR.

The opt-in walkthrough runs a temporary app and disposable PostgreSQL, seeds only
local owner/viewer fixtures, and makes one real scan request to example.com. It
does not load application environment files or model credentials. Its actual UI
login, onboarding, scan persistence, PDF, status update, denied viewer scan, and
AI-unavailable checks are distinct from the API-intercepted product regressions.
See CONTRIBUTING.md for prerequisites, cleanup, and schema-fixture limitations.

The September 21 browser-first walkthrough is recorded in
[REAL_USER_AUDIT.md](REAL_USER_AUDIT.md): scoped workflow/trust/accessibility
fixes, eight new real-user UI regressions, 34 passing isolated browser journeys,
two real owner/viewer journeys, 63 PostgreSQL tests, and explicit unverified
provider/production requirements. Final type, 2,126-unit/173-file, and isolated
production-build gates passed; scoped lint retained nine warnings.

The September 20 product audit is documented in [PRODUCT_AUDIT.md](PRODUCT_AUDIT.md),
including its complete 22-phase coverage matrix and remaining release blockers.
`node scripts/product-audit.mjs` performs a local-only, API-intercepted browser
sweep with responsive screenshots in the gitignored `visual-audit/` directory.
`npx playwright test e2e/a11y.spec.ts --grep 'Isolated product'` runs twenty-one
synthetic-session user-journey regressions without production API mutations.

The fresh daily-workflow red-team report is [UX_RED_TEAM_REPORT.md](UX_RED_TEAM_REPORT.md).
The runner now discovers section navigation links: 126 page/section URLs at
three widths. `confirm-dialog` accepts `busy` and initially focuses Cancel for
destructive actions. Settings and shared section navigation use URL history with
visible mobile labels. Scan history titles open operational `/scans/[id]` details;
report links remain secondary. Onboarding is dashboard-only, inline and collapsed.
Recommendations are capped at three, with findings scoped to the latest completed
scan; violation filters accept validated single/multiple impact values. The final
local snapshot passed TypeScript, 1,992 unit tests/164 files, 21 isolated browser
journeys and an isolated production build. This is not live integration or WCAG
certification; the report documents failures, retries and remaining limitations.

September 21 selected-workspace verification: TypeScript, 1,955 unit tests in
158 files, all ten isolated browser journeys, and an isolated production build
passed. The build used a temporary copy without application environment files,
restricted environment variables, and a loopback placeholder database. The
live dev server and production database were untouched. Targeted lint had zero
errors and four existing unused-import warnings in the retrieval pipeline.

Local verification on September 20, 2026: Node 22.23.2, TypeScript and production
build passed; 1,885 tests passed across 153 files, including 20 crawl lifecycle
regressions. Repository lint reported 0 errors and 275 warnings; the changed
crawl files passed targeted lint without warnings. The build used local-only
placeholder configuration. No real database integration, browser E2E, worker
crash recovery, or production deployment was exercised by this verification.

A subsequent integration milestone adds `scripts/test-postgres.mjs`,
`vitest.postgres.config.ts`, and `integration/crawl.test.ts`. Fourteen tests run
actual crawl handlers and Prisma queries against disposable PostgreSQL 18.4,
using row locks and constraint failures rather than mocked database responses.
The fixture derives crawl columns from Prisma schema metadata; no application
database URL, full migrations, pgvector, or secondary indexes are used. The
runner stops and removes its temporary database. CI runs it separately from
unit coverage. Auth/browser services are stubbed; execution resumption, real
browser work, Neon behavior, and migration deployment remain unverified.

Integration-milestone verification: TypeScript, all 1,900 unit tests in 154
files, all 14 PostgreSQL integration tests, targeted ESLint, and documentation
links passed. CLI database overrides were rejected; deliberately invalid
external URLs in the environment did not redirect the runner. Temporary data
cleanup was checked. No existing dependency versions changed. The production
build was not rerun for this test-only change with production-backed local
configuration; the earlier build result above is a separate milestone.

Durable-worker foundation verification: 1,922 unit tests across 156 files,
TypeScript, targeted queue lint, and a production build in a temporary source
copy without environment files or hosted-service credentials passed. The totals
include other concurrent work; seven unit tests were added for the queue adapter.
The PostgreSQL suite now contains 21 tests: fourteen crawl tests plus seven
queue tests, including an actual SIGKILL/replacement-worker test, transaction
rollback, bounded retries, cancellation, and two-process workspace limits.
Queue schema migration occurs only in the disposable fixture. The runner was
also checked with a deliberately failing suite: failures now correctly exit 1
after cleanup rather than being masked by the embedded database shutdown hook.
pg-boss is pinned to 12.33.2; installation updated compatible pg, cron-parser,
pg-connection-string and pg-protocol lockfile versions. No crawl integration,
production migration, hosted worker deployment, or browser retry safety is
claimed. See CONTRIBUTING.md for transaction and retention boundaries.

September 21 page-checkpoint milestone: `prisma/migrations/add_crawl_page_checkpoints.sql`
adds the table, unique scan key, and cascading references; it was applied twice
only in disposable PostgreSQL to test repeatability. `integration/crawl-pages.test.ts`
adds 17 database cases including eight simultaneous attempts, atomic rollback on
constraint failures, replay after reconnect, tenant checks, cancellation ordering,
snapshot corruption, and deletion cascades. `integration/fixtures/crawl-schema.ts`
shares the structured partial-schema fixture with the existing crawl tests.
Verified: 1,951 unit tests/158 files, 38 PostgreSQL tests/3 files, TypeScript,
Prisma schema validation/generation, and an isolated production build passed.
Targeted lint: zero errors, one existing unused-import warning in siteCrawler.ts.
Totals include concurrent changes outside this milestone. No hosted migration,
feature activation, browser end-to-end checkpoint test, or auto-resume is claimed.

September 21 attempt-fencing milestone: additive `add_crawl_attempt_leases.sql`
was applied twice only to disposable PostgreSQL. Sixteen new database cases cover
competing claims, takeover, renewal/expiry, forged/missing credentials, wrong
workspace/terminal jobs, final-check rollback, a writer blocked behind takeover,
and a late scan callback whose replacement already committed. Page identity is
stable across generations. Verification: 1,956 unit tests/158 files, 54 PostgreSQL
tests/3 files, TypeScript, Prisma validation, and an isolated production build
passed. Targeted lint had zero errors and one existing crawler import warning.
The page transaction now locks the job exclusively, intentionally serializing
short per-job writes with claims. This fences participating database operations,
not network effects or legacy route writes; no automatic renewer, scheduler, live
lease claim, production migration, or browser-worker activation was added.

September 21 owned-executor milestone: automatic serial renewal, conservative
watchdog, shutdown/lease-loss aborts, and a separate internal owned crawl entry
point are implemented. The scanner, screenshot fallback, and discovery close
owned browsers on abort. Page timeouts now abort their scan instead of abandoning
the work. Fenced finalization includes validated page totals; partial/failed
coverage is not labeled complete by the owned entry point.

Verified 1,981 unit tests/161 files, 63 integration tests/4 files, TypeScript,
targeted lint (zero errors, one existing crawler warning), and an isolated Next
production build without environment files or hosted credentials. This step adds
23 unit tests and nine real Chromium/PostgreSQL cases on an ephemeral loopback
site. Cases include renewal during hung navigation, persisted cancellation,
takeover, screenshot/discovery aborts, full one-page owned completion, and page
replay by a replacement after interruption. The browser replay case expires the
lease via test SQL, not process death; queue SIGKILL tests remain separate.

`npm run test:postgres` now requires installed Playwright Chromium. CI already
installs it. Browser credentials and external targets are not used. No live
executor, dispatcher, extra migration, hosted setting, or feature flag was enabled.
Configuration/discovery persistence, fenced progress, retry policy and hosted
dispatch remain release prerequisites; the legacy HTTP executor is unchanged.

The gitignored root `push-personal.sh` helper automates these gates followed by
a staged-file commit, feature-branch push, and PR creation. It verifies the
personal Git author/committer and GitHub account/email before any push; it never
auto-merges. Setup and usage are documented in `CONTRIBUTING.md` under Git Workflow.

---

## Environment Variables

Required: `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`

AI: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` (at least one required for AI features)

Optional: `SENTRY_DSN`, `REDIS_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SMTP_*`, `CRON_SECRET`

Never commit `.env` files. All secrets in Vercel environment settings.
