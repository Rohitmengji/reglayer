import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/gateway", () => ({
  complete: vi.fn().mockResolvedValue(null),
  getDefaultModelId: vi.fn().mockReturnValue("gpt-4o-mini"),
}));

import {
  detectModality,
  processInput,
  getSupportedModalities,
  buildScreenAuditPrompt,
  type MultiModalInput,
} from "@/lib/ai/multimodal/processor";

describe("Multi-Modal AI Processor", () => {
  describe("detectModality", () => {
    it("detects image from MIME type", () => {
      expect(detectModality({ type: "text", mimeType: "image/png" })).toBe("image");
      expect(detectModality({ type: "text", mimeType: "image/jpeg" })).toBe("image");
      expect(detectModality({ type: "text", mimeType: "image/webp" })).toBe("image");
    });

    it("detects audio from MIME type", () => {
      expect(detectModality({ type: "text", mimeType: "audio/mp3" })).toBe("audio");
      expect(detectModality({ type: "text", mimeType: "audio/wav" })).toBe("audio");
    });

    it("detects video from MIME type", () => {
      expect(detectModality({ type: "text", mimeType: "video/mp4" })).toBe("video");
    });

    it("detects from filename extension", () => {
      expect(detectModality({ type: "text", filename: "screenshot.png" })).toBe("image");
      expect(detectModality({ type: "text", filename: "recording.mp3" })).toBe("audio");
      expect(detectModality({ type: "text", filename: "demo.mp4" })).toBe("video");
    });

    it("respects explicit type over MIME", () => {
      expect(detectModality({ type: "screen", mimeType: "image/png" })).toBe("screen");
    });

    it("defaults to text", () => {
      expect(detectModality({ type: "text" })).toBe("text");
      expect(detectModality({ type: "text", mimeType: "application/json" })).toBe("text");
    });
  });

  describe("processInput", () => {
    it("passes text through unchanged", async () => {
      const result = await processInput({ type: "text", text: "Hello world" });
      expect(result.modality).toBe("text");
      expect(result.text).toBe("Hello world");
      expect(result.tokensUsed).toBe(0);
      expect(result.costUsd).toBe(0);
    });

    it("handles image without data gracefully", async () => {
      const result = await processInput({ type: "image" });
      expect(result.modality).toBe("image");
      expect(result.text).toContain("unavailable");
    });

    it("handles audio without data gracefully", async () => {
      const result = await processInput({ type: "audio" });
      expect(result.modality).toBe("audio");
      expect(result.text).toContain("unavailable");
    });

    it("handles video input", async () => {
      const result = await processInput({ type: "video", data: "base64data", mimeType: "video/mp4" });
      expect(result.modality).toBe("video");
      expect(result.metadata).toHaveProperty("processingPipeline");
    });

    it("includes duration in result", async () => {
      const result = await processInput({ type: "text", text: "test" });
      expect(typeof result.durationMs).toBe("number");
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("getSupportedModalities", () => {
    it("returns at least 6 modalities", () => {
      expect(getSupportedModalities().length).toBeGreaterThanOrEqual(6);
    });

    it("text and image are available", () => {
      const modalities = getSupportedModalities();
      expect(modalities.find((m) => m.modality === "text")?.status).toBe("available");
      expect(modalities.find((m) => m.modality === "image")?.status).toBe("available");
      expect(modalities.find((m) => m.modality === "screen")?.status).toBe("available");
    });

    it("audio and video are planned", () => {
      const modalities = getSupportedModalities();
      expect(modalities.find((m) => m.modality === "audio")?.status).toBe("planned");
      expect(modalities.find((m) => m.modality === "video")?.status).toBe("planned");
    });

    it("each modality has description and requirements", () => {
      for (const m of getSupportedModalities()) {
        expect(m.description.length).toBeGreaterThan(5);
        expect(m.requirements).toBeTruthy();
      }
    });
  });

  describe("buildScreenAuditPrompt", () => {
    it("includes WCAG reference", () => {
      expect(buildScreenAuditPrompt()).toContain("WCAG");
    });

    it("includes color contrast check", () => {
      expect(buildScreenAuditPrompt()).toContain("contrast");
    });

    it("includes touch target check", () => {
      expect(buildScreenAuditPrompt()).toContain("44x44");
    });

    it("includes additional context when provided", () => {
      expect(buildScreenAuditPrompt("checkout page")).toContain("checkout page");
    });
  });
});
