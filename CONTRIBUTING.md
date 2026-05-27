# Contributing to RegLayer

## Quick Start

```bash
# 1. Install dependencies
npm install

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

### Git Workflow

```bash
# Automated: stage → commit → branch → push → PR → auto-merge
bash push-personal.sh "feat: description of change"
```

Branch naming: auto-generated from commit message (kebab-case, truncated to 50 chars).

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
