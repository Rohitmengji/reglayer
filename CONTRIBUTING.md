# Contributing to RegLayer

## Quick Start

Use Node.js 22 (at least 22.17), matching `.nvmrc` and CI. The locked AI SDK and
Chromium dependencies no longer support Node 20. Select this runtime with your
version manager before installing dependencies. Node.js 24+ is also supported
by the package engine declaration, but the verified local/CI baseline is Node 22.

```bash
# 1. Install dependencies
npm ci

# 2. Set up environment
cp .env.example .env.local
# Fill in DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL

# 3. Generate Prisma client
npx prisma generate

# 4. Run database migrations
npx prisma migrate dev

# 5. Start dev server
npm run dev
```

## Release Dependency Notes

The September 2026 release uses Next.js and eslint-config-next 16.3.5,
Nodemailer 9.1.1 or newer in its current major, and Sharp 0.35.4. The
`deepmerge-ts` 8.0.2 and `mysql2` 3.24.4-or-newer overrides address vulnerable
transitive pins without downgrading Prisma 7 or NextAuth 4. Prisma config/schema
validation, client generation, and the release test gates must pass when these
overrides change. `npm audit --omit=dev --audit-level=high` is the production
dependency gate; a passing result does not assert that development-only
dependencies have no advisories.

## Public Documentation Maintenance

The six public `/docs/*` guides and docs-hub summaries share
`src/lib/docs/content.ts`. Explicit route files remain thin wrappers around
`src/components/docs/docs-article.tsx`; preserve these URLs when editing content.
`DOC_PLAN_ROWS` derives quotas from `PLAN_LIMITS` rather than duplicating numbers.
The root `/docs/` folder contains local internal notes and is gitignored; source
folders named `docs` are not ignored.

For changes to navigation, authentication, scan options, plans, permissions,
notifications, reports, or API contracts:

1. Trace the deciding code and update the relevant guide in the same change.
2. Keep quick-start steps and destination links actionable. Distinguish feature
  availability, delivery dependencies, current limits, and unfinished workflows.
3. Update that guide's `reviewedAt` only after checking the behavior; it is a
  review date, not an automatic freshness claim.
4. Run `npx vitest run src/__tests__/docs-content.test.ts`. It checks guide URLs,
  section IDs, application destinations, shared quota values, and the CI example.
5. Run `npx playwright test e2e/a11y.spec.ts --grep 'documentation guides|notification bulk read'`
  against a local server. The synthetic API fixture avoids production mutations.
  Check screenshots and keyboard behavior, not only the test result.

The docs article deliberately uses labeled, focusable scroll regions for code and
wide tables. Its narrow ESLint role allowance preserves keyboard scrolling and
does not relax the rule elsewhere. Browser axe checks cover the rendered regions.
Long-form guide content is currently English; notification controls have entries
in all seven supported locale dictionaries. Do not imply translated guides exist.

Notifications remain a recent derived feed, not a durable cross-device inbox.
Explicit read IDs are browser-local, isolated by session identity and server-returned
user/workspace scope, and capped at 1,000. Opening does not mark read; the bulk
action marks only loaded IDs. The API must remain read-only, selected-workspace
authorized, and `private, no-store`. Never turn a failed fetch into an empty inbox.

## Project Structure

```
src/
├── app/                 # Pages & API routes (Next.js App Router)
│   ├── api/            # REST endpoints — thin, validation only
│   ├── dashboard/      # Protected app pages
│   └── auth/           # Login/signup flows
├── components/          # React components
│   ├── ui/             # Primitives (Button, Card, Input, etc.)
│   ├── layout/         # Shell, navigation, sidebar
│   └── scanner/        # Scan-specific widgets
├── lib/                 # Core business logic (NO React here)
│   ├── scanner/        # axe-core engine, pipelines, severity
│   ├── compliance/     # WCAG rule evaluation
│   ├── auth/           # NextAuth config
│   ├── database/       # Prisma client
│   ├── email/          # Nodemailer service
│   ├── integrations/   # Slack, GitHub, Jira connectors
│   ├── intelligence/   # AI + analytics engines
│   ├── credits/        # Plan limits, usage tracking
│   ├── rate-limit.ts   # IP-based rate limiter
│   └── validations/    # Zod schemas (shared with API)
├── services/            # Orchestration (calls lib/ modules)
├── stores/              # Zustand client state
└── types/               # Shared TypeScript types
```

## Conventions

### API Routes

- **Thin routes** — Validate input with Zod, delegate to services/lib, return JSON.
- **Auth first** — Every protected endpoint starts with:
  ```ts
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  ```
- **Workspace scoping** — Data queries must be scoped to user's workspace:
  ```ts
  const membership = await prisma.workspaceMember.findFirst({
    where: { user: { email: session.user.email } },
    select: { workspaceId: true },
  });
  ```
- **Rate limiting** — Apply to expensive endpoints (scan, crawl, AI):
  ```ts
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = rateLimit(`key:${ip}`, RATE_LIMITS.scan);
  ```
- **Error shape** — Always return `{ error: string }` with appropriate HTTP status.

### Components

- Use `"use client"` only when component needs hooks/interactivity.
- Server Components by default for data fetching pages.
- UI primitives live in `src/components/ui/`.
- Feature-specific components go in named folders (`components/scanner/`, etc.).

### Styling

- **Tailwind CSS v4** with custom dark variant: `@custom-variant dark (&:where(.dark, .dark *))`.
- Dark mode classes: `dark:bg-neutral-950`, `dark:text-white`, etc.
- Styles that apply to base elements go in `@layer base` in `globals.css`.
- Never write unlayered global selectors (they override Tailwind utilities).

### Database

- Prisma 7 with `@prisma/adapter-pg` (Neon serverless).
- Schema lives in `prisma/schema.prisma`.
- After schema changes: `npx prisma migrate dev --name describe-change`.
- Generated client at `src/generated/prisma/`.

### Testing

```bash
npm test        # Watch mode
npm run test:run # CI mode (single run)
```

- Test files: `src/__tests__/*.test.ts`
- Use Vitest + jsdom environment.
- Mock Prisma with `vi.mock("@/lib/database/prisma")`.

The crawl lifecycle regression suite is `src/__tests__/crawl-api.test.ts`:

```bash
npx vitest run src/__tests__/crawl-api.test.ts
```

It covers failed job admission, delayed progress writes, stale-job recovery,
late finalization, and cancellation races with mocked persistence. It does not
replace PostgreSQL integration tests or worker-crash tests in a staging environment.

The real PostgreSQL suite runs separately:

```bash
npx playwright install chromium
npm run test:postgres
```

This command starts an ephemeral PostgreSQL 18.4 process on a randomly selected
loopback port, creates an empty test database, and removes it when the run ends.
It ignores application database URLs and environment files; do not pass a Neon
URL. No Docker, administrator privileges, or existing PostgreSQL installation
is needed. Run it as a non-root user with dependency install scripts enabled.
The exact-version embedded database package uses prerelease npm versioning;
it is development-only, not a production database dependency.

`integration/crawl.test.ts` invokes the real crawl route handlers and Prisma
queries. A separate SQL connection holds row locks until PostgreSQL reports
the route's write is blocked. The tests verify rejection, terminal-state races,
heartbeat recovery, and persistence across reconnection. Authentication and
browser execution are stubbed, so these are not authorization or browser E2E tests.

`integration/owned-crawl.test.ts` additionally uses real local Chromium against
an ephemeral loopback HTTP server, with real leases and page persistence in the
disposable database. No public websites, application login, or production API is
used. Browser installation is required; these tests are not silently skipped when
Chromium is missing. CI already installs Chromium before the integration step.

The fixture derives the required crawl/scan/violation columns, enums, and primary
keys from the checked-in Prisma schema using the matching schema SDK. The page
checkpoint suite applies the actual additive checkpoint SQL, including its
unique index and foreign keys. It intentionally does not apply the full migration
chain or unrelated models and omits the unused optional violation embedding
column because pgvector is not installed. Existing scan workspace/user/site
foreign keys and non-unique secondary indexes are not reproduced. Unsupported fixture
fields fail setup. CI runs this command after the unit coverage suite.

### Isolated Real-User Walkthrough

```bash
node scripts/test-postgres.mjs --walkthrough
```

This explicit opt-in runs `integration/browser-user.test.ts` instead of the
default PostgreSQL suites. It creates owner and viewer accounts in disposable
PostgreSQL and starts a separate Next.js app on a random loopback port. Source,
dependencies, and the generated Prisma client are copied to a temporary directory;
application environment files and hosted-service credentials are excluded.
The running dev server and its database are not used. SMTP is forced to a
non-delivering loopback transport so development preview-email fallback cannot
contact an external service. Each synthetic customer context uses a distinct
documentation-range forwarded IP to avoid pooling all journeys into one quota;
rate limits remain active. Workspace-switch confirmations are accepted explicitly.

Temporary source copies must honor working-tree deletions: `git ls-files --cached`
can still list a tracked file that no longer exists. Skip missing source paths;
never restore another session's deleted file just to build a snapshot.

For browser tests against an independently started isolated app, set
`E2E_BASE_URL=http://127.0.0.1:<port>`. An explicit URL disables automatic dev-server
startup in the Playwright configuration. The isolated product fixtures require a
local host, matching synthetic `NEXTAUTH_SECRET`, and intercepted APIs. Do not use
production URLs or live credentials to bypass a failing shared dev server.

Unlike the default integration suite, this walkthrough submits one real scan of
`https://example.com`. It uses the actual login, onboarding, scan, PDF download,
violation-status, workspace-switch, and AI-chat controls without API response mocks.
It also parses real PDF text, generates/downloads a VPAT draft, checks proactive
viewer restrictions, and attempts forbidden core reads/exports/writes as a separate
tenant. The viewer's direct API denial is checked independently of disabled UI.
Model keys are
deliberately absent: the AI assertion verifies an unavailable-service response,
not answer quality. A fresh mobile viewer must receive a visible permission error
without creating a scan. Four real customer journeys run in this mode. Chromium
and network access to example.com are required. These core tenant checks are not
a complete endpoint/role matrix. The initial cold navigation has a separate
60-second compile budget; normal browser actions remain bounded to 20 seconds.

The schema-derived fixture supports scalar columns, enums, array defaults,
identities, and declared unique constraints. It does not reproduce the complete
migration chain, all relation constraints/indexes, pgvector, or Neon behavior.
Treat it as workflow evidence, not migration or production-readiness proof.
Screenshots and the downloaded PDF are stored under the ignored
`visual-audit/real-user-walkthrough/` directory. Temporary app/database processes
and data are removed on completion, with the test exit status preserved.

### Crawl Page Checkpoints

`CRAWL_PAGE_CHECKPOINTS_ENABLED` defaults to false. Leave it disabled until the
additive `prisma/migrations/add_crawl_page_checkpoints.sql` and
`prisma/migrations/add_crawl_attempt_leases.sql` have been reviewed and applied
to an isolated staging database, then verified before production approval.
The local application database may point to production: never run a reset,
`prisma migrate dev`, or schema push against it to install this feature. No hosted
database has been migrated or flag enabled by this implementation.

With the flag enabled, the crawl requires a resolved workspace. The page service
checks the job's active workspace before browser execution, then checks again
under a short exclusive job-row lock when committing. This orders checkpoint writes
against cancellation/finalization updates without holding a transaction during
browser work. Once an attempt lease exists, the exact live token and generation
are required for page execution and persistence; see the ownership contract below.

The page key hashes a versioned tuple of workspace ID, crawl job ID, and requested
URL. URL-parser equivalences are normalized; query order, fragments, trailing
slashes, and distinct jobs remain distinct. The key is internal and never replaces
authorization. Retries must reuse the original job ID and immutable crawl settings.

The saved scan, nested violations, and checkpoint commit together. Concurrent
attempts resolve to one authoritative scan; later callers receive its original
result rather than a newly computed result that differs from the database. A
saved checkpoint bypasses the scan callback. Screenshots are referenced from the
scan row, not duplicated in checkpoint JSON. Snapshots retain findings, node HTML,
and page metadata: treat them as sensitive scan data with the same retention and
access requirements. Unsupported snapshot versions fail closed.

With checkpointing enabled, persistence failures enter the existing page retry/error
path instead of being counted as successfully saved pages. With it disabled, the
legacy best-effort persistence behavior is preserved. The flag is server-controlled;
the request body cannot opt into it. Turning it off prevents new checkpoint usage
but does not delete stored data or change already-running crawls' captured config.

Limits: discovery state is not checkpointed, simultaneous initial attempts can
still execute the browser twice, and external effects are not exactly-once. No
queue dispatcher resumes browser crawls yet. Deleting a scan cascades to its
checkpoint; deleting a crawl removes its checkpoints but retains scan history.
Do not recycle deleted job IDs. Removing checkpoints also removes the ability to
replay those results, so retention must exceed the supported retry window.

### Crawl Attempt Ownership

`src/services/crawlAttemptService.ts` provides internal `claimCrawlAttempt`,
`renewCrawlAttempt`, `finishCrawlAttempt`, and `withCrawlAttempt` operations.
It is not an HTTP API, a scheduler, or a heartbeat loop. Callers must establish
the authenticated workspace and original immutable job configuration themselves.
No attempt token is accepted from the public crawl request body.

A claim locks an active, workspace-scoped job and inserts or replaces an expired
lease. Exactly one concurrent claimant wins. Each takeover generates a new UUID
token and increments the persisted generation. A live competing claim returns
null; wrong workspace and terminal jobs are rejected. Expiry uses PostgreSQL's
clock, not worker clocks. Lease duration defaults to 60 seconds and must be an
integer between 5 and 300 seconds. Renewal cannot resurrect an expired lease.

Page commits and fenced finalization use the same job-row lock as claim/renewal.
The lease is validated before and after the short transaction body; loss or expiry
rolls back its writes. This serializes page persistence per job, a correctness
trade-off rather than a throughput claim. A validated transaction can still take
time to commit after the final clock check, but no takeover can interleave while
its lock is held. All writers must follow this protocol for that ordering guarantee.

Committed page identity deliberately excludes attempt credentials so a replacement
can reuse earlier checkpoints. Missing or forged credentials cannot bypass a lease
by using the unleased page API. Unleased checkpointing remains available only for
jobs without a lease row. Read-only `loadCrawlPage` is an internal scoped lookup,
not a claim to execution ownership; execution goes through `getOrScanCrawlPage`.

The crawler can carry an internal `attempt` only when page checkpoints are enabled.
It passes that attempt to the page service. The existing request-bound route does
not claim/renew leases, and its legacy progress, stale recovery, and finalization
paths are NOT an owned-worker protocol. Do not attach a leased worker to that
executor or reset terminal jobs into processing. The separate internal owned
executor below must not be mixed with the legacy 65-second stale recovery path.

Cancellation or lease loss cannot undo a browser visit or cancel arbitrary external
side effects. A running scan may finish after ownership changes; its page commit
is rejected, including when a replacement has already saved a checkpoint. The
owned executor now renews and propagates aborts; discovery/configuration persistence,
restart scheduling, and hosted worker rollout remain separate work. Tokens/generations
must not be logged or put in public results. Lease rows cascade on job deletion;
never delete a lease to permit old workers or reuse a deleted job ID.

### Owned Crawl Executor

`src/services/crawlExecutor.ts` exposes `runOwnedCrawlAttempt` for internal tasks.
It claims a lease before work, renews serially at one third of the lease duration
(20 seconds by default), and returns busy without execution when another owner
holds the lease. Renewal failure or caller shutdown aborts the task and does not
permanently fail its job. The lease expires naturally so a later invocation can
recover it. A normal task error requests a fenced failed-state update using a
generic public error; infrastructure/finalization errors propagate, without an
unfenced fallback write.

A monotonic-clock watchdog starts before each database request and leaves a
conservative safety margin inside the lease duration. Late responses cannot
restart an aborted controller. Finalization waits for an in-flight renewal, stops
future renewal scheduling, and uses the existing token/generation guard. Timers
and listeners are removed on exit. This local watchdog complements, not replaces,
database-clock fencing. An in-flight database statement may still settle after a
client abort or response loss; callers must reconcile persisted state before
deciding to retry. An abort signal cannot forcibly stop arbitrary callback code.

`src/services/ownedCrawlService.ts` provides `executeOwnedCrawl`, which verifies the
persisted root URL, forces checkpointing, and supplies ownership plus an AbortSignal
to the real crawler. It stores results and validated page counters through fenced
finalization. Partial, launch-failed, and all-failed outcomes are not labeled
complete. Ordinary failures currently become terminal failures, not scheduled retries.
The caller still supplies non-persisted limits, auth and discovery settings: this
is an internal service, not an independently restartable durable job contract.

Scanner and screenshot calls accept an optional internal signal. Browser lifetimes
close their browsers on abort and on normal cleanup, including a launch that
resolves after cancellation. Page timeout now aborts the scan rather than leaving
an abandoned timeout race. Discovery fetches combine timeout and attempt signals;
aborted crawls stop scheduling pages and reject late results. Browser closure is
best-effort: launch itself and arbitrary external effects cannot be undone, and a
process-level kill remains a deployment backstop for an unresponsive browser.

Nine real-browser/database cases cover renewal during stalled navigation, shutdown,
persisted cancellation, takeover, successful scanning, screenshot/discovery abort,
a full owned one-page crawl, and replacement reusing a committed page. The replay
case accelerates lease expiry using test-only SQL; it is not a browser-worker
SIGKILL/restart test. The separate queue suite retains its genuine process-kill test.

Neither HTTP admission nor pg-boss dispatch invokes this service yet. Required
before rollout: immutable persisted crawl config and credential references,
durable discovery, fenced progress for cross-instance UI, explicit retry/recovery
policy, a separate non-transactional browser worker with bounded concurrency, and
approved staging migration/hosting/monitoring. Keep the checkpoint flag off until
both existing migrations are reviewed and applied. No new migration was needed
for the executor itself.

### Durable Worker Foundation

`src/lib/jobs/queue.ts` provides a pg-boss adapter for short, database-only
tasks. It is not imported by the crawl routes and does not change live crawl
execution. Normal construction requires an explicit PostgreSQL URL and disables
both queue schema creation and migrations. No hosted worker is provisioned.

The adapter accepts only a version, operation UUID, and workspace ID. Producers
must validate authorization separately and call `enqueueDatabaseTask` with the
same open database transaction that persists their application request. It must
not be given a general pool that can execute outside that transaction.

`workDatabaseTasks` runs each handler's database writes and its acknowledgement
in one transaction. All authoritative writes must use the supplied transaction,
and handlers must honor the abort signal. Do not run crawls, send emails, charge
payments, or call AI providers inside this transaction: external effects cannot
be rolled back, and long transactions consume connections and delay vacuum.

The queue must be explicitly provisioned with `DATABASE_TASK_POLICY` during a
separately reviewed deployment. Its singleton policy uses the workspace ID as
the key, enforcing one active queued job per workspace while allowing pending
jobs. Each worker process has two handlers and a maximum five-connection pool;
there is no global cap across different workspaces. Queue supervision and its
active-key cache refresh every ten seconds. Recovery latency includes expiry,
monitoring, retry delay, and polling, not only handler execution time.

Defaults: three retries with exponential backoff and jitter, retry-delay ceiling
of 60 seconds, 120-second active expiry, 30-second heartbeat, one-day pending-job
retention, and seven-day completed-job retention. Operators must alert on backlog
age before retention expires. Duplicate operation IDs are rejected only while
the queue record remains; durable business idempotency requires an application
constraint or ledger beyond queue retention. Failed work remains inspectable;
there is no automatic operator notification or replay UI in this milestone.

`npm run test:postgres` also runs `integration/queue.test.ts`. Its child worker
fixture is loopback-only and refuses standalone invocation. Tests kill an actual
worker process after an uncommitted write, verify rollback and automatic
redelivery to a replacement, exhaust retries, cancel in-flight work, and check
concurrency across two worker processes. Tests use shorter queue timeouts than
the defaults. The integration runner explicitly exits after teardown so the
embedded database's shutdown hook cannot mask a failing test exit code.

### Git Workflow

The personal helper `push-personal.sh` lives at the repository root and is
intentionally gitignored; it is not included in a fresh clone. This checkout's
helper uses `rohit mengji <rohitmengjih@gmail.com>` and the `Rohitmengji` GitHub
account, never `rohit.mengji@employinc.com` or work-account credentials.

Prerequisites: GitHub CLI (`gh`), the Node.js version in `.nvmrc`, `npm ci`, and
the environment variables described below. Authenticate in the browser using
the personal GitHub account; its email must be verified on GitHub.

```bash
# One-time login (tokens are not stored in the script)
gh auth login --hostname github.com --git-protocol https --web --scopes user:email

# Set this checkout's identity only; global Git settings are unchanged
bash push-personal.sh --setup

# Read-only preflight: identity, authenticated account/email, remote, tools
bash push-personal.sh --check

# Stage only the intended files, then run the automated flow
git add -- path/to/changed-file
bash push-personal.sh "feat: description of change"
```

The helper selects the stored personal-account token explicitly, ignoring work
tokens in the environment and other Git credential helpers for its fetch/push.
It requires the personal HTTPS origin and rejects outgoing commits with a
different author or committer without rewriting history. Unstaged or untracked
files must be handled explicitly before running the flow.

Mandatory gates run sequentially: `npx --no-install tsc --noEmit`,
`npx --no-install vitest run`, and `npx --no-install next build`. Any failure
stops the flow before commit or push. These are the three gates in `AGENTS.md`;
`--no-install` prevents downloading missing tooling during a push.

On `main` or `master`, a feature branch is created as
`personal/<message-slug>-<UTC timestamp>` (slug limited to 50 characters).
An existing feature branch is reused. The helper commits staged files, pushes
the feature branch, and opens a PR to `main` (or prints its existing PR URL).
It does not stage files automatically, force-push, push directly to `main`, or
merge. Review the PR and require green CI checks before explicitly approving a
merge: Vercel's Git integration deploys the resulting `main` commit automatically.

### Production Deployment

Vercel's Git integration is the single automatic production deployment owner.
The GitHub `Deploy` workflow is a manual fallback only; it does not run after CI
or on push. Dispatch it on `main` only when an intentional CLI rebuild/deploy is
needed. Dispatches on other branches are skipped, and the workflow checks out the
exact dispatch SHA. The existing production environment protections still apply.

Normal releases should be merged only after the PR checks pass. Do not manually
dispatch `Deploy` just because Vercel is already building the same commit: that
would create another production deployment. Verify the commit's Vercel status
and the public site before deciding a rebuild is needed.

### Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | Neon Postgres connection string |
| `NEXTAUTH_SECRET` | Yes | JWT signing secret (16+ chars) |
| `NEXTAUTH_URL` | Yes | App URL (http://localhost:3000 dev) |
| `OPENAI_API_KEY` | No | AI explanations (graceful without) |
| `SMTP_HOST` | No | Email notifications |
| `SMTP_PORT` | No | Usually 587 |
| `SMTP_USER` | No | Email sender address |
| `SMTP_PASS` | No | App password |
| `CRON_SECRET` | No | Vercel cron auth token |

### Public vs Protected Routes

Defined in `src/proxy.ts`:
- **Public:** `/`, `/auth/*`, `/pricing`, `/terms`, `/privacy`, `/api/health`, `/api/badge/*`
- **Protected:** Everything else requires valid JWT session.

## Code Review Checklist

- [ ] Auth guard present on new API routes
- [ ] Workspace scoping on data queries
- [ ] Zod validation on request body/params
- [ ] Rate limiting on expensive operations
- [ ] Dark mode styles included
- [ ] i18n keys added for user-facing text
- [ ] No secrets in code (use env vars)
