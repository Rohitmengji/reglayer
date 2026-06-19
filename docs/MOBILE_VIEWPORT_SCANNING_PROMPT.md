# Mobile-Viewport Scanning — Implementation Prompt

> **Provenance.** Roadmap feature #5 from the strategic analysis (score 34.3/50, ~5 engineer-weeks). The cheap, honest net-new win now that the #1+#2 "legal-evidence" arc is shipped. Verified against the repo at writing.
>
> **How to use:** paste everything below the rule into GitHub Copilot as the task brief. It is self-contained.

---

# BUILD: Mobile-Viewport Scanning (v1) — RegLayer

You are a senior engineer in the **RegLayer** repo (Next.js 16 App Router, Prisma + Neon, axe-core + Playwright (local) / puppeteer-core + @sparticuz/chromium (serverless), TypeScript). Implement **multi-viewport / device-emulated accessibility scanning v1**. Small, verifiable commits.

## 0. Non-negotiable constraints
- **Read `node_modules/next/dist/docs/` before using any Next.js API** (this repo's Next has breaking changes vs. your training data).
- **CI gate stays green**: `npm run lint` (**0 eslint errors**, warnings OK), `npx tsc --noEmit` clean, `npx next build` under the `.next/static` budget (~6.5 MiB), `vitest` ≥20% coverage, `npm audit --omit=dev --audit-level=high` clean.
- **No hollow features / honest labels.** This is **emulated responsive-web** scanning, NOT native iOS/Android testing (the stack has no native mobile runtime). Label it exactly that everywhere. Never imply real-device or native-app testing.
- **Serverless limits are hard:** the function budget is ~30–60s and concurrent Chromium is capped at **2** (multi-Chromium OOMs). The viewport matrix MUST be bounded and run with limited concurrency, or scans will time out / OOM.
- **All API routes**: authenticated + workspace-scoped (IDOR), rate-limited on mutations, plan-gated. Pages render dynamic (no `force-static`). File headers use the `WHY/WHAT/HOW` convention.
- **Prefer zero migration** for v1 (the repo is `prisma db push`-only, no migrations dir) — persist into an existing JSON column; add a model only if clearly justified (then `db push`).

## 1. What you are building
Run the existing axe scan across a **bounded matrix of device viewports** (mobile, tablet, desktop) and surface **viewport-specific WCAG failures** that a single 1280×720 scan misses — chiefly:
- **1.4.10 Reflow** (horizontal scroll / clipped content at 320px-equivalent),
- **1.3.4 Orientation** (locked orientation),
- **1.4.4 Resize Text** + **1.4.12 Text Spacing** (overflow at zoom),
- **2.5.5 / 2.5.8 Target Size** (tap targets too small on mobile),
- **1.4.13 Content on Hover/Focus** (hover-only UI unusable on touch).

v1 delivers: a device matrix → per-profile axe results → an aggregated report flagging which violations are **viewport-specific** (appear on some profiles, not others) → surfaced in the scan UI. It is **not** a new scanner — it reuses the existing pipeline with different viewport/UA options.

## 2. Existing infrastructure to REUSE (do not rebuild)
- **`src/lib/scanner/accessibility/axeScanner.ts` → `runAccessibilityScan(url, options?: ScanOptions)`** — the scan entry. It already honors `options.viewport` and `options.userAgent`.
- **`src/lib/scanner/browser/launch.ts`** — `page.setUserAgent(options?.userAgent || UA)` and `page.setViewport(options?.viewport || VIEWPORT)` (≈L76-78). Viewport/UA are already threaded end to end. The serverless wrapper exposes `newPage()` + `setViewport`/`setUserAgent`.
- **`src/lib/types` → `ScanOptions`** — extend if needed (e.g. add `isMobile`/`deviceScaleFactor`).
- **`src/lib/scanner/pipelines/scanPipeline.ts`** — orchestrates a scan; model the multi-profile runner on it.
- **`src/lib/scanner/accessibility/severityEngine.ts` / `src/lib/scoring/reportScore.ts`** — reuse for per-profile scoring (canonical score).
- **`src/lib/scanner/accessibility/wcagMapper.ts`** — map results to WCAG criteria.
- Plan-gating: `src/lib/credits/plan-limits.ts` (`PLAN_LIMITS[plan].features`); access guards: `src/lib/auth/access.ts` (`assertScanAccess`/`assertSiteAccess`); rate limit: `src/lib/rate-limit-middleware.ts` (`applyRateLimit`).

## 3. Files to CREATE / EXTEND
**Create:**
- `src/lib/scanner/devices.ts` — `DEVICE_PROFILES: DeviceProfile[]` (pure data). Each: `{ id, label, viewport: {width,height}, userAgent, isMobile, deviceScaleFactor }`. Bounded set: e.g. `mobile` (390×844, iPhone-class UA, isMobile), `tablet` (820×1180), `desktop` (1280×720, current default). Keep it ≤3 in v1 for the time budget.
- `src/lib/scanner/multiViewportScan.ts` — orchestrator: `runMultiViewportScan(url, profiles, opts)` runs `runAccessibilityScan` per profile with **concurrency ≤ 2** (reuse any existing concurrency cap helper), returns `Array<{ profile, score, violations, error? }>`. Per-profile try/catch so one failure doesn't kill the set.
- `src/lib/scanner/viewportDiff.ts` — **pure** `diffViewportResults(perProfile)` → which violations are universal vs viewport-specific (by `ruleId` + affected selector), plus a per-profile summary. Fully unit-tested.
- `src/app/api/scans/[id]/viewports/route.ts` — `GET` returns the stored multi-viewport result; `POST` triggers a multi-viewport scan for the scan's URL (auth + `assertScanAccess` + plan-gate + `applyRateLimit`).
- Tests: `src/__tests__/viewport-diff.test.ts` (universal vs viewport-specific partition; empty/one-profile/all-fail edge cases).

**Extend:**
- `src/lib/types` — `ScanOptions` with optional `isMobile`, `deviceScaleFactor`.
- `src/lib/scanner/browser/launch.ts` — pass `isMobile`/`deviceScaleFactor` into `setViewport` when present (puppeteer supports these in the viewport object; Playwright via context options — keep the existing dual-path shape).
- The scan-detail UI (`src/app/scans/[id]/page.tsx`) — add a **"Responsive / viewport"** section: a small matrix (profiles × pass/fail), each violation badged **"viewport-specific (mobile)"** vs "all viewports", honestly labeled "Emulated viewport — not native device testing."
- `src/lib/credits/plan-limits.ts` — gate multi-viewport behind a `multiViewport` feature flag (decide tiers; mirror `manualTesting`).

## 4. Data model (prefer zero migration)
Store the multi-viewport result in an existing JSON column on `Scan` (e.g. extend `Scan.metadata` JSON with a `viewports` key, or reuse a findings-style field). Shape:
```ts
{
  viewports: {
    generatedAt: string,
    profiles: Array<{
      id: string; label: string;
      score: number;            // canonical score for this profile
      violationCount: number;
      ruleIds: string[];        // rules that failed on this profile
      error?: string;
    }>,
    viewportSpecific: Array<{ ruleId: string; profiles: string[]; }>, // failed on these profiles only
  }
}
```
Only add a Prisma model if you need to query per-profile across scans (then `db push`).

## 5. Concurrency, timeout & cost (critical)
- Run profiles with **concurrency ≤ 2** (serverless OOM cap). On Vercel, prefer **sequential** with a per-profile timeout so the total stays < the function budget; cap the matrix at 3 profiles.
- Each profile launches/uses a page via the existing `launchBrowser()` path (which already retries transient "Target closed"). Reuse one browser, multiple pages/contexts where possible rather than N browsers.
- If the full matrix can't finish in budget, return partial results with an honest "N of M viewports completed" note — never fabricate missing profiles.

## 6. Honest labeling (hard requirement)
- Everywhere: **"Emulated viewport (responsive web)"** — never "native mobile", "iOS/Android testing", or "real device".
- A violation is "viewport-specific" only if it genuinely failed on some profiles and not others (from `diffViewportResults`) — don't guess.
- Per-profile scores use the canonical `scoreFromStoredViolations` so they're consistent with the rest of the app.

## 7. Tests & acceptance
- Unit-test `diffViewportResults` (universal vs viewport-specific; one-profile; all-fail; empty).
- Route test: IDOR guard (foreign workspace → 403/404) on the viewports route.
- **Acceptance:** for a completed scan, a gated user triggers a multi-viewport scan; the UI shows a profiles×results matrix with viewport-specific violations correctly flagged and honestly labeled as emulated; a profile that errors degrades to a partial result; FREE users are honestly gated.

## 8. Definition of done
`npm run lint` (0 errors) · `npx tsc --noEmit` clean · `npx next build` green under budget · `vitest` green ≥20% coverage · `npm audit --omit=dev --audit-level=high` clean. Commit in chunks: device profiles + diff core (+tests) → multi-viewport orchestrator → API route → UI → plan-gate.

---

## Roadmap context
- **#1 AI-Guided Manual Testing** — shipped + hardened (live).
- **#2 VPAT/ACR + EAA Generator** — already substantially built; now consumes #1's manual verdicts (the "legal-evidence arc" is effectively closed).
- **#5 Mobile-Viewport Scanning** (this doc) — cheap, honest, net-new.
- **#3 Document Accessibility (PDF/Office)** — biggest market prize, genuinely new engine; scope as the next flagship.
- **Deferred:** Figma/IDE/CI "shift-left suite" (no direct regulatory driver; a real CI gate already exists via `guardEngine`/`/api/gate`) and the human-testing marketplace (two-sided cold-start, not a feature).
