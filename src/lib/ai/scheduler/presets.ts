/**
 * RegLayer — Autonomous Agent Presets
 *
 * Pre-configured agent schedules for common compliance monitoring tasks.
 * No human trigger required — agents run on schedules or react to events.
 *
 * AUTONOMOUS PATTERNS:
 *
 *   1. Compliance Monitor
 *      Monitor website → detect changes → analyze impact → notify team
 *      Trigger: Daily cron
 *
 *   2. Regression Detector
 *      Scan completes → compare with baseline → detect regressions → alert
 *      Trigger: EVENT (scan.completed)
 *
 *   3. Regulation Tracker
 *      New regulation published → read → summarize impact → notify compliance team
 *      Trigger: Weekly cron
 *
 *   4. Report Generator
 *      Monthly → gather scan data → generate compliance report → send to stakeholders
 *      Trigger: Monthly cron
 *
 *   5. Violation Triage
 *      New violation found → classify priority → assign to team → suggest fix
 *      Trigger: EVENT (violation.new)
 *
 * INSPIRED BY:
 *   - Datadog Monitors (autonomous detection + alerting)
 *   - PagerDuty (event-driven incident response)
 *   - AutoGPT (goal-driven autonomous loops)
 *   - Devin (autonomous coding agent that works overnight)
 */

import "server-only";

import { createSchedule, type AgentTrigger, type OutputAction } from "./service";

// ── Preset Definitions ────────────────────────────────────────────────────────

export interface AutonomousPreset {
  name: string;
  description: string;
  agentSlug: string;
  trigger: AgentTrigger;
  cron?: string;
  eventType?: string;
  taskTemplate: string;
  outputAction: OutputAction;
}

export const AUTONOMOUS_PRESETS: AutonomousPreset[] = [
  {
    name: "Daily Compliance Monitor",
    description: "Runs the compliance auditor daily to check for new issues and score changes",
    agentSlug: "compliance-auditor",
    trigger: "CRON",
    cron: "0 8 * * *", // 8am daily
    taskTemplate: "Run a compliance check for our workspace. Review the most recent scan results, identify any new critical or serious violations, and compare the current score with the previous scan. Highlight any regressions.",
    outputAction: "NOTIFY",
  },
  {
    name: "Scan Regression Alert",
    description: "Automatically analyzes new scans for regressions and alerts the team",
    agentSlug: "compliance-auditor",
    trigger: "EVENT",
    eventType: "scan.completed",
    taskTemplate: "A scan just completed for {{url}} with score {{score}}. Compare with previous scans for this site. If the score dropped or new critical/serious violations appeared, explain what regressed and why it matters.",
    outputAction: "NOTIFY",
  },
  {
    name: "Weekly Legal Digest",
    description: "Summarizes accessibility regulation updates and their impact on your compliance",
    agentSlug: "legal-analyst",
    trigger: "CRON",
    cron: "0 9 * * 1", // Monday 9am
    taskTemplate: "Provide a weekly accessibility compliance digest. Summarize any upcoming regulation deadlines (ADA, EAA, Section 508, AODA). Based on our recent scan data, assess our current compliance risk level and recommend priority actions for this week.",
    outputAction: "NOTIFY",
  },
  {
    name: "Monthly Compliance Report",
    description: "Generates a monthly executive compliance report and sends it for approval",
    agentSlug: "report-writer",
    trigger: "CRON",
    cron: "0 10 1 * *", // 1st of month, 10am
    taskTemplate: "Generate a monthly accessibility compliance report for our workspace. Include: overall score trend, violations fixed vs new, top unresolved critical issues, compliance status against WCAG 2.1 AA, and recommended actions for next month.",
    outputAction: "APPROVE", // human review before sending
  },
  {
    name: "New Violation Triage",
    description: "Automatically triages new critical/serious violations with fix suggestions",
    agentSlug: "developer-guide",
    trigger: "EVENT",
    eventType: "violation.critical",
    taskTemplate: "A new {{impact}} violation was found: [{{ruleId}}] {{description}}. WCAG: {{wcagCriteria}}. Provide a concrete code fix with before/after examples. Estimate the effort level (quick fix / moderate / complex).",
    outputAction: "LOG",
  },
];

/**
 * Install autonomous agent presets for a workspace.
 * Creates schedule entries for each preset (idempotent — skips existing).
 */
export async function installPresets(
  workspaceId: string,
  userId: string,
  opts?: { presets?: string[]; notifyEmail?: string },
): Promise<{ installed: number; skipped: number }> {
  let installed = 0;
  let skipped = 0;

  const presetsToInstall = opts?.presets
    ? AUTONOMOUS_PRESETS.filter((p) => opts.presets!.includes(p.name))
    : AUTONOMOUS_PRESETS;

  for (const preset of presetsToInstall) {
    try {
      await createSchedule({
        name: preset.name,
        agentSlug: preset.agentSlug,
        trigger: preset.trigger,
        cron: preset.cron,
        eventType: preset.eventType,
        taskTemplate: preset.taskTemplate,
        outputAction: preset.outputAction,
        notifyEmail: opts?.notifyEmail,
        workspaceId,
        createdBy: userId,
      });
      installed++;
    } catch {
      skipped++; // likely already exists
    }
  }

  return { installed, skipped };
}

/**
 * Get available presets (for UI display).
 */
export function getAvailablePresets(): AutonomousPreset[] {
  return AUTONOMOUS_PRESETS;
}
