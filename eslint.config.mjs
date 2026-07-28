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
import jsxA11y from "eslint-plugin-jsx-a11y";

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
  {
    rules: {
      // Full jsx-a11y recommended ruleset. `next/core-web-vitals` registers the plugin but
      // only enables a small subset, which is why 78 unassociated <label>s, 5 non-keyboard
      // click handlers and a nameless combobox reached production on an accessibility
      // product. We spread the RULES only — re-registering the plugin via
      // `jsxA11y.flatConfigs.recommended` throws "Cannot redefine plugin jsx-a11y",
      // because eslint-config-next has already defined it.
      ...jsxA11y.flatConfigs.recommended.rules,

      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
      }],

      // These map directly to WCAG failures found in the audit. They are "warn" rather than
      // "error" ON PURPOSE: there is an existing backlog of 74 jsx-a11y findings (43 of them
      // `label-has-associated-control`). Turning them into errors today would wall off all
      // work behind an unrelated cleanup. Ratchet instead — clear the backlog, then escalate
      // each rule to "error" so it can never regress. Runtime contrast/role checks that static
      // analysis cannot see live in e2e/a11y.spec.ts and DO fail the build today.
      "jsx-a11y/click-events-have-key-events": "warn",       // WCAG 2.1.1 Keyboard
      "jsx-a11y/no-static-element-interactions": "warn",     // WCAG 2.1.1 / 4.1.2
      "jsx-a11y/label-has-associated-control": "warn",       // WCAG 1.3.1 / 3.3.2
      // Also demoted from the recommended set's default of "error" for the same reason:
      // each has pre-existing violations. Counts at the time of enabling (2026-07-28) —
      // do not let these grow:
      //   no-noninteractive-element-interactions  5
      //   no-autofocus                            6   (several are legitimate dialog focus
      //                                                management; audit before "fixing")
      //   no-noninteractive-tabindex              1
      //   no-interactive-element-to-noninteractive-role  1
      "jsx-a11y/no-noninteractive-element-interactions": "warn",
      "jsx-a11y/no-autofocus": "warn",
      "jsx-a11y/no-noninteractive-tabindex": "warn",
      "jsx-a11y/no-interactive-element-to-noninteractive-role": "warn",
      // Already at zero violations — locked as errors so they stay that way.
      "jsx-a11y/role-has-required-aria-props": "error",      // WCAG 4.1.2
      "jsx-a11y/aria-props": "error",
      "jsx-a11y/aria-role": "error",
    },
  },
]);

export default eslintConfig;
