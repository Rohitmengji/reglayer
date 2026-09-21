import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: process.env.REGLAYER_BROWSER_WALKTHROUGH === "1" ? ["integration/browser-user.test.ts"] : ["integration/**/*.test.ts"],
    exclude: process.env.REGLAYER_BROWSER_WALKTHROUGH === "1" ? [] : ["integration/browser-user.test.ts"],
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});