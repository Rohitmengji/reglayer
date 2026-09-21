import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConstructorOptions } from "pg-boss";

const mocks = vi.hoisted(() => ({
  construct: vi.fn(), on: vi.fn(), send: vi.fn(), work: vi.fn(),
}));
vi.mock("pg-boss", () => ({
  PgBoss: class {
    constructor(options: ConstructorOptions) { mocks.construct(options); }
    on = mocks.on;
    send = mocks.send;
    work = mocks.work;
  },
}));

import { createJobQueue, DATABASE_TASK_QUEUE, enqueueDatabaseTask, workDatabaseTasks } from "@/lib/jobs/queue";

const task = { version: 1 as const, operationId: "cd758f14-e156-492b-8d6c-c26bfac87934", workspaceId: "workspace-1" };
const transaction = { executeSql: vi.fn() };
beforeEach(() => { vi.resetAllMocks(); });

describe("durable database task boundary", () => {
  it("requires explicit PostgreSQL configuration and disables schema changes", () => {
    const onError = vi.fn();
    createJobQueue("postgresql://localhost/unused", onError);
    expect(mocks.construct).toHaveBeenCalledWith(expect.objectContaining({
      connectionString: "postgresql://localhost/unused", schema: "reglayer_jobs",
      migrate: false, createSchema: false, supervise: true,
      superviseIntervalSeconds: 10, monitorIntervalSeconds: 10, max: 5,
    }));
    expect(mocks.on).toHaveBeenCalledWith("error", onError);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("rejects non-PostgreSQL configuration before creating a queue", () => {
    expect(() => createJobQueue("https://example.com", vi.fn())).toThrow("PostgreSQL");
    expect(mocks.construct).not.toHaveBeenCalled();
  });

  it("enqueues only references through the caller's transaction", async () => {
    mocks.send.mockResolvedValue(task.operationId);
    const queue = createJobQueue("postgresql://localhost/unused", vi.fn());
    expect(await enqueueDatabaseTask(queue, task, transaction)).toBe(task.operationId);
    expect(mocks.send).toHaveBeenCalledWith(DATABASE_TASK_QUEUE, task, {
      id: task.operationId, singletonKey: task.workspaceId, group: { id: task.workspaceId }, db: transaction,
    });
  });

  it("rejects credentials and extra fields before sending", async () => {
    const queue = createJobQueue("postgresql://localhost/unused", vi.fn());
    await expect(enqueueDatabaseTask(queue, { ...task, password: "not-a-real-secret" } as typeof task, transaction)).rejects.toThrow();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("validates the payload again before a worker executes it", async () => {
    const queue = createJobQueue("postgresql://localhost/unused", vi.fn());
    const handler = vi.fn();
    await workDatabaseTasks(queue, handler);
    expect(mocks.work).toHaveBeenCalledWith(DATABASE_TASK_QUEUE, expect.objectContaining({
      transactional: true, batchSize: 1, localConcurrency: 2,
    }), expect.any(Function));
    const callback = mocks.work.mock.calls[0][2];
    await expect(callback([{ data: { ...task, version: 99 }, signal: new AbortController().signal }], transaction)).rejects.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });

  it("refuses to execute work whose claim has already expired", async () => {
    const queue = createJobQueue("postgresql://localhost/unused", vi.fn());
    const handler = vi.fn();
    const abort = new AbortController();
    abort.abort();
    await workDatabaseTasks(queue, handler);
    const callback = mocks.work.mock.calls[0][2];
    await expect(callback([{ data: task, signal: abort.signal }], transaction)).rejects.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not acknowledge a handler that finishes after its claim is aborted", async () => {
    const queue = createJobQueue("postgresql://localhost/unused", vi.fn());
    const abort = new AbortController();
    const handler = vi.fn(async () => { abort.abort(); });
    await workDatabaseTasks(queue, handler);
    const callback = mocks.work.mock.calls[0][2];
    await expect(callback([{ data: task, signal: abort.signal }], transaction)).rejects.toThrow();
    expect(handler).toHaveBeenCalledOnce();
  });
});