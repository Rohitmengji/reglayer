# RegLayer — Developer Onboarding Guide

## Quick Start

### Prerequisites
- Node.js 20+ 
- PostgreSQL (or Neon account)
- Git

### Setup

```bash
# Clone
git clone https://github.com/Rohitmengji/reglayer.git
cd reglayer

# Install dependencies
npm install

# Set up environment
cp .env.example .env.local
# Edit .env.local with your DATABASE_URL, NEXTAUTH_SECRET, etc.

# Generate Prisma client
npx prisma generate

# Push schema to database (first time)
npx prisma db push

# Run dev server
npm run dev
```

> **Schema sync:** the live Neon DB is fully in sync as of 2026-06-15 — all migrations
> through `VendorObservation` (#170) are applied. The project uses `prisma db push`
> (no migrations folder), so before touching `prisma/schema.prisma` preview the SQL
> that a push would run against the current DB:
>
> ```bash
> npx prisma migrate diff \
>   --from-config-datasource \
>   --to-schema prisma/schema.prisma \
>   --script
> ```

### Environment Variables

| Variable | Required | Example |
|----------|----------|---------|
| `DATABASE_URL` | Yes | `postgresql://user:pass@host/db?sslmode=require` |
| `NEXTAUTH_URL` | Yes | `http://localhost:3000` |
| `NEXTAUTH_SECRET` | Yes | `openssl rand -base64 32` |
| `OPENAI_API_KEY` | No | `sk-...` |
| `GOOGLE_CLIENT_ID` | No | `xxx.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | No | `GOCSPX-xxx` |

---

## Project Structure

```
src/
├── app/          → Pages and API routes (Next.js App Router)
├── components/   → React components (ui/, layout/, charts/)
├── lib/          → Core business logic
├── services/     → Service orchestration layer
├── stores/       → Client-side state (Zustand)
├── hooks/        → Custom React hooks
├── types/        → TypeScript type definitions
└── __tests__/    → Test files (Vitest)
```

---

## Key Conventions

### API Routes
- All in `src/app/api/`
- Use `getServerSession(authOptions)` for auth
- Validate input with Zod schemas
- Return `NextResponse.json()`
- Workspace-scope all data queries

### Authentication
- `authOptions` from `@/lib/auth/config`
- Session user has `email` (not `id` directly)
- Use `workspaceMember.findFirst({ where: { user: { email } } })` for workspace context
- Master admin flag: `user.isMasterAdmin`

### Resource Access (security-by-construction)
- When a route loads a `Scan`/`Site` by a URL- or body-supplied id, authorize it with the
  shared helpers in `src/lib/auth/access.ts`: `assertScanAccess(scanId, session)` and
  `assertSiteAccess(siteId, session)`.
- They return a discriminated `AccessResult` — `{ ok: true, userId, isMasterAdmin, workspaceId }`
  or `{ ok: false, status: 401 | 403 | 404, error }` — so you map a denial straight to the
  right HTTP status without throwing.
- Logic: master admin bypasses; otherwise access requires workspace membership (or, for
  legacy workspace-less scans, ownership by `userId`).
- This is the single ownership helper shared across vault / vpat / statement / risk / score /
  simulate and the newer defense-file / demand-letter / vendor-risk routes. It closed the
  proof-forgery (C-3) and IDOR (S-3) findings — don't reintroduce hand-rolled ownership checks.

### Database
- Import `prisma` from `@/lib/database/prisma`
- Import types from `@/generated/prisma`
- Plan enum: `FREE | PRO | ENTERPRISE` (uppercase)
- Always include `take` on unbounded queries
- 34 models, 10 enums. Recent additions: `Monitor`, `CrawlJobRecord` (`crawl_jobs`),
  `RumEventRecord` (`rum_events`) [#164]; `FixOutcomeRecord` (`fix_outcomes`) [#169];
  `VendorObservation` (`vendor_observations`) [#170]

### Plan Gating
```typescript
const member = await prisma.workspaceMember.findFirst({
  where: { user: { email: session.user.email } },
  include: { workspace: true },
});

if (!["PRO", "ENTERPRISE"].includes(member.workspace.plan)) {
  return NextResponse.json({ error: "Requires Pro plan" }, { status: 403 });
}
```

### Components
- UI primitives in `src/components/ui/` (Card, Button, Badge, etc.)
- Use `lucide-react` for icons
- Dark mode via `useTheme()` from `@/components/theme-provider`

### Feature Architecture Pattern
Every new feature is built in three layers — keep them separate:

1. **Pure core** — no Prisma, no Next.js, no `"server-only"` import. Just data in →
   data out. This is the unit-tested heart of the feature, exercised exhaustively in
   Vitest exactly like `src/lib/vault/chain.ts` (canonicalize / computeProofHash /
   verifyChain). Recent cores: `src/lib/defense/defenseFile.ts`,
   `src/lib/triage/demandLetter.ts` (the dollar model is *injected* so the core stays
   pure), `src/lib/genome/fixGenome.ts`, `src/lib/vendorgraph/vendorGraph.ts`.
2. **Server-only data loader** — a thin module that pulls from Prisma and hands plain
   data to the pure core (e.g. `loadDefenseFileData.ts`, `loadTriageData.ts`).
3. **Thin route handler** — does auth + format negotiation only (e.g. `?format=html|json`),
   then delegates to the loader + core.

Conventions that fall out of this pattern:
- **All generated HTML is escaped** via `escapeHtml` before interpolation (XSS-safe).
- **Best-effort recorders never throw.** `recordFixOutcome` and `recordVendorObservations`
  wrap their work in `try/catch` and swallow errors, so a not-yet-applied migration (or
  any write failure) can never break the primary flow they're wired into.
- **Authorize via the shared helper** — see Authentication below; routes never trust a
  URL-/body-supplied id.

### Internationalization (i18n)
- Locale maps live in `src/lib/i18n/` — **7 locales**: `en` (canonical source of truth),
  `de`, `fr`, `es`, `it`, `nl`, `pt`.
- **Parity is CI-enforced** by `src/__tests__/i18n-parity.test.ts`: every non-`en` locale
  must export the *exact* same key set as `en.ts` (no missing, no extra) and preserve
  every interpolation placeholder (`{count}`, `{name}`, ...). Adding a user-facing string
  to `en.ts` without adding it to all six other locales fails the build.

---

## Testing

301 tests passing across 18 Vitest suites. Pure feature cores (e.g. `chain.ts`,
`fixGenome.ts`, `defenseFile.ts`) are unit-tested directly — no DB or HTTP needed.
The i18n parity suite (`i18n-parity.test.ts`) gates locale drift in CI.

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Type check
npx tsc --noEmit

# Lint
npm run lint
```

---

## Git Workflow

```bash
# Create feature branch (can't push directly to main)
git checkout -b feat/my-feature

# Or push to a named branch
git push personal main:feat/my-feature

# Create PR
gh pr create --base main --head feat/my-feature --title "feat: ..."

# Merge with admin override
gh pr merge <number> --merge --admin

# Pull latest
git pull personal main
```

---

## Architecture Decisions

| Pattern | Why |
|---------|-----|
| `src/proxy.ts` (not middleware.ts) | Next.js 16 convention — auth gate + security headers |
| Workspace-scoped queries | Multi-tenancy isolation — prevents IDOR |
| Plan check via workspace (not user) | Team-level billing — all members get same features |
| In-memory stores for RUM/reports | V1 simplicity — Redis/ClickHouse for production |
| jsdom for remediation | Lighter than Playwright for HTML manipulation |
