import { describe, it, expect } from "vitest";
import { assessRegulations } from "@/lib/compliance/regulations";

describe("assessRegulations", () => {
  it("applies the EAA to a non-micro EU-facing ecommerce business", () => {
    const r = assessRegulations({ region: "US", sellsToEU: true, sector: "ecommerce", employees: 50, annualRevenueEur: 10_000_000 });
    const eaa = r.applicable.find((l) => l.id === "eaa");
    expect(eaa).toBeTruthy();
    expect(eaa!.deadline).toBe("2025-06-28");
    expect(eaa!.wcagVersion).toBe("2.1");
  });
  it("exempts an EU-facing service microenterprise from the EAA", () => {
    const r = assessRegulations({ region: "EU", sellsToEU: true, sector: "ecommerce", employees: 5, annualRevenueEur: 1_000_000 });
    expect(r.applicable.find((l) => l.id === "eaa")).toBeUndefined();
  });
  it("tiers ADA Title II deadlines by population served", () => {
    const big = assessRegulations({ region: "US", isPublicSector: true, governmentLevel: "state_local", populationServed: 200_000 });
    const small = assessRegulations({ region: "US", isPublicSector: true, governmentLevel: "state_local", populationServed: 10_000 });
    expect(big.applicable.find((l) => l.id === "ada-title-ii")!.deadline).toBe("2026-04-24");
    expect(small.applicable.find((l) => l.id === "ada-title-ii")!.deadline).toBe("2027-04-26");
  });
  it("maps US federal → Section 508 (WCAG 2.0) and US private → ADA Title III", () => {
    expect(assessRegulations({ region: "US", isPublicSector: true, governmentLevel: "federal" }).applicable[0].id).toBe("section-508");
    expect(assessRegulations({ region: "US", isPublicSector: false }).applicable.find((l) => l.id === "ada-title-iii")).toBeTruthy();
  });
  it("applies AODA to Ontario orgs with 20+ employees but not smaller private ones", () => {
    expect(assessRegulations({ region: "CA", employees: 25 }).applicable.find((l) => l.id === "aoda")).toBeTruthy();
    expect(assessRegulations({ region: "CA", isPublicSector: false, employees: 5 }).applicable.find((l) => l.id === "aoda")).toBeUndefined();
  });
  it("computes the strictest required WCAG version + always returns a disclaimer", () => {
    const r = assessRegulations({ region: "US", isPublicSector: false, sellsToEU: true, sector: "banking", employees: 100 });
    expect(r.requiredWcag).toBe("WCAG 2.1 Level AA"); // 2.1 (ADA III / EAA) beats nothing lower
    expect(r.disclaimer).toMatch(/not legal advice/i);
    expect(assessRegulations({ region: "OTHER" }).requiredWcag).toBeNull();
  });
});
