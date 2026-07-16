/**
 * Tests for AI Guardrails Pipeline
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  runGuardrails,
  topicRelevanceGuard,
  wcagHallucinationGuard,
  jsonSchemaGuard,
  refusalDetectionGuard,
  outputLengthGuard,
  confidenceCalibrationGuard,
  CHAT_GUARDS,
  STRUCTURED_GUARDS,
} from "@/lib/ai/guardrails";

describe("AI Guardrails", () => {
  // ── Topic Relevance Guard ─────────────────────────────────────────────────

  describe("topicRelevanceGuard", () => {
    it("passes for accessibility-related content", () => {
      const result = topicRelevanceGuard(
        "The color contrast ratio of 2.5:1 fails WCAG SC 1.4.3 (Contrast Minimum). You need at least 4.5:1 for normal text. Here's how to fix it...",
        { feature: "chat" },
      );
      expect(result.severity).toBe("pass");
    });

    it("warns on off-topic long responses", () => {
      const offTopic = "Here's a recipe for chocolate cake: First preheat the oven to 350F. Mix flour, sugar, cocoa powder, baking soda, and salt. In a separate bowl combine eggs, buttermilk, oil, and vanilla. Mix wet and dry ingredients together until smooth. Pour into greased pans and bake for 30-35 minutes. Let cool completely before frosting with your favorite chocolate frosting. Enjoy!";
      const result = topicRelevanceGuard(offTopic, { feature: "chat" });
      expect(result.severity).toBe("warn");
    });

    it("passes for short responses (might be brief answers)", () => {
      const result = topicRelevanceGuard("Yes, that's correct.", { feature: "chat" });
      expect(result.severity).toBe("pass");
    });

    it("skips non-chat features", () => {
      const result = topicRelevanceGuard("anything here", { feature: "workflow" });
      expect(result.severity).toBe("pass");
    });
  });

  // ── WCAG Hallucination Guard ──────────────────────────────────────────────

  describe("wcagHallucinationGuard", () => {
    it("passes for valid WCAG criteria (SC 1.4.3)", () => {
      const result = wcagHallucinationGuard(
        "This violates WCAG SC 1.4.3 Contrast (Minimum), Level AA.",
        { feature: "chat" },
      );
      expect(result.severity).toBe("pass");
    });

    it("passes for valid WCAG 2.5.x criteria", () => {
      const result = wcagHallucinationGuard(
        "SC 2.5.1 Pointer Gestures requires...",
        { feature: "chat" },
      );
      expect(result.severity).toBe("pass");
    });

    it("warns on hallucinated principle 5 (doesn't exist)", () => {
      const result = wcagHallucinationGuard(
        "This fails WCAG SC 5.2.1 which requires proper labeling.",
        { feature: "chat" },
      );
      expect(result.severity).toBe("warn");
      expect(result.reason).toContain("principle 5");
    });

    it("warns on hallucinated guideline 1.7 (doesn't exist)", () => {
      const result = wcagHallucinationGuard(
        "According to criterion 1.7.2, all images must...",
        { feature: "chat" },
      );
      expect(result.severity).toBe("warn");
      expect(result.reason).toContain("1.7");
    });

    it("passes when no WCAG references exist", () => {
      const result = wcagHallucinationGuard(
        "You should add an alt attribute to that image.",
        { feature: "chat" },
      );
      expect(result.severity).toBe("pass");
    });
  });

  // ── JSON Schema Guard ─────────────────────────────────────────────────────

  describe("jsonSchemaGuard", () => {
    it("passes when no schema expected", () => {
      const result = jsonSchemaGuard("just text", { feature: "chat" });
      expect(result.severity).toBe("pass");
    });

    it("passes for valid JSON with required keys", () => {
      const output = JSON.stringify({ summary: "test", impact: "users affected", recommendation: "fix it" });
      const result = jsonSchemaGuard(output, {
        feature: "violation-explainer",
        expectedSchema: { summary: "string", impact: "string", recommendation: "string" },
      });
      expect(result.severity).toBe("pass");
    });

    it("blocks on missing required keys", () => {
      const output = JSON.stringify({ summary: "test" });
      const result = jsonSchemaGuard(output, {
        feature: "violation-explainer",
        expectedSchema: { summary: "string", impact: "string", recommendation: "string" },
      });
      expect(result.severity).toBe("block");
      expect(result.reason).toContain("impact");
    });

    it("blocks on invalid JSON", () => {
      const result = jsonSchemaGuard("not json {broken", {
        feature: "violation-explainer",
        expectedSchema: { summary: "string" },
      });
      expect(result.severity).toBe("block");
      expect(result.reason).toContain("not valid JSON");
    });
  });

  // ── Refusal Detection Guard ───────────────────────────────────────────────

  describe("refusalDetectionGuard", () => {
    it("warns on refusal to legitimate question", () => {
      const result = refusalDetectionGuard(
        "I can't help with that request.",
        { feature: "chat", userMessage: "How do I fix color contrast?" },
      );
      expect(result.severity).toBe("warn");
    });

    it("passes for long responses (even with refusal phrases)", () => {
      const longResponse = "I can't help with that specific approach, but here's what I recommend instead. " + "x".repeat(200);
      const result = refusalDetectionGuard(longResponse, {
        feature: "chat",
        userMessage: "test",
      });
      expect(result.severity).toBe("pass");
    });

    it("passes when no user message context", () => {
      const result = refusalDetectionGuard("I cannot assist", { feature: "chat" });
      expect(result.severity).toBe("pass");
    });
  });

  // ── Output Length Guard ───────────────────────────────────────────────────

  describe("outputLengthGuard", () => {
    it("blocks empty responses", () => {
      const result = outputLengthGuard("", { feature: "chat" });
      expect(result.severity).toBe("block");
    });

    it("blocks whitespace-only responses", () => {
      const result = outputLengthGuard("   \n  ", { feature: "chat" });
      expect(result.severity).toBe("block");
    });

    it("warns on excessively long responses", () => {
      const result = outputLengthGuard("x".repeat(16000), { feature: "chat" });
      expect(result.severity).toBe("warn");
    });

    it("passes normal-length responses", () => {
      const result = outputLengthGuard("Here's your answer about ARIA labels.", { feature: "chat" });
      expect(result.severity).toBe("pass");
    });

    it("skips length check for structured outputs", () => {
      const result = outputLengthGuard("", {
        feature: "violation-explainer",
        expectedSchema: { summary: "string" },
      });
      expect(result.severity).toBe("pass");
    });
  });

  // ── Confidence Calibration Guard ──────────────────────────────────────────

  describe("confidenceCalibrationGuard", () => {
    it("warns on overconfident explainer output", () => {
      const output = JSON.stringify({ summary: "test", confidence: 0.99 });
      const result = confidenceCalibrationGuard(output, { feature: "violation-explainer" });
      expect(result.severity).toBe("warn");
      expect(result.reason).toContain("overconfident");
    });

    it("passes reasonable confidence", () => {
      const output = JSON.stringify({ summary: "test", confidence: 0.85 });
      const result = confidenceCalibrationGuard(output, { feature: "violation-explainer" });
      expect(result.severity).toBe("pass");
    });

    it("skips for non-explainer features", () => {
      const result = confidenceCalibrationGuard("anything", { feature: "chat" });
      expect(result.severity).toBe("pass");
    });
  });

  // ── Pipeline Integration ──────────────────────────────────────────────────

  describe("runGuardrails", () => {
    it("passes valid accessibility response through full pipeline", () => {
      const result = runGuardrails(
        "To fix SC 1.4.3 contrast issues, increase the color ratio to at least 4.5:1 for normal text. Use a tool like the WebAIM Contrast Checker.",
        { feature: "chat", userMessage: "How do I fix contrast?" },
        CHAT_GUARDS,
      );
      expect(result.passed).toBe(true);
      expect(result.results.every((r) => r.severity === "pass")).toBe(true);
    });

    it("blocks empty LLM output", () => {
      const result = runGuardrails("", { feature: "chat" }, CHAT_GUARDS);
      expect(result.passed).toBe(false);
      expect(result.rejectionReason).toContain("empty");
    });

    it("blocks invalid JSON in structured mode", () => {
      const result = runGuardrails(
        "not valid json",
        { feature: "violation-explainer", expectedSchema: { summary: "string" } },
        STRUCTURED_GUARDS,
      );
      expect(result.passed).toBe(false);
    });

    it("short-circuits on first block", () => {
      const result = runGuardrails(
        "",
        { feature: "chat" },
        CHAT_GUARDS,
      );
      // outputLengthGuard is first and should block immediately
      expect(result.results.length).toBe(1);
      expect(result.results[0].guardId).toBe("output-length");
    });
  });
});
