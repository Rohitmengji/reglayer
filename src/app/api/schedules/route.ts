/**
 * ---------------------------------------------------------
 * RegLayer — Schedules API
 * ---------------------------------------------------------
 *
 * Purpose:
 * CRUD for scan schedules + trigger endpoint for cron.
 *
 * Endpoints:
 * GET  /api/schedules         → List all schedules
 * POST /api/schedules         → Create new schedule
 * POST /api/schedules/trigger → Execute due schedules (called by cron)
 * ---------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createSchedule,
  getSchedules,
  toggleSchedule,
  deleteSchedule,
  executeDueSchedules,
} from "@/lib/queue/scheduler";

const createScheduleSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url(),
  cron: z.string().min(9).max(100),
  options: z
    .object({
      includeScreenshot: z.boolean().optional(),
      timeout: z.number().optional(),
    })
    .optional(),
});

export async function GET() {
  const schedules = getSchedules();
  return NextResponse.json({ schedules });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Check if this is a trigger request
    if (body.action === "trigger") {
      const executed = executeDueSchedules();
      return NextResponse.json({
        message: "Schedules checked",
        executed: executed.length,
        scheduleIds: executed,
      });
    }

    if (body.action === "toggle" && body.id) {
      const schedule = toggleSchedule(body.id);
      if (!schedule) {
        return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
      }
      return NextResponse.json({ schedule });
    }

    if (body.action === "delete" && body.id) {
      const deleted = deleteSchedule(body.id);
      if (!deleted) {
        return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
      }
      return NextResponse.json({ message: "Deleted" });
    }

    // Create new schedule
    const parseResult = createScheduleSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parseResult.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const schedule = createSchedule(parseResult.data);
    return NextResponse.json({ schedule }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to process schedule request" },
      { status: 500 }
    );
  }
}
