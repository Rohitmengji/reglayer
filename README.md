# RegLayer — Accessibility Scanner

> Developer-native compliance infrastructure.

RegLayer scans websites for accessibility issues, compliance risks, and frontend semantic problems. Built with enterprise architecture principles.

## Quick Start

```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — redirects to dashboard.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| Scanner | Playwright + axe-core |
| State | Zustand + React Query |
| Validation | Zod |

## Project Structure

```
src/
├── app/              → Pages and API routes
├── components/       → UI components (shadcn/ui based)
├── lib/
│   ├── scanner/      → Browser automation + axe-core engine
│   ├── compliance/   → Rule engine + policy evaluator
│   ├── ai/           → AI assistants (future)
│   ├── telemetry/    → Logging + metrics
│   ├── validations/  → Zod schemas
│   └── types/        → Shared type definitions
├── services/         → Business orchestration layer
└── stores/           → Zustand state stores
```

## API

### `POST /api/scan`

```json
{
  "url": "https://example.com",
  "options": {
    "includeScreenshot": false,
    "timeout": 30000
  }
}
```

### `GET /api/health`

Returns service status and uptime.

## Architecture

See [architecture.md](./architecture.md) for full system design documentation.

## Future Roadmap

- [ ] PostgreSQL persistence
- [ ] BullMQ async scanning
- [ ] AI-powered explanations
- [ ] Multi-page crawling
- [ ] Compliance report PDF export
- [ ] OPA rule engine integration
