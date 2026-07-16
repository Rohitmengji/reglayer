/**
 * RegLayer — Vitest Configuration
 *
 * WHY: Unit/integration tests need a test runner configured for Next.js + TypeScript.
 * WHAT: Configures Vitest with jsdom environment, path aliases, setup files, coverage thresholds.
 * HOW: Uses @vitejs/plugin-react for JSX support. Maps @ to src/. Excludes e2e from unit tests.
 */
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/__tests__/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      thresholds: {
        lines: 40,
        functions: 35,
        branches: 30,
        statements: 40,
      },
      exclude: [
        "src/generated/**",
        "src/__tests__/**",
        "src/app/**/loading.tsx",
        "src/app/**/error.tsx",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
