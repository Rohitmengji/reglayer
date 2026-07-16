/**
 * RegLayer Config Reconciler — diff desired state vs current, apply changes
 */

import { APIClient, c } from "../client.js";
import type { RegLayerConfig, AgentConfig, ScheduleConfig } from "./schema.js";

export interface PlanAction {
  action: "create" | "update" | "delete" | "unchanged";
  resource: string; // "agent" | "schedule" | "knowledge"
  name: string;
  details?: string;
}

/**
 * Generate a plan: compare config against current API state.
 */
export async function plan(config: RegLayerConfig, client: APIClient): Promise<PlanAction[]> {
  const actions: PlanAction[] = [];

  // Agents
  if (config.agents) {
    let existing: { slug: string }[] = [];
    try {
      const res = await client.request<{ agents: { slug: string }[] }>("GET", "/api/ai/agents");
      existing = res.agents ?? [];
    } catch { /* no agents endpoint yet */ }

    const existingSlugs = new Set(existing.map((a) => a.slug));

    for (const agent of config.agents) {
      if (existingSlugs.has(agent.slug)) {
        actions.push({ action: "update", resource: "agent", name: agent.slug, details: "sync prompt/model/tools" });
      } else {
        actions.push({ action: "create", resource: "agent", name: agent.slug });
      }
    }
  }

  // Schedules
  if (config.schedules) {
    for (const schedule of config.schedules) {
      actions.push({ action: "create", resource: "schedule", name: schedule.name, details: `${schedule.trigger}: ${schedule.cron ?? schedule.eventType ?? "manual"}` });
    }
  }

  // Knowledge
  if (config.knowledge) {
    for (const doc of config.knowledge) {
      actions.push({ action: "create", resource: "knowledge", name: doc.title, details: doc.source });
    }
  }

  return actions;
}

/**
 * Apply a plan — execute the actions via API.
 */
export async function apply(config: RegLayerConfig, client: APIClient): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;

  // Deploy agents
  if (config.agents) {
    for (const agent of config.agents) {
      try {
        await client.request("POST", "/api/ai/agents", {
          slug: agent.slug,
          name: agent.name,
          description: agent.prompt.slice(0, 100),
          systemPrompt: agent.prompt,
          model: agent.model ?? "gpt-4o-mini",
          temperature: agent.temperature ?? 0.4,
          tools: agent.tools ?? [],
          permissions: agent.permissions ?? [],
          category: agent.category ?? "custom",
          costLimitUsd: agent.costLimit,
          isPublic: agent.public ?? false,
        });
        console.log(`  ${c.green("✓")} agent/${agent.slug}`);
        success++;
      } catch (err) {
        console.log(`  ${c.red("✗")} agent/${agent.slug}: ${err instanceof Error ? err.message : "failed"}`);
        failed++;
      }
    }
  }

  // Deploy schedules
  if (config.schedules) {
    for (const schedule of config.schedules) {
      try {
        await client.request("POST", "/api/ai/agents/schedules", {
          name: schedule.name,
          agentSlug: schedule.agent,
          trigger: schedule.trigger.toUpperCase(),
          cron: schedule.cron,
          eventType: schedule.eventType,
          taskTemplate: schedule.task,
          outputAction: (schedule.output ?? "log").toUpperCase(),
          notifyEmail: schedule.notifyEmail,
          webhookUrl: schedule.webhookUrl,
        });
        console.log(`  ${c.green("✓")} schedule/${schedule.name}`);
        success++;
      } catch (err) {
        console.log(`  ${c.red("✗")} schedule/${schedule.name}: ${err instanceof Error ? err.message : "failed"}`);
        failed++;
      }
    }
  }

  // Deploy knowledge
  if (config.knowledge) {
    for (const doc of config.knowledge) {
      try {
        await client.request("POST", "/api/knowledge", {
          title: doc.title,
          source: doc.source,
        });
        console.log(`  ${c.green("✓")} knowledge/${doc.title}`);
        success++;
      } catch (err) {
        console.log(`  ${c.red("✗")} knowledge/${doc.title}: ${err instanceof Error ? err.message : "failed"}`);
        failed++;
      }
    }
  }

  return { success, failed };
}

/**
 * Format plan for display.
 */
export function formatPlan(actions: PlanAction[]): string {
  if (actions.length === 0) return c.green("No changes needed — infrastructure is up to date.");

  const lines = actions.map((a) => {
    const icon = a.action === "create" ? c.green("+ CREATE")
      : a.action === "update" ? c.yellow("~ UPDATE")
      : a.action === "delete" ? c.red("- DELETE")
      : c.dim("= UNCHANGED");
    const detail = a.details ? c.dim(` (${a.details})`) : "";
    return `  ${icon} ${a.resource}/${a.name}${detail}`;
  });

  return `\n${c.bold("Plan:")}\n${lines.join("\n")}\n`;
}
