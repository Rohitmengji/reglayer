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
