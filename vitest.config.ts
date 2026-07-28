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
      // WHY `include` is mandatory: without it, the v8 provider only reports files that were
      // actually loaded during the run. Untested files become invisible rather than counting
      // as 0%, so coverage measures "how well tested are the already-tested files" — a metric
      // that cannot detect the risk it exists to detect. With `include`, the denominator is
      // the whole codebase (28,549 statements vs 6,146 when unset).
      include: ["src/**/*.{ts,tsx}"],
      // Thresholds are the HONEST measured baseline (with a small safety margin below
      // the actual ~14.2/13.8/13.3/14.3 measured values), not an aspiration. They exist
      // to ratchet: raise them as coverage improves; never lower them. A gate that
      // cannot fail is not a gate. Keep this in sync with the CI workflow's "Coverage
      // threshold check" step (.github/workflows/ci.yml), which enforces its own
      // separate floor on `lines.pct` from coverage-summary.json.
      thresholds: {
        lines: 13,
        functions: 12,
        branches: 12,
        statements: 13,
      },
      exclude: [
        "src/generated/**",
        "src/__tests__/**",
        "src/app/**/loading.tsx",
        "src/app/**/error.tsx",
        "src/app/**/not-found.tsx",
        "**/*.d.ts",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
