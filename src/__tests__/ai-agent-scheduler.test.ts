/**
 * Tests for Agent Scheduler + Autonomous Presets
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/database/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/ai/gateway", () => ({ complete: vi.fn() }));
vi.mock("@/lib/ai/marketplace/registry", () => ({ getBlueprint: vi.fn() }));
vi.mock("@/lib/ai/a2a/protocol", () => ({ runConversation: vi.fn() }));
vi.mock("@/lib/telemetry/logger", () => ({ logger: { withContext: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }) } }));

import { resolveTemplate } from "@/lib/ai/scheduler/service";
import { getAvailablePresets, AUTONOMOUS_PRESETS } from "@/lib/ai/scheduler/presets";

describe("Agent Scheduler", () => {
  describe("resolveTemplate", () => {
    it("replaces simple variables", () => {
      const result = resolveTemplate("Scan {{url}} scored {{score}}", { url: "example.com", score: 85 });
      expect(result).toBe("Scan example.com scored 85");
    });

    it("preserves unmatched variables", () => {
      const result = resolveTemplate("Check {{url}} status {{missing}}", { url: "test.com" });
      expect(result).toBe("Check test.com status {{missing}}");
    });

    it("handles empty data", () => {
      const result = resolveTemplate("Hello {{name}}", {});
      expect(result).toBe("Hello {{name}}");
    });

    it("handles multiple occurrences of same variable", () => {
      const result = resolveTemplate("{{url}} is at {{url}}", { url: "example.com" });
      expect(result).toBe("example.com is at example.com");
    });

    it("converts non-string values to strings", () => {
      const result = resolveTemplate("Score: {{score}}, Critical: {{critical}}", { score: 85.5, critical: 3 });
      expect(result).toBe("Score: 85.5, Critical: 3");
    });

    it("handles boolean values", () => {
      const result = resolveTemplate("Passed: {{passed}}", { passed: false });
      expect(result).toBe("Passed: false");
    });
  });
});

describe("Autonomous Presets", () => {
  describe("getAvailablePresets", () => {
    it("returns all presets", () => {
      const presets = getAvailablePresets();
      expect(presets.length).toBe(AUTONOMOUS_PRESETS.length);
      expect(presets.length).toBeGreaterThanOrEqual(5);
    });

    it("each preset has required fields", () => {
      for (const preset of getAvailablePresets()) {
        expect(preset.name).toBeTruthy();
        expect(preset.agentSlug).toBeTruthy();
        expect(preset.trigger).toBeTruthy();
        expect(preset.taskTemplate).toBeTruthy();
        expect(preset.outputAction).toBeTruthy();
      }
    });

    it("cron presets have cron expressions", () => {
      const cronPresets = getAvailablePresets().filter((p) => p.trigger === "CRON");
      expect(cronPresets.length).toBeGreaterThan(0);
      for (const preset of cronPresets) {
        expect(preset.cron).toBeTruthy();
      }
    });

    it("event presets have event types", () => {
      const eventPresets = getAvailablePresets().filter((p) => p.trigger === "EVENT");
      expect(eventPresets.length).toBeGreaterThan(0);
      for (const preset of eventPresets) {
        expect(preset.eventType).toBeTruthy();
      }
    });

    it("includes compliance monitor preset", () => {
      expect(getAvailablePresets().some((p) => p.name.includes("Compliance Monitor"))).toBe(true);
    });

    it("includes regression alert preset", () => {
      expect(getAvailablePresets().some((p) => p.name.includes("Regression"))).toBe(true);
    });

    it("includes monthly report preset with APPROVE action", () => {
      const report = getAvailablePresets().find((p) => p.name.includes("Monthly"));
      expect(report).toBeTruthy();
      expect(report!.outputAction).toBe("APPROVE");
    });
  });
});
