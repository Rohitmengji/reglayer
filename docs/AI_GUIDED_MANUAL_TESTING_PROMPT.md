# AI-Guided Manual Testing (v1) — Implementation Prompt

> **Provenance.** This is the #1-ranked next feature from a 46-agent strategic analysis
> (current-product map + 2026 regulatory/competitive/market research + 3-persona
> ideation + 3-lens adversarial scoring of 12 candidates). It scored 39.1/50, unanimous
> "keep". Every code reference below was verified against the repo at the time of writing.
>
> **How to use:** paste everything below the rule into GitHub Copilot (or another coding
> agent with repo access) as the task brief. It is self-contained.

---

# BUILD: AI-Guided Manual Testing (v1) — RegLayer

You are a senior engineer working in the **RegLayer** repo (Next.js 16 App Router + Turbopack, Prisma + Neon Postgres, NextAuth, axe-core/Playwright scanning, TypeScript). Implement **AI-Guided Manual Testing v1** exactly as specified. Work in small, verifiable commits.

## 0. Non-negotiable constraints (read before writing code)
- **Read `node_modules/next/dist/docs/` for any Next.js API before using it.** Per `AGENTS.md`, this repo's Next.js has breaking changes vs. your training data. Heed deprecation notices.
- **CI gate must stay green**: `npm run lint` (**zero eslint errors**; warnings OK), `npx tsc --noEmit` clean, `npx next build` succeeds under the `.next/static` budget (~6.5 MiB), `vitest` ≥20% line coverage, `npm audit --omit=dev --audit-level=high` clean.
- **No hollow features.** Every label must map to real, working code. Honest labeling is mandatory (see §10). The product owner reacts strongly to cosmetic/over-claiming UI.
- **Prisma is schema-push only (no migrations dir).** v1 must ship with **zero schema migration** — persist into the existing `AuditRequest.findings` JSON column. Do not add a model in v1.
- **Every API route must be authenticated and workspace-scoped** (IDOR guards). Reuse existing access helpers. Sensitive mutations get `applyRateLimit`.
- **Pages render dynamic** — do NOT add `export const dynamic = "force-static"` (the root layout calls `await headers()` for multi-tenant branding).
- **AI augments, never decides.** Null-safe fallback when `OPENAI_API_KEY` is unset; **never cache fallback output**; flag AI-vs-fallback in the response.
- Match file/comment conventions (each file starts with a `WHY/WHAT/HOW` header block).

## 1. What you are building
Structured, **human-in-the-loop manual test flows that close the ~60% of WCAG 2.2 A/AA criteria that automated scanning cannot determine** (focus order, keyboard operability, meaningful alt text, semantic structure, sensory/cognitive criteria). The output is a **dated, per-criterion, attested manual-test record** that a lawyer or procurement officer would accept — fused with the existing automated scan score into a combined conformance picture, and wired into the Defense File and VPAT.

**v1 delivers:** plan generator → in-product guided checklist (with live accessibility-tree evidence) → human verdict capture → `manualScore`/`combinedScore` rollup → feeds Defense File + VPAT. Plan-gated to PRO/ENTERPRISE.

**v1 explicitly is NOT:** the human-tester *marketplace* (`matchTesters` in `src/lib/testing/humanTestingEngine.ts` stays unwired — out of scope), and NOT real NVDA/JAWS output (the narration engine is a **computed accessibility-tree simulation** and must be labeled as such).

## 2. Existing infrastructure to REUSE (do not rebuild)
- **`prisma/schema.prisma` → `model AuditRequest`** — already has `findings Json?`, `automatedScore Float?`, `manualScore Float?`, `combinedScore Float?`, `type String`, `status String` (`draft|submitted|matched|in-progress|review|completed|cancelled`), `workspaceId`, `siteId`. **This is the v1 container.**
- **`src/lib/screen-reader/narration-engine.ts` → `captureNarration(page): Promise<ScreenReaderSnapshot>`** — walks the live a11y tree. `ScreenReaderSnapshot = { url, pageTitle, steps: NarrationStep[], totalElements, landmarks, headings, interactiveElements, capturedAt }`; `NarrationStep = { index, announcement, role, name, selector, bounds, level }`. This is your evidence source for focus-order/semantics/alt-text items.
- **`src/app/api/scans/[id]/wcag-matrix/route.ts` → `WCAG_CRITERIA`** (52 entries: `{ criterion, level, principle, title }`) — the criterion catalog. **Extract it into a shared module** `src/lib/wcag/criteria.ts` and import from both places (don't duplicate).
- **`src/lib/scanner/accessibility/wcagMapper.ts` → `WCAG_CRITERIA_MAP`, `mapTagsToWcag(tags)`** — maps axe tags → WCAG criteria; use it to compute which criteria the automated scan already covered.
- **`src/lib/testing/humanTestingEngine.ts` → `createAuditRequest({workspaceId, siteId, type, scope, requirements, urgency, budget})`** and `listAuditRequests(workspaceId)` — extend this module; add a `type: "manual-test"`.
- **`src/lib/credits/plan-limits.ts`** — `PLAN_LIMITS[plan].features` (add `manualTesting`), `AI_CREDIT_COSTS` (add an entry). **`src/lib/credits/index.ts` → `consumeCredits(userId, action)`**.
- **`src/lib/ai/`** (`explainers/`, `summaries/`, `prompts/`, `structuredOutput.ts`) — clone the existing AI-module pattern (Zod-validated structured output, OpenAI call with null-safe fallback). Follow the established honesty pattern: flag `aiGenerated:false` on fallback and never cache fallback.
- **`src/lib/auth/access.ts` → `assertScanAccess(...)` (≈L59), `assertSiteAccess(...)` (≈L129)** — use for route IDOR guards.
- **`src/lib/compliance/vpat-generator.ts`**, **`src/lib/defense/defenseFile.ts` + `loadDefenseFileData.ts`** — injection points for the manual record (§9).
- **`src/lib/scoring/reportScore.ts` → `scoreFromStoredViolations(violations)`** — the canonical automated score; use it for `automatedScore`.

## 3. Files to CREATE / EXTEND
**Create:**
- `src/lib/wcag/criteria.ts` — shared `WCAG_CRITERIA` catalog (moved from wcag-matrix route) + `MANUAL_ONLY_CRITERIA` set (see §6) + helpers. Pure, unit-tested.
- `src/lib/testing/manualTestPlan.ts` — **pure** `buildTestPlan(scanCoverage, snapshot): ManualTestItem[]` (no Prisma/Next imports → fully unit-testable). Types: `ManualTestItem`, `ManualTestPlan`, `ManualVerdict = "pass"|"fail"|"na"|"untested"`.
- `src/lib/testing/manualScore.ts` — pure `rollupManualScore(items)` and `combineScores(automated, manual)`.
- `src/lib/ai/manualTestGuidance.ts` — AI guidance drafter (§7).
- `src/app/api/audits/route.ts` — `POST` (create a `manual-test` AuditRequest from a `scanId`), `GET` (list).
- `src/app/api/audits/[id]/plan/route.ts` — `GET` the generated plan (+ guidance).
- `src/app/api/audits/[id]/items/[criterion]/route.ts` — `PATCH` record a verdict + note.
- `src/app/manual-testing/page.tsx` (+ components under `src/components/manual-testing/`) — the guided-checklist UI, added as a sidebar/nav surface (mirror an existing page like `compliance` for layout + `AppShell`).
- Tests: `src/__tests__/manual-test-plan.test.ts`, `manual-score.test.ts`.

**Extend:**
- `src/app/api/scans/[id]/wcag-matrix/route.ts` — import `WCAG_CRITERIA` from the new shared module.
- `src/lib/testing/humanTestingEngine.ts` — allow `type: "manual-test"`; add `getAuditRequest(id, workspaceId)`.
- `src/lib/credits/plan-limits.ts` — `features.manualTesting: false` (FREE) / `true` (PRO, ENTERPRISE); add `AI_CREDIT_COSTS.MANUAL_TEST_GUIDANCE`.
- `src/lib/defense/defenseFile.ts` + `loadDefenseFileData.ts` — include manual-test events/coverage.
- `src/lib/compliance/vpat-generator.ts` — use manual verdicts where present instead of automated-only inference.
- The sidebar/nav config (find where pages are registered) — add "Manual Testing", gated on `features.manualTesting`.

## 4. Data model (v1 = zero migration)
Store the plan + verdicts inside `AuditRequest.findings` (Json). Canonical shape:
```ts
// AuditRequest.findings for type "manual-test"
{
  version: 1,
  scanId: string,
  generatedAt: string,           // ISO
  snapshotRef: { capturedAt: string, totalElements: number }, // provenance, not the full snapshot
  items: Array<{
    criterion: string;           // "2.4.3"
    level: "A" | "AA";
    title: string;
    principle: string;
    why: string;                 // why this is manual-only / what automation couldn't determine
    guidance: string;            // AI-drafted OR static fallback (see aiGenerated)
    aiGenerated: boolean;        // false = static fallback was used
    evidence: { kind: "narration" | "none"; steps?: number[]; note?: string }; // indices into snapshot.steps
    verdict: "pass" | "fail" | "na" | "untested";
    note: string | null;
    attestedBy: string | null;   // userId  ← capture from day one
    attestedAt: string | null;   // ISO     ← capture from day one
  }>
}
```
Set `manualScore` and `combinedScore` columns on each verdict write. **v2 (later, separate):** normalize into a `ManualTestItem` Prisma model with `@@index([auditRequestId, criterion])` once the JSON shape is stable; do that via `db push`.

## 5. API routes (auth + scoping + gating on ALL)
Every handler: `getServerSession` → 401 if unauthenticated; resolve the caller's workspace; **gate on `PLAN_LIMITS[plan].features.manualTesting`** (402/403 + `upgradeRequired:true` if disabled); IDOR-guard the target (`assertScanAccess`/`assertSiteAccess` / verify the AuditRequest's `workspaceId`); `applyRateLimit` on POST/PATCH.
- **`POST /api/audits`** `{ scanId }` → loads the scan (assertScanAccess), computes automated coverage via `mapTagsToWcag` over the scan's violation tags, runs `buildTestPlan`, creates a `manual-test` AuditRequest with `findings` populated + `automatedScore` copied from the scan's canonical score (`scoreFromStoredViolations`). Returns `{ id }`.
- **`GET /api/audits`** → `listAuditRequests(workspaceId)` filtered to `type:"manual-test"`.
- **`GET /api/audits/[id]/plan`** → the `findings` plan. Lazily fill `guidance` via `manualTestGuidance` (consume credits; cache only AI-generated guidance, never fallback).
- **`PATCH /api/audits/[id]/items/[criterion]`** `{ verdict, note }` → validate (Zod; `note` required for `fail`), write the item with `attestedBy=userId`, `attestedAt=now`, recompute `manualScore`/`combinedScore`, set `status` to `in-progress`/`completed`. Return the updated rollup.

## 6. Test-plan generator (`manualTestPlan.ts`)
- Start from `WCAG_CRITERIA` filtered to levels **A + AA** (drop AAA in v1).
- Compute the **automation-covered** set from the scan (criteria axe reported on). The remainder is candidate-manual.
- Maintain a curated **`MANUAL_ONLY_CRITERIA`** set for criteria automation **cannot determine even when axe is silent** — include at minimum: `1.1.1` (meaningful alt text), `1.3.1`/`1.3.2` (semantics/meaningful sequence), `1.3.3`, `1.4.5`, `2.1.1`/`2.1.2` (keyboard / no trap), `2.4.3` (focus order), `2.4.4`/`2.4.6`/`2.4.7` (link purpose, headings/labels, focus visible — human confirmation), `2.5.3` (label-in-name), `3.1.x`, `3.2.x`, `3.3.x`, `4.1.2` (name/role/value confirmation). A criterion is a manual item if it's in `MANUAL_ONLY_CRITERIA` **or** not automation-covered.
- For each item, attach `why`, and **bind narration evidence**: for focus-order/semantics/alt-text criteria, attach the relevant `snapshot.steps` indices (e.g., 2.4.3 → the ordered reading sequence; 1.1.1 → steps whose `role==="image"`).
- **Order by litigation/impact weight** (reuse the priorities in `src/lib/risk`/`litigationWeights` if present) so the riskiest criteria surface first.

## 7. AI guidance module (`manualTestGuidance.ts`)
- Input: a `ManualTestItem` (criterion + evidence). Output (Zod-validated): `{ guidance: string (concrete how-to-test steps), aiGenerated: boolean }`.
- Use the pinned model + low token cap (≤~800), following the existing `src/lib/ai/` pattern.
- **`if (!process.env.OPENAI_API_KEY)` → return a curated static per-criterion guidance string with `aiGenerated:false`.** Same on API error. **Never cache fallback**; cache only `aiGenerated:true`.
- Consume credits via `consumeCredits(userId, "MANUAL_TEST_GUIDANCE")`.
- **The module returns guidance only — never a verdict.** The human owns pass/fail.

## 8. UI (`/manual-testing`)
- Use `AppShell`; mirror an existing hub page's layout. Plan-gate: if `features.manualTesting` is off, show an honest upgrade prompt.
- Flow: pick a completed scan → "Generate manual test plan" → guided checklist grouped by principle, riskiest first. Each item shows: criterion + title + level, the `why`, AI/fallback guidance (badge "AI-guided" vs "Standard guidance"), the **inline narration evidence** (reading order / roles / names — labeled "Computed accessibility tree (simulation)"), and a verdict control (pass/fail/NA) + note (note required on fail).
- Header rollup: "Automated covered X criteria · Manual evaluated Y · Combined Z% of A/AA criteria evaluated." Use Recharts if charting.
- The UI itself must be accessible: real `<button>`s, `aria-pressed` on verdict toggles, `aria-live` on save, focus management, sr-only headings.

## 9. Wire into Defense File + VPAT
- `defenseFile.ts`/`loadDefenseFileData.ts`: surface manual-test attestations as timeline events (`criterion`, `verdict`, `attestedBy`, `attestedAt`) and include manual coverage in good-faith metrics. Keep the existing honesty framing (record of activity, not exhaustive audit).
- `vpat-generator.ts`: where a manual verdict exists, use it (Supports/Partially/Does Not Support) instead of automated-only inference; clearly attribute the basis.

## 10. Honesty & labeling (hard requirements)
- "**AI-guided**" = the AI drafts *guidance*; the **conformance verdict is human-attested**. Never state or imply the AI/scan "determined conformance" for manual criteria.
- Narration-derived evidence is labeled "**Computed accessibility tree (simulation)**" — never "screen reader output" or "NVDA/JAWS."
- Coverage claims must be exact: "evaluated N of M A/AA criteria (automated + manual)", never "fully compliant."
- Fallback guidance is visibly distinguished from AI guidance.

## 11. Tests & acceptance criteria
- Unit-test the pure cores: `buildTestPlan` (partition correctness, evidence binding, ordering), `rollupManualScore`/`combineScores` (incl. all-untested, all-pass, mixed).
- A route-level test asserting the IDOR guard (foreign workspace → 403/404) on `GET /api/audits/[id]/plan`.
- **Acceptance:** from a completed scan, a PRO user can generate a plan, see manual-only criteria with guidance + narration evidence, record verdicts (note enforced on fail), see `manualScore`/`combinedScore` update, and have the attested record appear in the Defense File and VPAT. FREE users are honestly gated. With `OPENAI_API_KEY` unset, guidance falls back gracefully (flagged), and nothing fabricates a verdict.

## 12. Definition of done
`npm run lint` (0 errors) · `npx tsc --noEmit` clean · `npx next build` green under budget · `vitest` green ≥20% coverage · `npm audit --omit=dev --audit-level=high` clean. Commit in logical chunks (shared catalog → plan generator + tests → AI module → routes → UI → Defense/VPAT wiring).

---

## Appendix — the rest of the prioritized roadmap

For context, the full ranked shortlist from the analysis (score out of 50):

| # | Feature | Score | Effort | Note |
|---|---------|-------|--------|------|
| 1 | **AI-Guided Manual Testing** (this doc) | 39.1 | 7–12w | Closes the ~60% automation misses; makes VPAT/Defense File legally defensible; zero-migration v1. |
| 2 | VPAT/ACR + EAA Conformance Generator | 38.3 | 6w | Cheapest high-value; far stronger once #1 supplies manual evidence. Treat #1+#2 as one "legal-evidence engine" arc. |
| 3 | Document Accessibility (PDF/Office) Engine | 37.3 | 12–18w | Biggest market prize + regulatory tailwind, but a genuinely new engine (weakest arch-fit). Flagship for next quarter. |
| 4 | Code-Shipping AI Remediation (GitHub PRs, not overlays) | 34.6 | 9–14w | Most on-brand anti-overlay wedge; riskiest (PR quality on the pinned model). |
| 5 | Mobile-viewport / device-emulated scanning | 34.3 | 5w | Cheap, honest credibility patch; NOT native iOS/Android. |

**Explicitly deferred:** the Figma/IDE/CI "shift-left suite" (no direct regulatory driver; a real CI gate already exists via `guardEngine`/`/api/gate`), and the human-testing **marketplace** (`matchTesters` exists but it's a two-sided cold-start problem, not a feature).
