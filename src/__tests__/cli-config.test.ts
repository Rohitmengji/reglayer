/**
 * Tests for CLI config parser + reconciler
 */
import { describe, it, expect } from "vitest";
import { parseSimpleYaml } from "@/cli/config/parser";
import { formatPlan, type PlanAction } from "@/cli/config/reconciler";

describe("CLI Config Parser", () => {
  it("parses version scalar", () => {
    const config = parseSimpleYaml('version: "1"');
    expect(config.version).toBe("1");
  });

  it("parses agents array", () => {
    const yaml = `version: "1"
agents:
  - slug: compliance-auditor
    name: Compliance Auditor
    model: gpt-4o-mini
    temperature: 0.3
    tools: [getScans, getViolations]`;

    const config = parseSimpleYaml(yaml);
    expect(config.agents).toHaveLength(1);
    expect(config.agents![0].slug).toBe("compliance-auditor");
    expect(config.agents![0].model).toBe("gpt-4o-mini");
    expect(config.agents![0].temperature).toBe(0.3);
    expect(config.agents![0].tools).toEqual(["getScans", "getViolations"]);
  });

  it("parses schedules with cron", () => {
    const yaml = `schedules:
  - name: daily-audit
    agent: compliance-auditor
    trigger: cron
    cron: "0 8 * * *"
    task: Run daily check`;

    const config = parseSimpleYaml(yaml);
    expect(config.schedules).toHaveLength(1);
    expect(config.schedules![0].cron).toBe("0 8 * * *");
    expect(config.schedules![0].trigger).toBe("cron");
  });

  it("parses knowledge entries", () => {
    const yaml = `knowledge:
  - title: A11y Policy
    source: ./docs/policy.pdf`;

    const config = parseSimpleYaml(yaml);
    expect(config.knowledge).toHaveLength(1);
    expect(config.knowledge![0].title).toBe("A11y Policy");
    expect(config.knowledge![0].source).toBe("./docs/policy.pdf");
  });

  it("parses booleans", () => {
    const yaml = `agents:
  - slug: test
    public: true`;
    const config = parseSimpleYaml(yaml);
    expect((config.agents![0] as unknown as Record<string, unknown>).public).toBe(true);
  });

  it("parses integers", () => {
    const yaml = `agents:
  - slug: test
    costLimit: 50`;
    const config = parseSimpleYaml(yaml);
    expect((config.agents![0] as unknown as Record<string, unknown>).costLimit).toBe(50);
  });

  it("handles comments and empty lines", () => {
    const yaml = `# This is a config
version: "1"

# Agents section
agents:
  - slug: test
    name: Test Agent`;

    const config = parseSimpleYaml(yaml);
    expect(config.version).toBe("1");
    expect(config.agents).toHaveLength(1);
  });

  it("parses multiple agents", () => {
    const yaml = `agents:
  - slug: agent-a
    name: Agent A
  - slug: agent-b
    name: Agent B
  - slug: agent-c
    name: Agent C`;

    const config = parseSimpleYaml(yaml);
    expect(config.agents).toHaveLength(3);
  });
});

describe("CLI Reconciler", () => {
  it("formats create actions", () => {
    const actions: PlanAction[] = [
      { action: "create", resource: "agent", name: "test-agent" },
    ];
    const output = formatPlan(actions);
    expect(output).toContain("CREATE");
    expect(output).toContain("test-agent");
  });

  it("formats update actions", () => {
    const actions: PlanAction[] = [
      { action: "update", resource: "schedule", name: "daily-check", details: "cron changed" },
    ];
    const output = formatPlan(actions);
    expect(output).toContain("UPDATE");
    expect(output).toContain("cron changed");
  });

  it("formats delete actions", () => {
    const actions: PlanAction[] = [
      { action: "delete", resource: "knowledge", name: "old-doc" },
    ];
    const output = formatPlan(actions);
    expect(output).toContain("DELETE");
  });

  it("returns up-to-date message when no actions", () => {
    expect(formatPlan([])).toContain("up to date");
  });

  it("formats mixed actions", () => {
    const actions: PlanAction[] = [
      { action: "create", resource: "agent", name: "new-agent" },
      { action: "update", resource: "agent", name: "existing-agent" },
      { action: "unchanged", resource: "schedule", name: "daily" },
    ];
    const output = formatPlan(actions);
    expect(output).toContain("CREATE");
    expect(output).toContain("UPDATE");
    expect(output).toContain("UNCHANGED");
  });
});
