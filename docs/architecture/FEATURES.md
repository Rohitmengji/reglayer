# RegLayer — Feature Inventory (v0.1.0)

## Shipped Features

### 1. Accessibility Scanning Engine
- **Single-page scan:** axe-core 4.11 powered WCAG 2.1 analysis
- **Multi-page crawl:** BFS crawler up to 10 pages per domain
- **Async scanning:** Non-blocking job queue with polling
- **Dual-environment browser:** Playwright (local) / puppeteer-core (serverless)
- **Screenshot evidence:** Full-page capture at 1280×720

### 2. Compliance Intelligence
- **WCAG 2.1 AA mapping:** 8 core rules evaluated per scan
- **European Accessibility Act (EAA):** 4 rules aligned to EN 301 549
- **Compliance scoring:** 0-100 weighted score based on severity
- **Severity classification:** Critical / Serious / Moderate / Minor
- **Per-criterion results:** Pass/Fail per WCAG success criterion

### 3. AI-Powered Explanations (GPT-4o-mini)
- **Violation explainer:** Plain-language description + fix suggestion
- **Compliance summary:** Executive report with prioritized recommendations
- **Graceful degradation:** Works without API key (AI features disabled)

### 4. Reporting
- **PDF export:** 2-page professional compliance report
- **Includes:** Score, violations, WCAG criteria, metadata
- **Client-side generation:** jsPDF + autotable

### 5. Scheduled Monitoring
- **Cron schedules:** Recurring scans with custom frequency
- **CRUD management:** Create, enable/disable, delete
- **Manual trigger:** Run all due scans on-demand

### 6. Authentication & Security
- **Credentials provider:** Demo login (admin@reglayer.dev)
- **Google OAuth:** Optional SSO (conditional on env vars)
- **JWT sessions:** 24-hour expiry, stateless
- **Route protection:** Proxy guards all app/API routes

### 7. Dashboard & UI
- **Landing page:** Public marketing page with feature showcase
- **Score card:** Circular gauge with severity breakdown
- **Compliance trend:** Historical score chart
- **Scan history:** Persistent list with detail views
- **Violation cards:** Expandable with affected elements, fix guidance
- **Sign out:** User info + logout in sidebar

### 8. Infrastructure
- **Vercel deployment:** Auto-deploy from GitHub push
- **Serverless scanning:** puppeteer-core + @sparticuz/chromium
- **Structured logging:** JSON logs with service context
- **Input validation:** Zod schemas at all boundaries
- **Error handling:** Graceful failures with user-friendly messages

---

## Technical Metrics

| Metric | Value |
|--------|-------|
| Total source files | ~45 |
| API endpoints | 10 |
| UI pages | 7 |
| Components | 12 |
| Dependencies | 25+ |
| Test files | 3 |
| Scan duration (avg) | 6-18s |
| PDF size (avg) | ~17KB |
| Vercel function timeout | 60s |
| Vercel function memory | 1024MB |
