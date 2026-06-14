/**
 * RegLayer — i18n Parity Tests (CI guard for finding ux-03)
 *
 * WHY: es/it/nl/pt (and parts of fr/de) had drifted ~350 keys behind en.ts, so those
 *      markets silently fell back to English. This guard fails CI if any non-en locale
 *      ever drifts from the canonical en.ts key set again.
 * WHAT: Asserts every non-en locale exports EXACTLY the same set of keys as en (no missing,
 *       no extra), keeps interpolation placeholders ({count}, {name}, ...) intact, and that
 *       the previously-missing onboarding keys are present everywhere.
 * HOW: en.ts is the source of truth. Each locale is compared key-set against it.
 */
import { describe, it, expect } from "vitest";
import { en } from "@/lib/i18n/en";
import { de } from "@/lib/i18n/de";
import { fr } from "@/lib/i18n/fr";
import { es } from "@/lib/i18n/es";
import { it as itLocale } from "@/lib/i18n/it";
import { nl } from "@/lib/i18n/nl";
import { pt } from "@/lib/i18n/pt";

type LocaleMap = Record<string, string>;

const locales: Record<string, LocaleMap> = {
  de,
  fr,
  es,
  it: itLocale,
  nl,
  pt,
};

const enKeys = Object.keys(en).sort();
const enKeySet = new Set(enKeys);

function placeholders(value: string): string[] {
  return (value.match(/\{(\w+)\}/g) ?? []).sort();
}

describe("i18n parity — every locale matches en.ts exactly", () => {
  it("en.ts has no duplicate keys (sanity)", () => {
    expect(enKeys.length).toBe(enKeySet.size);
  });

  for (const [code, map] of Object.entries(locales)) {
    describe(`locale: ${code}`, () => {
      const localeKeys = Object.keys(map);
      const localeKeySet = new Set(localeKeys);

      it(`has no keys missing vs en`, () => {
        const missing = enKeys.filter((k) => !localeKeySet.has(k));
        expect(missing, `${code} is missing ${missing.length} key(s): ${missing.join(", ")}`).toEqual([]);
      });

      it(`has no extra keys vs en`, () => {
        const extra = localeKeys.filter((k) => !enKeySet.has(k));
        expect(extra, `${code} has ${extra.length} extra key(s): ${extra.join(", ")}`).toEqual([]);
      });

      it(`has the identical key set as en`, () => {
        expect(localeKeys.slice().sort()).toEqual(enKeys);
      });

      it(`preserves interpolation placeholders for every key`, () => {
        const mismatches: string[] = [];
        for (const key of enKeys) {
          const expected = placeholders(en[key as keyof typeof en]);
          const actual = placeholders(map[key]);
          if (JSON.stringify(expected) !== JSON.stringify(actual)) {
            mismatches.push(`${key} (en: ${expected.join(",")} | ${code}: ${actual.join(",")})`);
          }
        }
        expect(mismatches, `${code} placeholder mismatches: ${mismatches.join(" ; ")}`).toEqual([]);
      });
    });
  }
});

describe("i18n — onboarding keys (the specific ux-03 gap) are translated everywhere", () => {
  const onboardingKeys = [
    "onboarding.welcome",
    "onboarding.roleTitle",
    "onboarding.gettingStarted",
    "onboarding.complete",
    "onboarding.continue",
    "onboarding.addSite",
    "onboarding.addSiteDesc",
    "onboarding.runScan",
    "onboarding.runScanDesc",
    "onboarding.inviteTeam",
    "onboarding.inviteTeamDesc",
    "onboarding.connectCI",
    "onboarding.connectCIDesc",
    "onboarding.firstFix",
    "onboarding.firstFixDesc",
    "onboarding.developer",
    "onboarding.developerDesc",
    "onboarding.designer",
    "onboarding.designerDesc",
    "onboarding.legal",
    "onboarding.legalDesc",
    "onboarding.executive",
    "onboarding.executiveDesc",
  ] as const;

  for (const [code, map] of Object.entries(locales)) {
    it(`${code} defines every onboarding key with a non-empty value`, () => {
      for (const key of onboardingKeys) {
        expect(enKeySet.has(key), `${key} must exist in en.ts`).toBe(true);
        expect(typeof map[key], `${code}.${key} should be a string`).toBe("string");
        expect(map[key].length, `${code}.${key} should be non-empty`).toBeGreaterThan(0);
      }
    });
  }
});
