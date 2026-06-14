# RegLayer — Senior Engineering Audit & Strategic Roadmap

*Generated 2026-06-14. Method: 8 parallel subsystem-recon agents → 7-dimension audit (69 findings) → adversarial verification (36 of the serious findings independently challenged; 5 refuted as overstated) → 25 novel-feature concepts. Every finding below is grounded in code that was actually read and cites `file:line`. Severities shown as `[original→verified]` where the adversarial pass adjusted them.*

---

## 0. The one-paragraph version

RegLayer is an ambitious, genuinely impressive platform — the domain modeling (litigation weights, regulation deadline engine, proof vault, multi-tenant agency layer) is far beyond a typical SaaS, and the *happy paths* are well-engineered (synchronous `/api/scan` with Redis dedup + Upstash rate-limiting, the cron handler's secret-auth/budget-guard/idempotency discipline, fire-and-forget notification fan-out). But the audit surfaces **three structural themes** that, together, account for almost every serious finding:

1. **"AuditLog as a database."** Webhooks and monitors are smuggled into the `AuditLog` table as schema-less rows with **no `workspaceId`**. This single anti-pattern produces *four* of the cross-tenant breaches (every tenant's scan results POST to every other tenant's webhook; any user deletes any tenant's integration; plan limits counted globally).
2. **"Built but never wired."** A surprising amount of infrastructure is *advertised in comments/README and shipped, but dead*: the env-validation module, two API-error helper modules, the in-memory scan queue, the browser pool, `calculateLitigationRisk` (never auto-called), RUM persistence. The scaffolding reads as "done" and invites someone to depend on it.
3. **"The irony test fails."** An accessibility-compliance product whose own core UI controls (`ModernSelect` on 14 pages, scan progress, `<html lang>`) fail the exact WCAG criteria it scans customers for — a demoable credibility risk in enterprise procurement.

The good news: because the worst issues share **root causes**, a small number of focused fixes (a shared `assertScanAccess` helper; promoting webhooks/monitors to a first-class `workspaceId`-scoped model; wiring the env validator) closes the majority of the critical/high findings at once. This document sequences them.

---

## 1. Critical findings (fix before next enterprise deal / SOC2)

### C-1 — Cross-tenant webhook breach: scan data leaks to every tenant; any user deletes any webhook  `[critical]`
**Files:** `src/app/api/webhooks/route.ts:41-44,108-112,165-177,206-212`; `src/lib/integrations/webhookDispatcher.ts:36-44`; `prisma/schema.prisma:303-315`
A proper `model Webhook { …, workspaceId, workspace @relation(onDelete: Cascade) }` exists (schema:303-315) but **has zero callers** — webhooks are instead written as `auditLog.create({ action: "webhook.registered", metadata: {url, events, secret} })` with **no `workspaceId`**. Consequences, all verified:
- `GET` lists `auditLog.findMany({ where: { action: "webhook.registered" } })` globally → returns **every tenant's** webhook URLs to any authenticated user.
- The plan-limit count counts **all tenants'** webhooks.
- `DELETE` only checks `entry.action !== "webhook.registered"`, not ownership → any logged-in user deletes any tenant's webhook by id (and mutates the "immutable" audit table).
- `dispatchWebhookEvent` fires **every** registered webhook in the system on a match → Tenant A's `scan.completed` payload (url, score, violation counts) is POSTed to Tenant B's endpoint.

**Impact:** Cross-tenant data exfiltration (GDPR-reportable), competitor-sabotage delete, plan limits gated by strangers. Fails SOC2; kills enterprise procurement. *Verifier tried to refute and could not — every sub-claim holds.*
**Fix:** Use the `Webhook` model that already exists; carry `workspaceId`; scope GET/DELETE/count by the caller's resolved workspace (reuse the `workspaceMember.findFirst` membership check from `vault/route.ts:32-37`); in `dispatchWebhookEvent` filter by the event's `scan.workspaceId`. Same fix applies to **monitors** (see C-2). **Effort: L**

### C-2 — Alert monitors match across tenants by URL → targeted cross-tenant scan exfiltration  `[high, same root cause as C-1]`
**Files:** `src/lib/intelligence/alertEngine.ts:37-51,78-89`; `src/app/api/monitors/route.ts:84-110`
`evaluateAlerts` loads rules from `auditLog.findMany({ where: { action: "monitor.created" } })` (no workspace scope) and matches purely on `meta.url === scan.url`, then POSTs the scan's id/url/score to the rule's user-controlled `meta.webhookUrl`. Monitors are created with no `workspaceId`. **Any tenant can register a monitor for a URL another tenant also scans and auto-exfiltrate that tenant's results the moment their scan completes.**
**Fix:** Promote monitors to a first-class `workspaceId`-scoped model (same migration as C-1); match on `(workspaceId, url)`; run the dispatch target through the hardened SSRF+signing path (S-5). **Effort: M**

### C-3 — Proof / VPAT / EU-statement bind arbitrary cross-tenant scans → forged legal evidence + data leak  `[critical→high]`
**Files:** `src/lib/vault/proofEngine.ts:59-116`; `src/app/api/vault/route.ts:67-83`; `src/app/api/compliance/vpat/route.ts:75-98`; `src/app/api/statement/generate/route.ts:60-71`
`POST /api/vault` checks membership of `body.workspaceId`, then `issueProof()` trusts `body.scanId`/`siteId` verbatim — `prisma.scan.findUnique({ where: { id: scanId } })` with **no check the scan belongs to that workspace**. VPAT does the same after only a plan check. `statement/generate` falls back to `prisma.scan.findFirst({ where: { url, status: "COMPLETED" } })` **across all tenants**. A member of workspace A can mint a "tamper-evident compliance proof" or procurement-grade VPAT built from **another tenant's** high-scoring scan — forged legal evidence — and read other tenants' URLs/scores.
**Fix:** A single shared `assertScanAccess(scanId, session)` / `assertSiteAccess(siteId, session)` helper that joins Scan/Site → `workspaceId` and verifies membership. **The correct pattern already exists** at `sites/[siteId]/trends/route.ts:57-89` — promote it to a helper and call it everywhere. (This one helper also closes S-3 below.) **Effort: M**

### C-4 — Scheduled monitoring silently under-runs the plan it sells  `[critical→high]`
**Files:** `vercel.json:8-13`; `src/app/api/cron/run-schedules/route.ts:8,44,67`; `src/lib/scheduling/scheduleService.ts:26-30,127-158`
`vercel.json` registers **one** cron: `"0 6 * * *"` — once per day. But the route is built for 5-minute polling ("Invoked every 5 minutes", "Checking again in 5 minutes"), and `scheduleService` sells FREE=weekly / PRO=daily / ENTERPRISE=hourly. `markScheduleExecuted` recomputes `nextRunAt` from `now()` at the daily run, so an ENTERPRISE *hourly* schedule is only revisited once/day → **degrades to daily**. Plus `getDueSchedules` caps at `take:10`, processed sequentially with a 50s budget → any tenant with >10 due schedules never drains.
**Impact:** Customers pay for PRO/ENTERPRISE frequency they never receive; regression alerts arrive up to a day late. Direct refund/SLA/churn risk for a product whose core promise is *continuous* monitoring.
**Fix (S-effort, high-leverage):** Set the cron to `"*/5 * * * *"` (the route already self-budgets at 50s + `take:10`). Add per-workspace round-robin fairness so one tenant can't monopolize the 10 slots. Reconcile `PLAN_MIN_INTERVAL` with reality. **Effort: S**

---

## 2. High-severity — security (multi-tenant isolation & SSRF)

### S-3 — IDOR across risk / AIS-score / revenue-impact / simulate  `[high]`
**Files:** `sites/[siteId]/risk/route.ts:24`; `…/risk/recalculate/route.ts:42-55`; `score/route.ts:32-37,71-95`; `simulate/route.ts:22`; `lib/simulator/impactSimulator.ts:70`
All key on URL-supplied `siteId`/`scanId` with only an existence check. `/api/score` has **no in-route auth at all** and aggregates history across all tenants scanning the same URL. Any authenticated tenant can read another's dollar-exposure narrative, AIS, revenue estimates, and per-element violation HTML. **Closed by the same `assertScanAccess`/`assertSiteAccess` helper as C-3.** **Effort: M**

### S-5 — SSRF: string-only validation defeated by IPv4-mapped IPv6, DNS rebinding, and redirect-following  `[high]`
**Files:** `src/lib/validations/ssrf.ts:36-69`; `src/app/api/remediate/route.ts:82-96`; `src/lib/intelligence/alertEngine.ts:78-89`; `src/app/api/design-system/scan/route.ts:118,143,159,187`
`validateScanUrl` is regex-on-hostname only. Empirically confirmed bypasses: `http://[::ffff:169.254.169.254]/` parses to hostname `[::ffff:a9fe:a9fe]` and is **allowed** (no IPv4-mapped-IPv6 rule); any public hostname that **resolves** to an internal IP (DNS rebinding) is allowed; `/api/remediate` validates then does `fetch(url, { redirect: "follow" })` so a **302 → 169.254.169.254** bypasses the check; `alertEngine.dispatchWebhook` and `design-system/scan` fetch user URLs with **no SSRF guard at all**. *(Verifier correctly noted decimal/hex/octal IPv4 like `http://2130706433` ARE normalized + blocked by Node's URL parser — not a bypass, not flagged. Good calibration.)*
**Fix:** After parsing, `dns.resolve()` the hostname and re-check **every** resolved A/AAAA against private ranges (add IPv4-mapped + metadata IPs); apply the guard before **every** server-side fetch (centralize — see Theme "build by construction"); re-validate after each redirect (`redirect: "manual"`, walk hops). Reuse the private-range list already inlined at `webhooks/route.ts:142-151` as the single source. **Effort: L**

### S-4 — Unauthenticated data exposure: `/api/conversion` GET + `/api/certificate/[id]`  `[high→medium]`
**Files:** `conversion/route.ts:63-122`; `certificate/[id]/route.ts:18-77`; `src/proxy.ts:108-109`
Both are in the proxy public allowlist. `/api/conversion` GET has **no auth despite a docstring saying "admin only"** → anyone reads signup counts + demo→signup conversion rate (growth metrics for competitors). `/api/certificate/[id]` resolves **any scan by id** (url, score, violations) with no `published` flag. *(Verifier split this: conversion is real, the certificate half is partly by-design for shareable certs — net downgraded to medium.)*
**Fix:** Add session + `isMasterAdmin` check to conversion GET (already on the JWT); add a `published` boolean to shareable certificates; cap `days` with Zod `.max()`. **Effort: M**

### S-6 — CI gate/guard routes ignore the API key's workspace; guard PATCH is raw mass-assignment  `[high→medium]`
**Files:** `gate/route.ts:55-96`; `guard/evaluate/route.ts:27-45`; `guard/[policyId]/route.ts:43-46`; `lib/guard/guardEngine.ts:78-82,128-135`
Routes authenticate the Bearer key then **discard `keyRecord.workspaceId`** — `/api/gate` scans any URL billed to the platform; `guard/evaluate` trusts body `siteId/workspaceId`. `PATCH /api/guard/[policyId]` does `update({ where:{id}, data: body })` with **no Zod, no allowlist** → an admin can overwrite `baselineScanId`/`baselineScore` to point the baseline at an arbitrary scan and make all regression checks pass. *(Verifier downgraded: the most severe cross-tenant claims partially refuted, but the scoping gap + mass-assignment are real.)*
**Fix:** Scope everything to `keyRecord.workspaceId` after the key lookup (also fixes the duplication in Q-3); add a Zod allowlist schema to the PATCH (never accept `siteId`/`workspaceId`/`baseline*` from the body). **Effort: M**

---

## 3. High-severity — correctness & reliability (broken core promises)

### R-5 / C3 — The flagship multi-page crawl produces nothing durable AND bypasses billing  `[high]`
**Files:** `src/lib/scanner/crawler/siteCrawler.ts:828,857-864`; `src/lib/scanner/crawler/job-manager.ts:90-98,221-222`; `src/app/api/crawl/route.ts:96-106`; `src/services/scanService.ts:134-191`
Two compounding defects: **(a)** crawl pages go through `executeScanPipeline` (which only assembles a `ScanResult` — it never writes the DB; only `scanService.persistScan` does), and the crawler's sole DB write is `prisma.scan.updateMany({ where: { id: { in: […never-inserted ids] } } })` → **always updates 0 rows**. All audit data lives only in an in-memory job (1h TTL). **(b)** `jobManager` is a `globalThis` singleton holding jobs in a `Map`; `/api/crawl` runs `crawlSite(...)` as a **detached promise** and returns immediately → on Vercel the function freezes once the response is sent, so a "500+ page audit" is killed mid-flight, and the SSE/status endpoints hit a *different* lambda that has never seen the job. Plus `getMonthlyScansCount` counts `Scan` rows, so crawls are **free against the metered limit**.
**Impact:** The enterprise site-audit feature is effectively non-functional in production: jobs die silently, progress 404s, nothing persists, and it undercuts billing.
**Fix:** Route crawl pages through `performScan`/`persistScan` per page (real `Scan` rows, real ids, counts toward quota); move job state to a Postgres `CrawlJob` model; drive execution from the cron runner instead of a detached promise. **Effort: XL** (the highest-effort item; consider shipping a documented synchronous `maxPages` cap as an interim).

### R-6 — RUM ingestion stores events in a module-level `Map` → lost on cold start, invisible across instances  `[high]`
**Files:** `src/app/api/rum/events/route.ts:54-55,107-117,141-142`
`const eventStore = new Map(...)` at module scope (comment admits "in production this would be Redis/ClickHouse"). On Vercel each instance has its own empty Map; events ingested on instance X are unreadable by the dashboard GET on instance Y, and all telemetry is discarded on scale-down. POST/GET keys also diverge (`apiKeyRecord?.userId` vs `member.userId`), so events frequently land in a bucket the dashboard never reads. **A sold analytics surface shows near-random partial data.**
**Fix:** Persist to Postgres (`RumEvent` model) or Upstash (already a dep); key ingestion + read on the same resolved identifier via a dedicated RUM site-key. `aggregateEvents` is reusable unchanged. **Effort: L**

### C1 / R-2 — Scheduled scans can double-execute (the claimed lock doesn't exist)  `[high→medium]`
**Files:** `src/lib/scheduling/scheduleService.ts:122-158`; `src/app/api/cron/run-schedules/route.ts:60-94`
The docstring says "Uses a SELECT … FOR UPDATE SKIP LOCKED pattern conceptually," but `getDueSchedules` is a plain `findMany` with **no lock**, and `nextRunAt` is only advanced *after* the scan completes. Two overlapping invocations (manual trigger + scheduled, or a Vercel 5xx retry) read the same due rows and run `performScan` twice — burning scan quota and **double-firing** regression emails + Slack/webhook dispatches. The header's "Idempotent: double-invocation is safe" is false. Likelihood rises the moment C-4's cadence is fixed.
**Fix:** Claim atomically before running — raw `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED) RETURNING`, advancing `nextRunAt` at claim time. Mirror the optimistic-lock pattern already in `consumeCredits` (`credits/index.ts:104`). **Effort: M**

### R-3 — Integration dispatch (Slack/Teams/Jira/GitHub) has no fetch timeout → one hung endpoint wedges the cron loop  `[high]`
**Files:** `src/lib/integrations/dispatcher.ts:78,195,228,286`
All four outbound fetches omit `AbortSignal` — unlike `webhookDispatcher.ts:101` which correctly uses `AbortSignal.timeout(10000)`. `dispatchToIntegrations` iterates sequentially inside the cron's `handleRegression`, so one slow customer endpoint consumes the 50s budget and **starves every other tenant's** scheduled scans in that window — cross-tenant availability incident.
**Fix:** Add `signal: AbortSignal.timeout(10000)` to all four (copy the existing pattern); switch the sequential loop to `Promise.allSettled`. **Effort: S**

### R-4 — No webhook/integration delivery retries or dead-letter  `[high]`
**Files:** `src/lib/integrations/webhookDispatcher.ts:56-133`
Exactly one POST per hook; on failure it logs `status:"failed"` and never retries/re-queues. The `withRetry` helper (`src/lib/retry.ts`) **exists but is used on no delivery path**. A transient blip permanently loses a regression notification — for CI gates and compliance alerting, a regression can ship undetected.
**Fix:** Wrap delivery in `withRetry({ maxAttempts: 3 })`; write a `webhook.failed` row for a redelivery sweep in the cron. **Effort: M**

### R-8 — AI helpers call a non-existent OpenAI model → guaranteed failure, masked as "graceful degradation"  `[medium]`
The explain/summary helpers use a model id that doesn't exist; the retry wrapper amplifies the failure 3×, then it's swallowed as graceful degradation. The *working* call at `gate/review/route.ts:284` uses `gpt-4o-mini`. **Fix:** correct the model id; log AI failures (via Sentry per R-7) instead of silently degrading. **Effort: S**

### R-7 — Structured logger is console-only; `logger.error` never reaches the wired Sentry  `[medium]`
Sentry is configured but the backend logger only `console.*`s, so server errors never create Sentry events. **Fix:** route `level==="error"` through `Sentry.captureException`. **Effort: S**

---

## 4. High-severity — performance & cost

| ID | Finding | Verified sev | Fix | Effort |
|----|---------|------|-----|--------|
| PERF-01 | `/api/executive` loads **every** completed scan with no `take` and aggregates 12 weekly windows in memory — and it's the ENTERPRISE-gated view, i.e. the tenants with the most data hit the worst endpoint (Vercel timeout / OOM) | high→med | Push aggregation into Postgres: `groupBy`/`aggregate` + a windowed `take:500`; mirror the bounded pattern in `/api/trends` | M |
| PERF-02 | `priorityEngine` runs an **unscoped global** `violation.groupBy` + `scan.count()` on **every** report → cost grows with total platform data, and mixes other tenants' frequencies into a tenant's "recurrence" metric (data bleed) | high | Add `where: { scan: scopeFilter }`; scoped count; cache (changes slowly) | M |
| PERF-04 | Screenshot stage **cold-launches a second browser** per scan and re-navigates the same URL; the built browser pool (`playwright.ts`) is dead code → ~2× latency/memory, OOM risk under crawl concurrency | high | Capture the screenshot in the **already-open** page before close; wire the existing pool | M |
| PERF-06 | 11 routes drive a browser but `vercel.json`/`outputFileTracingIncludes` configure memory + chromium tracing for only **3** → the other 8 (incl. public `demo-scan`, CI `gate`) run on default memory and may not find the binary → cold-start timeouts on visible surfaces | high→med | Extend `vercel.json functions` + tracing to every browser route (pattern already exists) | S |
| PERF-03 | axe-core source `fs.readFileSync` on **every** scan/page (no cache) — 100-page crawl reads ~500KB ×100 | high→low | One-line module-level memoization | S |

Plus medium-severity: base64 screenshot column over-fetched (PERF-05), O(n²) AIS simulator (PERF-07), `/api/ai/explain` ignores its own cache column (PERF-08), dashboard avg/trend computed from only last 10 scans (PERF-09), `/api/scans` no pagination (PERF-11).

---

## 5. High/medium — data model integrity

- **data-6 (med):** All money stored as `Float`, not `Decimal` → legal-exposure dollar figures accumulate binary-float error. Use `Decimal @db.Decimal(12,2)`.
- **data-7 (med):** No migration history — schema applied via `db push` only → unreviewable, data-loss-prone evolution. Adopt `prisma migrate` with a baseline.
- **data-9 (med):** `ComplianceProof` "integrity" is a SHA-256 checksum stored **in the same row** as the data it protects — anyone with DB write can forge a valid proof. Either stop calling it "cryptographic proof / legal defense," or make it real (see novel feature **Anchored Evidence Chain**).
- **data-10 (med):** Guard auto-baseline promotion overwrites `baselineScanId` every passing scan → erases the regression record by design (defeats the engine's stated anti-decay purpose). Add an append-only `GuardBaseline` child table.
- **data-5 (med):** `LitigationRiskScore.calculatedAt` never updates on recalculation → silently caps the risk-trend feature. **data-3 (med):** `wcagCriteria`/`wcagLevel` columns never written (dead). **data-8 (med):** schema-less JSON columns read with conflicting unvalidated casts — add Zod parse-on-read.

*Refuted (good): the "scan.id collision corrupts data" and "monitors create dangling FK with `workspaceId:''`" findings were dismantled by the verifier — Postgres enforces the FK (no `relationMode` override) and the id math was misstated.*

---

## 6. High/medium — UX & the "irony test" (the a11y product failing a11y)

- **ux-01 (high):** The custom `ModernSelect` — which replaced **every native `<select>` across 14 pages** in the recent UI modernization — has `aria-expanded` as its *only* a11y attribute: no `role="listbox/option"`, no `onKeyDown`, no Escape/arrow/type-ahead, no focus return. **A keyboard or screen-reader user literally cannot change a filter.** Fails WCAG 2.1.1 + 4.1.2. The correct pattern already exists in `src/components/command-palette.tsx`. **Effort: M.** *Demoable credibility killer — prospects run axe on RegLayer itself.*
- **ux-02 (high):** `<html lang="en">` is hardcoded; locale is detected client-side and the UI switches to German/French but `documentElement.lang` only updates on *manual* language change → screen readers announce translated content with English phonetics. Fails WCAG 3.1.1 — the exact criterion RegLayer scans for. One `useEffect`. **Effort: S.**
- **ux-04 (high→med):** Scan/crawl progress has **no ARIA live region** → screen-reader users get total silence during 30-60s scans (and the progress is fake/time-based). The product's primary action is inaccessible to its advocacy audience. Copy the `sr-only aria-live` pattern from `command-palette.tsx:322`. **Effort: S.**
- **ux-03 (high→med):** The entire first-run experience (role picker + getting-started checklist) is **untranslated in es/it/nl/pt** (and most of fr) — each missing ~354 of ~689 keys; `getTranslation` silently falls back to English. The activation funnel for ~5 of the 7 marketed EU markets is monolingual. Backfill + add a CI key-parity test. **Effort: L.**
- **ux-05/06/07/08 (med):** single-click destructive delete with no confirm on webhooks/guard policies; `ConfirmDialog` has no focus trap/restore; scans summary + CSV computed from a client-truncated 50-row slice; onboarding copy hardcoded English with a fragile `.replace`.

---

## 7. Medium — code quality & maintainability (the "build but never wired" theme)

- **Q1 (high→med):** **Two** API-error helper modules (`lib/api/errors.ts`, `lib/utils/api-errors.ts`) with **conflicting** defaults, both saying "all routes MUST use these," both imported by **zero** routes → 401 bodies split 57×`"Unauthorized"` / 56×`"Authentication required"`; no machine-readable `code`. Pick one (`lib/api/errors.ts` is richer), delete the other, codemod ~104 call sites, add an ESLint `no-restricted-syntax` guard.
- **Q2 (high):** `src/lib/env.ts` builds a Zod env schema + fail-fast `validateEnv()` and says "import this instead of `process.env`" — but **nothing imports it**, so it never runs; `process.env` is read raw ~60× and only 8 of ~30 vars are covered (Stripe price IDs, `ENCRYPTION_KEY`, `CRON_SECRET`, SMTP not validated). Missing/typo'd vars surface as cryptic prod 500s — the exact failure it was written to prevent. Import it at boot; expand coverage.
- **Q3 (high):** prefix+sha256 API-key auth copy-pasted verbatim across 4 routes with no helper — *this duplication is the direct enabler of S-6's authz hole.* Extract `authenticateApiKey()` returning `{workspaceId, userId}`; the scoping check becomes natural.
- **Q6 (med):** Dead in-memory `scanQueue.ts` + `scheduler.ts` (only their tests import them) duplicate the live DB-backed path — **delete them** (don't keep broken infra that reads as production-ready).
- **Q8 (med):** 56 of 112 routes return raw `err.message` to the client on 500 (internal-error leak) — route through `internalError()`.
- **Q9 (high):** **Zero tests** on the highest-risk paths — Stripe webhook plan-mapping, credit metering concurrency, tenant isolation — while the *dead* `scanQueue` has a test. Add vitest suites for `priceIdToPlan` (unknown-price fallback), `consumeCredits` overspend guard, and a cross-tenant 403 integration test (which also locks in the C-3/S-3 fix).
- **Q10/Q11/Q4/Q5 (med):** 51 routes hand-roll the session+membership preamble (build the `resolveActiveWorkspace()` the empty `repositories/` dir promises); `persistScan` swallows failures and returns 200 despite a "blocking" comment; RBAC logic hand-copied into `admin/route.ts`; 5 divergent impact-weight tables + 2 `linearRegression` impls.

Plus medium correctness: scan summary counts mix rules-vs-nodes (C4); month-boundary quota miscounts in non-UTC tenants (C5); credit-reset display disagrees with trigger (C6); credits charged before failure with no refund + Stripe upgrades leave `User.credits` at FREE (C7); axeScanner scans blank pages on tolerated timeouts (C8); unvalidated numeric query params → NaN 500s (C10).

---

## 8. The remediation roadmap (sequenced by root-cause leverage)

The ordering matters: several fixes are *prerequisites* that collapse multiple findings.

**Sprint 1 — Stop the cross-tenant bleeding + the silent SLA breach (mostly S/M effort, huge impact):**
1. **Promote webhooks + monitors to a first-class `workspaceId`-scoped model** → closes **C-1, C-2** in one migration.
2. **Add `assertScanAccess`/`assertSiteAccess` helper** (promote the existing `trends` pattern) and call it in vault/vpat/statement/risk/score/simulate → closes **C-3, S-3**.
3. **Fix the cron cadence** to `*/5` + per-workspace fairness → closes **C-4** (one-line + fairness).
4. **Atomic schedule claim** (`FOR UPDATE SKIP LOCKED`) → closes **C1/R-2**.
5. **Integration fetch timeouts + `Promise.allSettled`** → closes **R-3** (one-pattern copy).

**Sprint 2 — Make sold features actually work:**
6. **Persist crawl through the service layer + DB-backed `CrawlJob`** (R-5) — the XL item; consider an interim synchronous cap.
7. **Persist RUM to Postgres/Upstash** (R-6).
8. **Webhook delivery retries + DLQ** (R-4); fix the **AI model id** (R-8); route **logger.error → Sentry** (R-7).
9. **Harden SSRF** (S-5) and centralize it so it can't be forgotten (see below).

**Sprint 3 — Cost, integrity, credibility:**
10. **Bound the executive + priority + dashboard queries** (PERF-01/02/09); **reuse the browser** for screenshots + wire the pool (PERF-04); **extend `vercel.json` to all browser routes** (PERF-06); **memoize axe source** (PERF-03).
11. **`Decimal` for money** (data-6); **adopt `prisma migrate`** (data-7); **append-only guard baselines** (data-10).
12. **The irony-test UX fixes** — `ModernSelect` a11y (ux-01), `<html lang>` (ux-02), scan-progress live region (ux-04). These are cheap and directly protect enterprise demos.

**Continuous — pay down the "built but never wired" debt:**
13. Wire `env.ts` at boot (Q2); consolidate to one error helper + codemod (Q1); extract `authenticateApiKey` (Q3, also finishes S-6); delete dead queue modules (Q6); add the three high-risk test suites (Q9).

**Architectural principle to adopt (prevents recurrence):** *security by construction, not by discipline.* The IDOR and SSRF findings exist because ownership checks and URL validation are **per-route opt-in** — easy to forget. Funnel every scan/fetch through a single guarded gateway (the browser-launch layer + a `getAuthedWorkspaceScan()` data accessor) so a new route **cannot** skip the check.

---

## 9. Novel features — the "doesn't exist anywhere" concepts

These are ranked by *defensibility × buildability-on-existing-primitives*. Every one reuses real RegLayer modules (cited) rather than a rebuild. The deep theme: **RegLayer uniquely owns scanning + remediation + verification + production RUM + legal modeling + a multi-tenant corpus in one place** — so the unbeatable features are the ones that *join* those stages, which no point-tool can assemble.

### Tier 1 — Build these (high moat, leverage existing strength)

**① Anchored Evidence Chain (court-grade proof)** — `M` — *Legal moat.*
Turn the vault's self-checksum into externally-anchored, RFC-3161-timestamped, **Merkle-hash-chained** evidence (each proof folds in the previous proof's hash; the hash is co-signed by a neutral TSA / OpenTimestamps Bitcoin anchor). **Novelty:** no accessibility vendor offers third-party-anchored, independently-verifiable evidence — they sell PDFs a defendant generates about themselves, which opposing counsel dismantles in cross-examination. **Build on:** `proofEngine.ts` (issue/verify/generateHash), `ComplianceProof` model (+`prevHash/tsaToken/anchorProof`), the existing `/api/vault/[proofId]/verify`. **Moat:** the value comes precisely from RegLayer *not* controlling the timestamp; a chained, anchored history can't be backfilled after a lawsuit starts. *Also fixes data-9.*

**② Litigation Defense File (auto-assembled good-faith dossier)** — `L` — *Legal moat.*
One click assembles the chronological, hash-anchored "ongoing good-faith remediation effort" dossier that ADA/EAA defense actually hinges on — from data RegLayer already records but never assembles: per-violation status transitions (`statusUpdatedBy/At`, `verifiedAt`), re-scan verifications, the full scan time series, existing proofs. **Novelty:** competitors produce point-in-time reports; nobody emits a court-formatted *timeline*. **Build on:** `violations/status.ts`, `proofEngine.listProofs`, `vpat-generator` rendering (apply the `escapeHtml` the VPAT path is missing). **Moat:** value scales with the *length* of documented history — a switching customer abandons their multi-year good-faith trail.

**③ Demand-Letter Triage & Exposure-Delta Engine** — `L` — *Legal moat.*
Paste an ADA demand letter; RegLayer maps each alleged violation onto your historical Scan/Violation records and answers per-claim: *was this present on the alleged date? when was it fixed? is there an anchored proof?* plus the dollar exposure delta. **Novelty:** serial-plaintiff letters recycle ~6 violation types — exactly the `LITIGATION_WEIGHTS` rules — yet no tool does adversarial **claim rebuttal**; they only describe your site to you. **Build on:** `guardEngine` diff-by-key logic, `legalRiskEngine` exposure math, Scan/Violation history, `deadlineEngine` penalty info, existing `gpt-4o-mini`. **Moat:** the rebuttal is only as strong as evidence accumulated *before* the letter — retroactive but uncopyable.

**④ Fix Genome — crowd-verified remediation outcomes ledger** — `L` — *Data-network moat.*
Record, per violation pattern, *which specific fix actually moved the needle in production* (verified by re-scan + RUM barrier-drop), then recommend the highest-success-rate fix for your exact fingerprint with real "works X% / median Y days" confidence. **Novelty:** every tool emits generic static fixes from axe's help text; none learn from outcomes. RegLayer has the three rare ingredients — auto-fixes, re-scan verification (`verifyViolationFix`), and RUM confirmation — in one place. **Build on:** `violations/status.ts`, `priorityEngine`/`fix-prioritizer`, `remediation/engine.ts`, `rum/collector.ts`, the cross-tenant `groupBy`. **Moat:** the before/after + RUM corroboration is available only to a vendor who owns all four stages.

**⑤ Vendor Accessibility Liability Graph (VALG)** — `L` — *Data-network moat.*
A cross-tenant graph scoring every third-party widget (Intercom, OneTrust, Stripe, YouTube) by the real-world a11y liability it injects across all sites that embed it — "the Moody's of web-component accessibility," with version-over-time regression ("Intercom v6 regressed last Tuesday across 340 sites"). **Novelty:** no tool even attributes violations to *named* vendors, let alone rolls them up cross-tenant. **Build on:** `vendorRiskScanner.ts` (already maps selectors→named vendors), a new `VendorObservation` table, the nightly cross-tenant aggregation pattern, `regressionDetector`. **Moat:** worthless at n=1; compounds with every scan; competitors with single-site licenses physically lack the corpus. Opens a B2B2B "vendor self-serve scorecard" SKU.

### Tier 2 — High-value, ship after the Tier-1 reliability fixes unblock them

**⑥ DOM-to-Source Blame Map (a11y sourcemap)** — `L` — *DevEx.* Resolve every axe DOM selector back to `file:line + component` via React fiber `__debugSource` / a shipped SWC plugin breadcrumb — so PR reviews land **inline on real code**. `github-review.ts:265-281` literally gives up here today (returns `[]` with a comment admitting it). Unlocks true blocking gates devs trust.

**⑦ Autonomous Fix-PR Agent with pre-merge self-verification** — `XL` — *AI-native.* On a violation, open a real source PR with fixes, **re-scan the PR's preview deploy to prove the fix works before a human reviews**. The verify-before-review loop (own both the fixer *and* the scanner that grades it) is the novel, defensible piece. Builds on `github.ts`, `gate/review` `generateFix`, `guardEngine`, `performScan`, plus ⑥ and ⑨.

**⑧ Live Barrier Heatmap — cross-tenant RUM benchmarking** — `L` — *Data-network.* "CrUX for accessibility": industry percentiles of *actual* real-user barriers (focus traps, keyboard dead-ends) from the RUM corpus — "your checkout focus-trap rate is 4× the ecommerce median." No equivalent dataset exists publicly or commercially. **Prerequisite: R-6 (persist RUM) must land first.** Also a marketing/analyst-relations flywheel ("State of Real-World Accessibility" index).

**⑨ Design-System-Aware Remediation Memory (Tenant DNA)** — `L` — *AI-native.* Learn each tenant's own components/naming/alt-text voice from accepted fixes; apply **tenant-specific** remediations instead of the global hardcoded `ACTIONS` list. Per-tenant fix model that improves from approve/reject signal — directly attacks the "overlays apply wrong global fixes and get sued" weakness. Builds on `smartPipeline`, `remediate/script`, `remediate/beacon`, `violations/status`, `design-system/scanner`.

**⑩ Continuous Conformance Attestation Stream (anti-decay warranty)** — `L` — *Legal moat.* Auto-issue an anchored `CONTINUOUS_MONITORING` proof on every scheduled scan, enforce an **absolute regulatory floor** (not the ratcheting baseline that currently lets sites decay indefinitely — data-10), and **auto-revoke the public certificate** the instant the floor breaks (revocation also anchored, so the lapse window is provably bounded). Being willing to take your own badge down is a credibility signal overlay vendors structurally cannot match. *Finally wires the dead `calculateLitigationRisk` into scan completion.*

### Tier 3 — Strong adjacencies
**⑪ Authenticated-Flow Remediation Agent** (`M`, reach behind-login checkout/dashboards via the encrypted `AuthConfig` + journey scanner — the highest-litigation, industry-wide-unscanned surface). **⑫ Regression-Cause Attribution** (`L`, git-blame for a11y regressions — "PR #482's NavBar refactor introduced 12 unlabeled buttons"). **⑬ Preview-Deploy Diff Gate** (`M`, scan only PR-changed routes — 10-50× faster CI, the #1 reason gates get disabled). **⑭ Per-Component Accessibility Budgets** (`M`, fail the PR that regresses `<Button>` used on 47 routes). **⑮ Gradual-Decay Trend Gate** (`S`, fail on cumulative drift from a *locked* release baseline — closes the auto-promote loophole). **⑯ Self-Healing Fixes that Promote to Source** (`L`, treat the runtime overlay as an A/B harness, graduate proven fixes to source PRs, and *shrink the script* — weaponizes the overlay industry's own weakness).

### Agency growth (turns the dormant white-label schema into revenue)
**⑰ Agency Margin Ledger & Auto-Markup** (`L`, activates the `Agency.revenueSharePct` field that **has zero non-generated callers today** — per-client markup + live margin P&L). **⑱ Cross-Client Portfolio Command Center** (`M`, the first rollup that crosses the `AgencyClient` boundary — litigation-$-weighted triage queue across all managed clients; *requires the S-3 ownership fix first*). **⑲ Co-Signed Tester Marketplace** (`XL`, three-way revenue over the dormant `Tester`/`AuditRequest` models + lived-experience tester pool — Stripe Connect is the only genuinely new external piece). **⑳ Agency-Attested Co-Signed Proof** (`M`) + **White-Label Report Studio** (`M`, the PDF generator hardcodes "RegLayer Compliance Report" while branded *email* already exists — close the gap + schedule auto-delivery).

---

## 10. Quick wins (ship this week — S-effort, high-value)
- Cron `"0 6 * * *"` → `"*/5 * * * *"` (**C-4**, the silent SLA breach).
- `AbortSignal.timeout(10000)` on the 4 integration fetches (**R-3**).
- Memoize axe source (**PERF-03**); extend `vercel.json` to all browser routes (**PERF-06**).
- `<html lang>` sync `useEffect` (**ux-02**); scan-progress `aria-live` region (**ux-04**).
- Fix the AI model id (**R-8**); route `logger.error` → Sentry (**R-7**).
- Import `env.ts` at boot (**Q2**).

## 11. What was deliberately NOT flagged (and what the verifier refuted)
Honored as intentional: dynamic-rendering on all pages (`headers()` branding), lucide barrel imports, single root `error.tsx`, deliberate library-boundary casts, the generous brute-force guard, the proxy auth-gating all `/api/*`. **Refuted by the adversarial pass** (so they're *not* in the findings): "scan.id collisions corrupt data" (math misstated, constraints ignored), "monitors create dangling FKs" (Postgres enforces the FK), "stored XSS in VPAT" (sink real but the stated vector/impact wrong), "mass-assignment RCE on guard PATCH" (real input-validation gap, but not the exploit described). Billing webhook metadata propagation and the synchronous primary `/api/scan` path were verified **sound**.

---

*Full per-finding evidence, verifier reasoning, and all 25 feature concepts with engineering approaches are preserved in the workflow transcript.*
