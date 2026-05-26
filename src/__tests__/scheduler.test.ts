import { describe, it, expect } from "vitest";
import {
  createSchedule,
  getSchedules,
  getSchedule,
  toggleSchedule,
  deleteSchedule,
} from "@/lib/queue/scheduler";

describe("Scheduler", () => {
  // Note: schedules persist in-memory across tests in same run
  // so we test with unique names

  it("creates a schedule with valid cron", () => {
    const schedule = createSchedule({
      name: "Test Weekly",
      url: "https://example.com",
      cron: "0 9 * * 1",
    });

    expect(schedule.id).toMatch(/^sched_/);
    expect(schedule.name).toBe("Test Weekly");
    expect(schedule.url).toBe("https://example.com");
    expect(schedule.cron).toBe("0 9 * * 1");
    expect(schedule.enabled).toBe(true);
    expect(schedule.nextRunAt).toBeDefined();
  });

  it("calculates next run time", () => {
    const schedule = createSchedule({
      name: "Test Daily",
      url: "https://example.com",
      cron: "0 0 * * *",
    });

    expect(schedule.nextRunAt).toBeDefined();
    const nextRun = new Date(schedule.nextRunAt!);
    expect(nextRun.getTime()).toBeGreaterThan(Date.now());
  });

  it("lists all schedules", () => {
    const schedules = getSchedules();
    expect(schedules.length).toBeGreaterThanOrEqual(2);
  });

  it("gets schedule by ID", () => {
    const created = createSchedule({
      name: "Find Me",
      url: "https://test.dev",
      cron: "0 12 * * *",
    });

    const found = getSchedule(created.id);
    expect(found).toBeDefined();
    expect(found!.name).toBe("Find Me");
  });

  it("toggles schedule enabled state", () => {
    const schedule = createSchedule({
      name: "Toggle Test",
      url: "https://toggle.dev",
      cron: "0 6 * * *",
    });

    expect(schedule.enabled).toBe(true);

    const toggled = toggleSchedule(schedule.id);
    expect(toggled?.enabled).toBe(false);

    const toggledBack = toggleSchedule(schedule.id);
    expect(toggledBack?.enabled).toBe(true);
  });

  it("deletes a schedule", () => {
    const schedule = createSchedule({
      name: "Delete Me",
      url: "https://delete.dev",
      cron: "0 0 1 * *",
    });

    const deleted = deleteSchedule(schedule.id);
    expect(deleted).toBe(true);

    const found = getSchedule(schedule.id);
    expect(found).toBeUndefined();
  });

  it("returns undefined for non-existent schedule", () => {
    const found = getSchedule("sched_nonexistent");
    expect(found).toBeUndefined();
  });
});
