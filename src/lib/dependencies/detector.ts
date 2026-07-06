/**
 * ---------------------------------------------------------
 * RegLayer — Library Version Detector
 * ---------------------------------------------------------
 *
 * WHY: To build the dependency intelligence graph, we need to know which
 *      packages and versions are present on scanned pages.
 *
 * WHAT: Runs in-page JavaScript to detect common framework/library versions
 *      from globals, meta tags, script sources, and DOM patterns.
 *
 * HOW: Given a Playwright Page, evaluates detection scripts and returns
 *      a list of { package, version, source } tuples. Best-effort — missing
 *      a library is acceptable; false positives are not.
 * ---------------------------------------------------------
 */

import "server-only";

import type { Page } from "playwright-core";

export interface DetectedDependency {
  package: string;
  version: string;
  source: "script_tag" | "meta" | "global" | "dom_pattern";
}

/**
 * Detect library versions on a live Playwright page.
 * Must be called AFTER page load (domcontentloaded or load).
 * Best-effort, non-throwing — returns whatever it can find.
 */
export async function detectLibraryVersions(page: Page): Promise<DetectedDependency[]> {
  try {
    return await page.evaluate(() => {
      const deps: Array<{ package: string; version: string; source: string }> = [];
      const w = window as unknown as Record<string, unknown>;

      // ── React ──
      const reactRoot = document.querySelector("[data-reactroot]") || document.querySelector("#__next");
      if (reactRoot || w.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
        const ver = (w.React as { version?: string })?.version
          || document.querySelector("meta[name='react-version']")?.getAttribute("content");
        if (ver) deps.push({ package: "react", version: ver, source: "global" });
      }

      // ── Next.js ──
      const nextData = document.getElementById("__NEXT_DATA__");
      if (nextData) {
        try {
          const parsed = JSON.parse(nextData.textContent || "{}");
          const ver = parsed.buildId ? "detected" : undefined;
          // Next.js version in __NEXT_DATA__.appGip or script tags
          const nextScript = Array.from(document.querySelectorAll("script[src]"))
            .find((s) => s.getAttribute("src")?.includes("/_next/"));
          if (nextScript || nextData) {
            const metaVer = document.querySelector("meta[name='next-version']")?.getAttribute("content");
            deps.push({ package: "next", version: metaVer || ver || "unknown", source: "meta" });
          }
        } catch { /* ignore */ }
      }

      // ── Vue ──
      if (w.__VUE__ || w.Vue || document.querySelector("[data-v-]")) {
        const ver = (w.Vue as { version?: string })?.version || "detected";
        deps.push({ package: "vue", version: ver, source: "global" });
      }

      // ── Angular ──
      const ngVersion = document.querySelector("[ng-version]");
      if (ngVersion) {
        deps.push({ package: "@angular/core", version: ngVersion.getAttribute("ng-version") || "detected", source: "dom_pattern" });
      }

      // ── jQuery ──
      if (w.jQuery || w.$) {
        const ver = (w.jQuery as { fn?: { jquery?: string } })?.fn?.jquery || "detected";
        deps.push({ package: "jquery", version: ver, source: "global" });
      }

      // ── Tailwind CSS (via utility class presence) ──
      const hasTailwind = document.querySelector("[class*='flex']") &&
        document.querySelector("[class*='text-']") &&
        document.querySelector("[class*='bg-']");
      if (hasTailwind) {
        deps.push({ package: "tailwindcss", version: "detected", source: "dom_pattern" });
      }

      // ── Common UI libraries via script src patterns ──
      const scripts = Array.from(document.querySelectorAll("script[src]"));
      const scriptSrcs = scripts.map((s) => s.getAttribute("src") || "");

      const scriptPatterns: Array<{ pattern: RegExp; pkg: string }> = [
        { pattern: /radix-ui|@radix/, pkg: "@radix-ui" },
        { pattern: /headlessui/, pkg: "@headlessui/react" },
        { pattern: /chakra-ui/, pkg: "@chakra-ui/react" },
        { pattern: /material-ui|@mui/, pkg: "@mui/material" },
        { pattern: /antd|ant-design/, pkg: "antd" },
        { pattern: /bootstrap/, pkg: "bootstrap" },
        { pattern: /stripe\.js|js\.stripe/, pkg: "@stripe/stripe-js" },
      ];

      for (const { pattern, pkg } of scriptPatterns) {
        if (scriptSrcs.some((src) => pattern.test(src))) {
          deps.push({ package: pkg, version: "detected", source: "script_tag" });
        }
      }

      // ── Third-party widgets (complements VALG) ──
      const widgetPatterns: Array<{ selector: string; pkg: string }> = [
        { selector: "#intercom-container, [data-intercom]", pkg: "intercom-widget" },
        { selector: "#drift-widget, .drift-frame", pkg: "drift-widget" },
        { selector: "[data-cookieconsent], #onetrust-banner-sdk", pkg: "onetrust" },
        { selector: "#hubspot-messages-iframe-container", pkg: "hubspot-chat" },
        { selector: ".zEWidget-launcher, #launcher", pkg: "zendesk-widget" },
      ];

      for (const { selector, pkg } of widgetPatterns) {
        if (document.querySelector(selector)) {
          deps.push({ package: pkg, version: "detected", source: "dom_pattern" });
        }
      }

      return deps;
    }) as DetectedDependency[];
  } catch {
    return []; // Best-effort — page might be gone or evaluate failed
  }
}
