import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

// The service imports prisma at module scope; scheduling maths needs no database.
vi.mock("@/lib/database/prisma", () => ({ prisma: {} }));
import { calculateNextRun, validateCronForPlan } from "@/lib/scheduling/scheduleService";

const DAILY_9AM = "0 9 * * *";
const WEEKLY_MON = "0 9 * * 1";
const HOURLY = "0 * * * *";

describe("calculateNextRun", () => {
  it("returns null for an unparseable cron rather than throwing", () => {
    expect(calculateNextRun("not a cron")).toBeNull();
    expect(calculateNextRun("99 99 * * *")).toBeNull();
  });

  it("does NOT reject an empty cron — the API's min-length rule is what blocks it", () => {
    // cron-parser accepts "" and treats it as every minute, so this helper alone
    // is not a validation boundary. Documented so nobody relies on it as one.
    expect(calculateNextRun("")).toBeInstanceOf(Date);
  });

  it("returns a time strictly after the reference point", () => {
    const from = new Date("2026-05-10T12:00:00Z");
    const next = calculateNextRun(DAILY_9AM, from);
    expect(next).toBeInstanceOf(Date);
    expect(next!.getTime()).toBeGreaterThan(from.getTime());
  });

  it("schedules a daily cron within the next 25 hours (DST-tolerant)", () => {
    const from = new Date("2026-05-10T12:00:00Z");
    const next = calculateNextRun(DAILY_9AM, from)!;
    const hours = (next.getTime() - from.getTime()) / 3_600_000;
    expect(hours).toBeGreaterThan(0);
    expect(hours).toBeLessThanOrEqual(25);
  });

  it("schedules a weekly cron within the next 8 days", () => {
    const from = new Date("2026-05-10T12:00:00Z");
    const next = calculateNextRun(WEEKLY_MON, from)!;
    const days = (next.getTime() - from.getTime()) / 86_400_000;
    expect(days).toBeGreaterThan(0);
    expect(days).toBeLessThanOrEqual(8);
  });

  it("advances when called again from its own result (no stuck schedule)", () => {
    const first = calculateNextRun(DAILY_9AM, new Date("2026-05-10T12:00:00Z"))!;
    const second = calculateNextRun(DAILY_9AM, first)!;
    expect(second.getTime()).toBeGreaterThan(first.getTime());
  });

  it("defaults to now when no reference is given", () => {
    const before = Date.now();
    const next = calculateNextRun(DAILY_9AM)!;
    expect(next.getTime()).toBeGreaterThanOrEqual(before);
  });
});

describe("validateCronForPlan", () => {
  it("rejects an unparseable cron on every plan", () => {
    for (const plan of ["FREE", "PRO", "ENTERPRISE"]) {
      expect(validateCronForPlan("not a cron", plan)).toBe("Invalid cron expression");
    }
  });

  it("allows a daily schedule on PRO and ENTERPRISE", () => {
    expect(validateCronForPlan(DAILY_9AM, "PRO")).toBeNull();
    expect(validateCronForPlan(DAILY_9AM, "ENTERPRISE")).toBeNull();
  });

  it("rejects sub-daily cadence on PRO and ENTERPRISE", () => {
    expect(validateCronForPlan(HOURLY, "PRO")).toMatch(/minimum interval/i);
    expect(validateCronForPlan(HOURLY, "ENTERPRISE")).toMatch(/minimum interval/i);
  });

  it("allows weekly but rejects daily on FREE", () => {
    expect(validateCronForPlan(WEEKLY_MON, "FREE")).toBeNull();
    expect(validateCronForPlan(DAILY_9AM, "FREE")).toMatch(/minimum interval/i);
  });

  it("treats an unknown plan as the most restrictive (FREE)", () => {
    expect(validateCronForPlan(DAILY_9AM, "MYSTERY_TIER")).toMatch(/minimum interval/i);
    expect(validateCronForPlan(WEEKLY_MON, "MYSTERY_TIER")).toBeNull();
  });

  it("states the limit in days when the limit is a day or more", () => {
    expect(validateCronForPlan(HOURLY, "PRO")).toMatch(/day\(s\)/);
  });
});

describe("validateCronForPlan — DST", () => {
  afterEach(() => vi.useRealTimers());

  it("still allows a daily schedule across a spring-forward boundary", () => {
    // In DST timezones the first two occurrences are only 23h apart here; a
    // daily schedule must not be rejected because of that.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-07T12:00:00Z"));
    expect(validateCronForPlan(DAILY_9AM, "PRO")).toBeNull();
  });
});

describe("schedule cadence round-trip", () => {
  beforeEach(() => vi.useRealTimers());

  it("produces a next run for every cadence the UI offers", () => {
    for (const cron of [DAILY_9AM, WEEKLY_MON, "0 9 1 * *"]) {
      expect(calculateNextRun(cron)).toBeInstanceOf(Date);
    }
  });
});
