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

### Database
- Import `prisma` from `@/lib/database/prisma`
- Import types from `@/generated/prisma`
- Plan enum: `FREE | PRO | ENTERPRISE` (uppercase)
- Always include `take` on unbounded queries

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

---

## Testing

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

### Testing the live crawl visualization (browser)

The Site Audit page (`/crawl`) renders a live "watch the crawl happen" view: a
faux-browser **viewport** (real per-page screenshot + a scanline sweep +
violation pins), an animated **site-map** graph (nodes appear/link/recolor by
score), and a **filmstrip** of captured pages. The pure event→view-model logic
is unit-tested (`src/__tests__/crawl-theater.test.ts`); to verify the rendered
experience end-to-end in a browser:

```bash
npm run build && npm start          # serve on :3000 (run bare — piping it SIGPIPE-kills the server)
```

1. Sign in at `/auth/login` (local dev: `admin@reglayer.dev` / `reglayer2024`).
2. Go to `/crawl` → choose **Public Site** → enter a PUBLIC, multi-page URL with
   internal links, e.g. `https://quotes.toscrape.com` (page limit ~5, depth 1) →
   **Start … Audit**.
   - Do **not** use `localhost`/private addresses — the SSRF guard blocks them
     (`"Scanning internal addresses is not allowed"`). Use a public sandbox so
     sitemap + link-BFS discovery has pages to find.
3. While it runs (~20–60s), confirm: the viewport address bar tracks the page
   being scanned, a blue scanline animates while "Scanning page…" shows, then the
   real screenshot fades in with a score chip; the site map fills out and
   recolors; the filmstrip fills left→right; on completion it transitions to the
   Results view.

Verify the screenshot transport + access control:

- `GET /api/scan/<scanId>/thumbnail` (the `scanId` is in each `page-complete` SSE
  event and in the Network tab) returns **200 `image/jpeg`** when authenticated.
- The same URL while logged out returns **401**; a bogus id returns **404**
  (it is ownership-gated via `assertScanAccess`).

Accessibility: enable the OS "Reduce motion" setting and re-run — the scanline /
pulse animations stop (handled by the global `prefers-reduced-motion` rule) while
the screenshots, site map, and filmstrip still render and update.

Screenshots are captured from the page the axe scanner already loaded (JPEG q40,
~50 KB; no extra navigation), stored on each page's `Scan` row, and lazy-loaded
by the client — they are **not** buffered into the crawl result, so large crawls
stay memory-bounded.

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
