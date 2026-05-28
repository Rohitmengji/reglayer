# RegLayer — Workflow Documentation

## Scan Workflow

```mermaid
sequenceDiagram
    participant User
    participant Dashboard
    participant API
    participant Scanner
    participant DB

    User->>Dashboard: Enter URL, click Scan
    Dashboard->>API: POST /api/scan/async
    API->>Scanner: Queue scan job
    API-->>Dashboard: { jobId }
    Dashboard->>API: GET /api/scan/async?jobId=xxx (poll)
    Scanner->>Scanner: Launch browser (Playwright/puppeteer)
    Scanner->>Scanner: Navigate to URL
    Scanner->>Scanner: Inject axe-core, run analysis
    Scanner->>Scanner: Calculate score, classify violations
    Scanner->>DB: Save scan + violations
    Scanner->>API: Job complete
    API-->>Dashboard: { scan, violations }
    Dashboard->>User: Display results
```

---

## CI Gatekeeper Workflow

```mermaid
sequenceDiagram
    participant PR as Pull Request
    participant GHA as GitHub Action
    participant API as RegLayer API
    participant AI as OpenAI
    participant GH as GitHub API

    PR->>GHA: deployment_status / pull_request event
    GHA->>API: POST /api/gate/review
    API->>API: Scan preview URL
    API->>AI: Generate fix suggestions
    AI-->>API: Code fixes + explanations
    API->>GH: POST PR Review (approve/request_changes)
    GH-->>PR: Inline fix suggestions appear
    GHA-->>PR: Status check (pass/fail)
```

---

## Remediation Workflow

### Client-Side (Drop-in Script)
```mermaid
flowchart LR
    A[Site loads] --> B[Script tag executes]
    B --> C{DOM Ready?}
    C -->|Yes| D[Apply fixes]
    D --> E[Report to beacon]
    C -->|No| F[Wait for DOMContentLoaded]
    F --> D
```

### Server-Side (Proxy Mode)
```mermaid
flowchart LR
    A[POST /api/remediate] --> B[Fetch target URL]
    B --> C[Parse with jsdom]
    C --> D[Apply fix transforms]
    D --> E[Return patched HTML]
```

---

## RUM Event Flow

```mermaid
flowchart TD
    A[Production site loads RUM snippet] --> B[Monitor user interactions]
    B --> C{Barrier detected?}
    C -->|Focus trap| D[Queue event]
    C -->|Keyboard failure| D
    C -->|Missing label| D
    C -->|ARIA error| D
    C -->|Low contrast| D
    D --> E{Batch full or timer?}
    E -->|Yes| F[POST /api/rum/events]
    E -->|No| B
    F --> G[Aggregate in collector]
    G --> H[Dashboard displays metrics]
```

---

## Design System Scan Workflow

```mermaid
flowchart TD
    A[User provides Storybook URL] --> B[Fetch stories.json / index.json]
    B --> C[Identify component stories]
    C --> D[For each component: fetch iframe HTML]
    D --> E[Run 8 accessibility rules]
    E --> F[Score per component]
    F --> G[Identify hotspots across components]
    G --> H[Generate report with recommendations]
```

---

## Journey Flow Scan

```mermaid
sequenceDiagram
    participant User
    participant API
    participant Playwright
    participant Page

    User->>API: POST /api/journey (preset + baseUrl)
    API->>Playwright: Launch browser
    loop For each step
        Playwright->>Page: Execute action (navigate/click/type/tab)
        Playwright->>Page: Check focus management
        Playwright->>Page: Monitor live regions (MutationObserver)
        Playwright->>Page: Detect keyboard traps
        Playwright->>Page: Verify heading structure
    end
    Playwright-->>API: Journey results
    API-->>User: { score, steps, issues, recommendations }
```

---

## Webhook Notification Flow

```mermaid
flowchart TD
    A[Scan completes] --> B[Integration Dispatcher]
    B --> C{Which integrations connected?}
    C -->|Slack| D[POST to Slack webhook]
    C -->|Email| E[Send via Nodemailer]
    C -->|Custom webhook| F[POST to registered URL]
    C -->|GitHub| G[Create issue / PR comment]
    D --> H[Log to audit trail]
    E --> H
    F --> H
    G --> H
```

---

## Plan Gating Logic

```mermaid
flowchart TD
    A[API request arrives] --> B[Authenticate user]
    B --> C[Find WorkspaceMember]
    C --> D[Get workspace.plan]
    D --> E{Feature requires?}
    E -->|Free| F[Allow]
    E -->|Pro| G{Plan >= PRO?}
    E -->|Enterprise| H{Plan = ENTERPRISE?}
    G -->|Yes| F
    G -->|No| I[403 Upgrade Required]
    H -->|Yes| F
    H -->|No| I
```
