/**
 * Tests for the Google Gemini provider adapter.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const providerFn = vi.fn((id: string) => ({ modelId: id }));
const createGoogleGenerativeAI = vi.fn((..._args: unknown[]) => providerFn);

vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: (...a: unknown[]) => createGoogleGenerativeAI(...a),
}));

import { createGoogleModel, isGoogleConfigured } from "@/lib/ai/gateway/providers/google";

describe("Google provider adapter", () => {
  const original = process.env.GOOGLE_AI_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (original === undefined) delete process.env.GOOGLE_AI_API_KEY;
    else process.env.GOOGLE_AI_API_KEY = original;
  });

  it("reports configured only when the API key env is set", () => {
    process.env.GOOGLE_AI_API_KEY = "test-key";
    expect(isGoogleConfigured()).toBe(true);

    delete process.env.GOOGLE_AI_API_KEY;
    expect(isGoogleConfigured()).toBe(false);
  });

  it("creates a model instance for the given provider model id", () => {
    process.env.GOOGLE_AI_API_KEY = "test-key";
    const model = createGoogleModel("gemini-2.0-flash") as unknown as { modelId: string };
    expect(model.modelId).toBe("gemini-2.0-flash");
    expect(providerFn).toHaveBeenCalledWith("gemini-2.0-flash");
  });
});
