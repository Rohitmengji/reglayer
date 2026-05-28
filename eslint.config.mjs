/**
 * RegLayer — ESLint Configuration (Flat Config)
 *
 * WHY: Code quality enforcement — catches bugs, enforces style, ensures accessibility best practices.
 * WHAT: ESLint 9 flat config with Next.js, TypeScript, jsx-a11y, and Prettier plugins.
 * HOW: Extends next/core-web-vitals, adds strict TypeScript rules, jsx-a11y for React accessibility.
 */
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
