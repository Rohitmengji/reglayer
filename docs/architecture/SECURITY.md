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

Resource-by-id endpoints share a single ownership helper rather than re-implementing
the check (see **Security-by-Construction Access Control** below). Closed finding **S-3**:
`/api/vendor-risk?scanId=` previously loaded and analyzed any scan by id without an
ownership check (cross-tenant read); it now calls `assertScanAccess` before doing any
work.

---

## Security-by-Construction Access Control

`src/lib/auth/access.ts` is the single source of truth for *"can this session access
this scan/site?"*. It replaces the per-route copy-paste ownership checks that drifted out
of sync (the correct pattern lived in exactly one place and was never shared), which is
what allowed forged compliance proofs (**C-3**) and the vendor-risk cross-tenant read
(**S-3**).

```typescript
// Discriminated result — callers map a denial to the right HTTP status without throwing.
type AccessResult =
  | { ok: true;  userId: string; isMasterAdmin: boolean; workspaceId: string | null }
  | { ok: false; status: 401 | 403 | 404; error: string };

assertScanAccess(scanId: string, session: Session | null): Promise<AccessResult>
assertSiteAccess(siteId: string, session: Session | null): Promise<AccessResult>
```

Resolution order in both helpers:
1. No session user → `401 Authentication required`.
2. Resource not found by id → `404` (never leaks existence vs. ownership).
3. Master admin → allowed (bypass).
4. Otherwise workspace membership — the resource's `workspaceId` must be one the user
   belongs to. `assertScanAccess` additionally permits legacy workspace-less scans owned
   by `userId`.
5. Else → `403`.

The helper is enforced across `vault`, `compliance/vpat`, `statement/generate`, the
`sites/[siteId]/risk` family, `score`, and `simulate`, plus the new legal-moat routes:

| Route | Verbs | Helper |
|-------|-------|--------|
| `/api/sites/[siteId]/defense-file` | GET **and** POST | `assertSiteAccess` |
| `/api/sites/[siteId]/demand-letter` | POST | `assertSiteAccess` |
| `/api/vendor-risk?scanId=` | GET | `assertScanAccess` (closes S-3) |

The defense-file route deliberately gates **both** verbs (it does *not* copy the weaker
VPAT GET, which skipped the ownership check).

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

## Output Encoding (XSS)

All server-generated HTML is escaped through a shared `escapeHtml` helper before any
user- or scan-derived value reaches the page. This covers the new HTML-producing
endpoints, whose content is assembled from site URLs, violation text, and (for the
demand-letter triage) attacker-supplied letter/claim text:

- `renderDefenseFileHTML` — Litigation Defense File (`src/lib/defense/defenseFile.ts`)
- `renderTriageHTML` — Demand-Letter rebuttal (`src/lib/triage/demandLetter.ts`)

`escapeHtml` encodes `& < > " '`. Both renderers live in the **pure core** of their
feature (no Prisma / Next / `server-only`), so escaping is exercised directly by unit
tests rather than only at integration boundaries.

---

## Public Proof Verification (Login-Free)

`GET /api/vault/[proofId]/verify` (page: `src/app/verify/[proofId]/page.tsx`) is
intentionally **public, no auth** — any third party (auditor, opposing counsel) can
independently confirm a compliance proof's tamper-evidence from the proof data alone.
This is the externally verifiable half of the Anchored Evidence Chain that closed the
proof-forgery finding **C-3**.

It returns a **whitelisted, non-sensitive** report only — never the full evidence
payload, scan URL, or violation details:

```
proofId, valid, hashValid, chainValid, chainIndex, chainLength,
issuedAt, revokedAt, expiresAt, standard, title, hash, issues
```

`force-dynamic` ensures verification always reads live DB state (never a cached/static
response). POST is retained for backward compatibility and returns the same public report.

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

## Failure Isolation (Best-Effort Recorders)

The cross-tenant data-network features write side-channel telemetry through **best-effort
recorders that never throw**:

- `recordFixOutcome` (`src/lib/genome/recordOutcome.ts`) — wired into fix verification
- `recordVendorObservations` (`src/lib/vendorgraph/recordObservations.ts`) — wired into
  `/api/vendor-risk`

If the backing table is absent (a migration not yet applied) or a write transiently
fails, the recorder swallows the error and returns a benign value, so the caller's
primary flow (fix verification, vendor-risk response) is never disrupted. This decouples
deploy ordering from request correctness.

---

## Resolved Findings

| ID | Finding | Resolution |
|----|---------|-----------|
| **C-3** | Forgeable compliance proofs — an in-row self-checksum could be re-computed after tampering, and proofs could be bound to another tenant's scan | Anchored Evidence Chain (Merkle-style per-workspace hash chain: `prevHash` + `chainIndex`) makes tampering/back-dating independently detectable, plus `assertScanAccess` on proof issuance |
| **S-3** | IDOR — `/api/vendor-risk?scanId=` analyzed any scan by id with no ownership check | `assertScanAccess` enforced before any work |

---

## Dependency Security

- `npm audit` run in CI pipeline
- No known critical vulnerabilities in production dependencies
- Chromium sandbox enabled for browser scanning
- Playwright/puppeteer only navigate to user-provided URLs (validated)
