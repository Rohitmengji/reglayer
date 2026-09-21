import { PLAN_LIMITS } from "@/lib/credits/plan-limits";

export interface DocSection {
  id: string;
  title: string;
  paragraphs: string[];
  steps?: string[];
  links?: Array<{ href: string; label: string }>;
  code?: string;
  limits?: boolean;
}
export interface DocGuide {
  slug: string;
  title: string;
  summary: string;
  reviewedAt: string;
  quickStart: string[];
  sections: DocSection[];
}

export const DOC_PLAN_ROWS = Object.entries(PLAN_LIMITS).map(([plan, limits]) => ({
  plan, scans: limits.scansPerMonth, pages: limits.pagesPerScan, members: limits.teamMembers, auditDays: limits.auditLogDays,
}));

export const CI_SCAN_EXAMPLE = `# Run with Bash; curl and jq are required.
set -euo pipefail
# Set REGLAYER_URL to your deployment URL and REGLAYER_API_KEY to a CI secret.
# Only scan sites you own or have permission to test.
curl --fail-with-body --silent --show-error --max-time 100 \\
  -X POST "\${REGLAYER_URL}/api/ci/scan" \\
  -H "Authorization: Bearer \${REGLAYER_API_KEY}" \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://example.com","failOnScore":80,"failOnCritical":0,"usePolicies":false}' \\
  | jq -e '.passed == true and .scanId != null'`;

export const DOC_GUIDES: DocGuide[] = [
  {
    slug: "getting-started", title: "Getting Started", reviewedAt: "2026-09-21",
    summary: "Sign in, check your workspace, run an authorized scan, and review the evidence.",
    quickStart: ["Sign in using an available provider or your email and password.", "Confirm the workspace shown in the sidebar.", "Run a scan from Dashboard or Testing, then open its findings."],
    sections: [
      { id: "account", title: "Account and access", paragraphs: [
        "Email/password sign-in is supported. Google and organization SSO depend on the deployment and your organization's configuration. Use the options actually offered on the sign-in page.",
        "A signed-in account does not automatically have access to every workspace. Ask an owner or administrator for access if your workspace is unavailable. Never share passwords or API keys.",
      ], links: [{ href: "/auth/login", label: "Sign in" }, { href: "/auth/register", label: "Create an account" }, { href: "/auth/forgot-password", label: "Reset a password" }] },
      { id: "workspace", title: "Choose the right workspace", paragraphs: [
        "Use the workspace selector before viewing scans or starting work. Switching clears local scan/chat context and reloads the dashboard; confirm before leaving unsaved work.",
        "If a selected workspace is unavailable, choose an accessible workspace rather than repeatedly retrying the same request. Before administrative changes, verify the workspace named by the destination screen as well.",
      ], links: [{ href: "/docs/team-management", label: "Workspace and team access" }] },
      { id: "first-scan", title: "Run and review a scan", paragraphs: [
        "Only scan public URLs you own or have authorization to assess. Enter the URL on Dashboard or Testing. Advanced options include region and available scan modes. Private or internal targets are not supported by the normal public scanner.",
        "Completion time depends on the site and selected checks. A timeout, blocked page, or failed scan is not evidence that a page has no accessibility issues.",
      ], steps: ["Open the completed scan from scan history.", "Inspect critical and serious findings, affected elements, selectors, and remediation guidance.", "Make changes in your own source, scan again, and compare completed scans."], links: [{ href: "/dashboard", label: "Dashboard" }, { href: "/test", label: "Testing" }, { href: "/scans", label: "Scan history" }] },
      { id: "limits", title: "Plans and available features", paragraphs: ["The table shows configured base limits, not a promise of throughput or coverage. Role overrides and workspace feature settings may affect access. Settings shows the limits and features available to your account."], limits: true, links: [{ href: "/settings?tab=plan", label: "Plan and usage" }] },
    ],
  },
  {
    slug: "scanning", title: "Scanning", reviewedAt: "2026-09-21",
    summary: "Choose single-page testing or a crawl, then inspect coverage and findings before drawing conclusions.",
    quickStart: ["Use Testing for a specific page or Crawl for linked pages.", "Inspect page errors and coverage as well as the score.", "Review evidence, fix issues, and compare completed scans."],
    sections: [
      { id: "modes", title: "Single page and site crawl", paragraphs: [
        "A single-page scan analyzes one URL. A crawl discovers same-origin pages subject to depth, requested page count, plan limits, and execution time. The current crawl request accepts at most 500 pages; a requested maximum does not guarantee all pages will be reached.",
        "Large or slow sites can produce partial coverage. Review pages scanned, errors, and the outcome before using the result. An interrupted browser crawl is not currently guaranteed to resume automatically. Reduce the requested scope and retry when appropriate.",
      ], links: [{ href: "/test", label: "Single-page testing" }, { href: "/crawl", label: "Site crawl" }] },
      { id: "evidence", title: "Interpret the findings", paragraphs: [
        "Critical, serious, moderate, and minor describe the impact reported by the scanning engine. Prioritize findings in the context of essential user journeys, not severity alone.",
        "Open affected elements for selectors, HTML evidence, and failure details. AI explanations and fixes depend on enabled features, provider availability, and credits. Review generated code before applying it; RegLayer does not automatically deploy a suggested fix to your website.",
        "The score summarizes the automated checks that ran. It is not a percentage of legal compliance or a certification. Automated checks cannot cover every WCAG requirement, assistive technology, or interaction.",
        "Policy rules without detected findings counts rules with no matched automated finding; it is not WCAG coverage. Rules may still need manual assessment. A single scan has a measured score but no change to compare until another scan completes.",
        "From scan results, Manual-test the rest carries the scan ID into the manual-testing form. Review it and start the audit explicitly; opening the form does not create an audit.",
        "New scans require scanning permission in the selected workspace. A read-only role sees the restriction before entering a URL. If access cannot be checked, retry after the connection recovers or choose an available workspace; the server still checks permission on every scan request.",
      ], links: [{ href: "/violations", label: "Review violations" }, { href: "/manual-testing", label: "Manual testing" }] },
      { id: "auth", title: "Authenticated pages and sensitive data", paragraphs: [
        "Where enabled, saved authentication settings support scanning signed-in pages. Use a dedicated, least-privileged test account and confirm that scanning is authorized. Findings, screenshots, and captured HTML may contain sensitive page content.",
        "Keep credentials out of URLs, screenshots shared publicly, issue descriptions, and source control. A login failure or redirect can prevent meaningful coverage even when the site itself is reachable.",
      ], links: [{ href: "/crawl", label: "Configure a crawl" }] },
      { id: "limits", title: "Configured base limits", paragraphs: ["Base quotas come from the same configuration used by the application. Unlimited plan quota does not remove request, resource, or timeout limits. Owners and admins may have different monthly scan allowances."], limits: true, links: [{ href: "/settings?tab=plan", label: "Check current allowance" }, { href: "/docs/reports", label: "Reports and comparison" }] },
    ],
  },
  {
    slug: "monitoring", title: "Monitoring & Notifications", reviewedAt: "2026-09-21",
    summary: "Manage recurring scans and clear recent unread notifications without opening every item.",
    quickStart: ["Open your account menu, then Notifications.", "Choose Mark all as read to clear the unread status of currently loaded notifications.", "Use Settings → Alerts for preferences, and Monitoring for recurring scans."],
    sections: [
      { id: "inbox", title: "Read and clear recent notifications", paragraphs: [
        "Opening Notifications does not mark items read. Select an item to mark that notification read and open its result, or choose Mark all as read to clear unread status for the recent items currently loaded. Items remain in the list; this does not delete scans or activity.",
        "Read status is local to this browser and separated by account and workspace. It synchronizes between tabs using browser storage, but not between devices. If storage is blocked, the current tab can still mark items read and displays a warning. Clearing site data resets read status. Up to 1,000 recent read IDs are retained.",
        "The panel shows up to 20 recent events, not an unlimited inbox. Newly arriving items stay unread even after marking the current list. Refresh reloads the feed; it also refreshes periodically while you are signed in. View activity opens the audit log, not an archive of all notifications.",
      ], links: [{ href: "/settings?tab=alerts", label: "Notification preferences" }, { href: "/audit-log", label: "Activity log" }] },
      { id: "schedules", title: "Scheduled scans", paragraphs: [
        "Open Monitoring to manage recurring scans where your plan and role permit them. Current presets are daily, Monday weekly, or first-of-month scans at 09:00 UTC. The deployment scheduler must be configured; a schedule entry alone does not prove delivery or execution succeeded.",
        "Monitor this page on a scan result opens a new schedule form with that URL and a suggested name. Review the frequency and submit the form to create the schedule; following the link alone does not schedule a scan.",
        "Scheduled scans are not included in the base Free configuration. Verify current plan access, recent execution, and errors instead of assuming a scan ran because its scheduled time passed.",
      ], links: [{ href: "/monitoring", label: "Monitoring" }, { href: "/settings?tab=plan", label: "Plan and usage" }] },
      { id: "delivery", title: "Email, integrations, and alert delivery", paragraphs: [
        "Settings → Alerts stores notification preferences. Email requires configured delivery infrastructure; Slack and webhooks require valid configured destinations. Saving a preference does not verify that an external message arrived.",
        "Thresholds are operational signals, not certification thresholds. If an alert does not arrive, check the scan result, selected workspace, preferences, integration configuration, and delivery records. A failed feed request is shown as an error with a retry action, not an empty inbox.",
      ], links: [{ href: "/integrations", label: "Integrations" }, { href: "/webhooks", label: "Webhooks" }, { href: "/docs/integrations", label: "Integration guide" }] },
    ],
  },
  {
    slug: "reports", title: "Reports & Statements", reviewedAt: "2026-09-21",
    summary: "Share scan evidence, compare results, and review draft statements before publication.",
    quickStart: ["Open a completed scan in scan history.", "Review findings and coverage before using available export actions.", "Combine automated evidence with manual review before publishing a statement."],
    sections: [
      { id: "exports", title: "Reports and exports", paragraphs: [
        "Use Reports or a scan's available export actions to share results. Export formats and detailed reporting depend on the feature and plan. Include the tested URL, scan date, scope, and known coverage limitations when sharing evidence.",
        "A failed or incomplete scan must not be presented as a clean assessment. AI guidance, where available, is a suggestion requiring review rather than an assurance that the issue is fixed.",
      ], links: [{ href: "/scans", label: "Scan history" }, { href: "/reports", label: "Reports" }] },
      { id: "compare", title: "Compare two completed scans", paragraphs: [
        "Select two completed scans in scan history and open Compare. Review new, resolved, and unchanged findings alongside score changes. Keep URLs, authentication, content, and scan options comparable; a changed page or blocked scan can make a score comparison misleading.",
        "The comparison API uses base and head query parameters and requires an authorized application session. Do not assume an API key grants access to every browser-facing endpoint.",
      ], links: [{ href: "/scans", label: "Choose scans to compare" }] },
      { id: "statements", title: "Statements and certificates", paragraphs: [
        "Statement generation helps draft a description of your organization's accessibility work. Review actual scope, outstanding barriers, contact details, and applicable jurisdiction requirements before publication.",
        "A generated statement, certificate, badge, or high scan score does not establish legal compliance or complete accessibility. Have qualified reviewers validate manual findings and any public conformance claim.",
        "The VPAT / ACR screen prepares a draft from a completed scan. Complete manual evaluation and review each conformance claim before sharing it. Recorded warranty status and monitoring scores do not grant financial protection; any coverage depends on a separate approved agreement.",
        "Downloaded PDF and VPAT reports describe their automated-assessment limits. VPAT exports remain drafts: the current criteria catalog does not cover every AAA, Section 508, or EN 301 549 requirement. A clean automated scan with outstanding manual criteria is not an overall Supports verdict.",
      ], links: [{ href: "/statement", label: "Statement draft" }, { href: "/manual-testing", label: "Manual evaluation" }] },
      { id: "history", title: "Activity and retention", paragraphs: [
        "The audit log shows recorded workspace events, not proof that every possible action is logged. Retention and visibility depend on your plan and access. Review your current limits before relying on the log for a long-term evidence archive.",
        "Activity belongs to the selected workspace, including for system administrators. The customer feed shows summaries, not raw diagnostic metadata; URL targets are reduced to their origin to avoid exposing credentials or query values. Failed loads offer retry and do not imply an empty history.",
      ], links: [{ href: "/audit-log", label: "Audit log" }, { href: "/settings?tab=plan", label: "Current limits" }] },
    ],
  },
  {
    slug: "team-management", title: "Team Management", reviewedAt: "2026-09-21",
    summary: "Check the destination workspace and manage access using the roles available to you.",
    quickStart: ["Open Manage and verify the workspace named by the team screen.", "Owners or admins can add members using the permitted roles.", "Confirm invitation delivery and sign-in access before handing over work."],
    sections: [
      { id: "roles", title: "Workspace roles", paragraphs: [
        "Viewers can view scan results but cannot initiate scans. Members can run scans and view results. Admins manage members, settings, integrations, and scans within the permissions enforced by each endpoint. Owners have additional workspace-level permissions.",
        "Available actions are enforced on the server, not only by hiding controls. Ownership transfer is not a standard member-role change. Contact your administrator rather than assuming any role selector can transfer ownership.",
      ], links: [{ href: "/manage?tab=team", label: "Team management" }] },
      { id: "invite", title: "Invite and verify access", paragraphs: [
        "Verify the workspace displayed on Team before editing memberships. Selected-workspace support is not yet uniform across every administrative endpoint; do not assume the sidebar alone determines the target of a team mutation.",
        "Use Invite Member, enter the member's email, and choose a permitted role. An existing account can sign in with its configured method. A new account may need the invitation or password-reset flow to establish a password. Email delivery requires configured mail infrastructure; the UI reports when no invitation was sent.",
        "Never share credentials to work around a failed invitation. Ask an administrator to verify the membership and delivery configuration.",
      ], links: [{ href: "/team", label: "Team details" }, { href: "/auth/forgot-password", label: "Password reset" }] },
      { id: "switching", title: "Switch workspaces deliberately", paragraphs: [
        "Use the sidebar selector and confirm leaving the current context. Scan and chat client state is cleared and other open tabs are notified. An invalid selection should be resolved by choosing an accessible workspace, not by retrying actions in an unknown context.",
        "For invitations, SSO, billing, and other administrative changes, verify the workspace named on the destination screen. Report inconsistent context before making changes.",
      ], links: [{ href: "/settings", label: "Settings" }] },
      { id: "limits", title: "Base team and scan limits", paragraphs: ["These configured defaults update with the application's plan configuration. Account role overrides, enabled features, and current server responses govern actual access."], limits: true },
    ],
  },
  {
    slug: "integrations", title: "Integrations & API", reviewedAt: "2026-09-21",
    summary: "Use the API-key CI endpoint and verify responses; do not assume browser APIs share its authentication contract.",
    quickStart: ["Create an authorized workspace API key in Settings → API Keys.", "Store the key in your CI secret manager, not source code.", "Check both the pass verdict and a saved scan ID before accepting the gate."],
    sections: [
      { id: "ci", title: "Run a CI scan", paragraphs: [
        "POST /api/ci/scan accepts a Bearer API key and returns passed, score, failures, and scanId. Browser scan/history routes use application sessions; the old POST /api/scans example was not a valid scan-creation contract.",
        "Set REGLAYER_URL to your actual deployment origin. This example requires curl and jq, disables stored policies explicitly, and checks persistence as well as the verdict. Configure your shell or CI to fail on nonzero exit status. Network errors, malformed responses, and a null scanId must fail the gate.",
        "Use only public URLs you are authorized to test. Validate this integration in a controlled environment before relying on it as a release gate. Supported options and deployed behavior may vary; do not infer a daily plan quota or an unimplemented threshold from this example.",
      ], code: CI_SCAN_EXAMPLE, links: [{ href: "/settings?tab=api-keys", label: "API keys" }] },
      { id: "security", title: "Credentials and authentication", paragraphs: [
        "API keys identify a workspace and must be treated as secrets. Do not put them in client code or a scan URL. Revoke exposed keys. Session-only endpoints and API-key endpoints have separate authentication checks.",
        "Do not automatically retry non-idempotent scan submissions after an ambiguous network failure; check for a saved result first. Respect actual error responses and rate-limit headers rather than a fixed, undocumented requests-per-minute promise.",
      ], links: [{ href: "/api-reference", label: "API reference" }] },
      { id: "webhooks", title: "Verify webhook delivery", paragraphs: [
        "Configure enabled webhook destinations and selected events on Webhooks. Actual event emission depends on the workflow; registering an event name does not prove every route emits it.",
        "When a webhook secret is configured, X-RegLayer-Signature uses sha256= followed by an HMAC-SHA256 of the raw request body. Verify against that raw body and reject missing or invalid signatures according to your receiver's policy. Without a configured secret, the sender does not provide that signature.",
        "Delivery retries can repeat a message. Use X-RegLayer-Delivery for receiver deduplication and review failed delivery records. A successful settings save does not confirm that the destination accepted a message.",
      ], links: [{ href: "/webhooks", label: "Webhook settings" }, { href: "/integrations", label: "Connected integrations" }] },
    ],
  },
];