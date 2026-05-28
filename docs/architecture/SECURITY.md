# RegLayer — Security Architecture

## Authentication

| Layer | Implementation |
|-------|---------------|
| Provider | NextAuth v4 (JWT mode) |
| Strategies | Google OAuth, Credentials (bcrypt) |
| Sessions | JWT, 24h expiry, stateless |
| Middleware | `src/proxy.ts` — intercepts all requests |
| API Keys | SHA-256 hashed, timing-safe comparison |

---

## Authorization Model

```
┌────────────────────────────────────────┐
│            Master Admin                 │
│  (full platform access, user management)│
├────────────────────────────────────────┤
│           Workspace Owner               │
│  (all workspace features, billing)      │
├────────────────────────────────────────┤
│           Workspace Admin               │
│  (team management, scan deletion)       │
├────────────────────────────────────────┤
│           Workspace Member              │
│  (scan, view, use features)             │
├────────────────────────────────────────┤
│           Workspace Viewer              │
│  (read-only access to scan results)     │
└────────────────────────────────────────┘
```

---

## Data Isolation (Multi-Tenancy)

All data queries are scoped by workspace:

```typescript
// Pattern used across all endpoints
const member = await prisma.workspaceMember.findFirst({
  where: { user: { email: session.user.email } },
});
// Then: WHERE workspaceId = member.workspaceId
```

### IDOR Protection
- `/api/scans/[id]` — verifies scan belongs to user's workspace
- `/api/monitors` — filters schedules by workspace
- `/api/team` — only shows own workspace members
- `/api/webhooks` — workspace-scoped webhook listing
- Delete operations verify ownership before removal

---

## Input Validation

All mutation endpoints use Zod schemas:

```typescript
const schema = z.object({
  url: z.string().url().max(2000),
  email: z.string().email().max(320),
  // ...
});
const parsed = schema.safeParse(body);
if (!parsed.success) return 400;
```

---

## Security Headers

Applied globally via `src/proxy.ts`:

| Header | Value |
|--------|-------|
| Content-Security-Policy | `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; ...` |
| Strict-Transport-Security | `max-age=63072000; includeSubDomains; preload` |
| X-Content-Type-Options | `nosniff` |
| X-Frame-Options | `DENY` |
| Referrer-Policy | `strict-origin-when-cross-origin` |
| Permissions-Policy | `camera=(), microphone=(), geolocation=()` |
| X-DNS-Prefetch-Control | `on` |

---

## SSRF Protection

Server-side URL fetches (remediation, design-system scan) validate:
- URL must be `http://` or `https://`
- Not internal/private IP ranges
- Not localhost or metadata endpoints
- Timeout limits on all fetches (8-10s)

---

## Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| /api/scan | 10 req | 60s |
| /api/scan/crawl | 3 req | 60s |
| /api/ai/explain | 20 req | 60s |
| /api/screen-reader | 5 req | 60s |

**Known limitation:** In-memory rate limiter resets per serverless cold start. Production fix: migrate to Upstash Redis.

---

## Secrets Management

| Secret | Storage | Notes |
|--------|---------|-------|
| User passwords | bcrypt hash in DB | Salt rounds: 12 |
| API keys | SHA-256 hash in DB | Only prefix stored in cleartext |
| OAuth tokens (Slack/GitHub) | Plaintext in DB | **TODO: encrypt with AES-256** |
| JWT signing | NEXTAUTH_SECRET env var | 256-bit entropy required |
| Database URL | Vercel env vars | Not committed to repo |

---

## Known Security Debt

| Issue | Severity | Mitigation Plan |
|-------|----------|-----------------|
| OAuth tokens stored unencrypted | HIGH | Add AES-256-GCM encryption layer |
| In-memory rate limiting | HIGH | Migrate to Upstash Redis |
| No CSRF tokens on mutations | MEDIUM | SameSite cookies + origin check |
| `Access-Control-Allow-Origin: *` on embeddable endpoints | LOW | Intentional for scripts, events endpoint validates API key |
| `as unknown as` type casts for session | LOW | Extend NextAuth session type properly |

---

## Dependency Security

- `npm audit` run in CI pipeline
- No known critical vulnerabilities in production dependencies
- Chromium sandbox enabled for browser scanning
- Playwright/puppeteer only navigate to user-provided URLs (validated)
