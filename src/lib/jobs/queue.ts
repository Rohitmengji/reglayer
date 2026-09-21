import { PgBoss, type Db, type Queue } from "pg-boss";
import { z } from "zod";

export const DATABASE_TASK_QUEUE = "database-tasks-v1";
export const DATABASE_TASK_POLICY = {
  policy: "singleton",
  retryLimit: 3,
  retryDelay: 5,
  retryBackoff: true,
  retryDelayMax: 60,
  expireInSeconds: 120,
  heartbeatSeconds: 30,
  retentionSeconds: 24 * 60 * 60,
  deleteAfterSeconds: 7 * 24 * 60 * 60,
} satisfies Omit<Queue, "name">;

const taskSchema = z.object({
  version: z.literal(1),
  operationId: z.string().uuid(),
  workspaceId: z.string().min(1).max(128),
}).strict();

export type DatabaseTask = z.infer<typeof taskSchema>;

export function createJobQueue(
  connectionString: string,
  onError: (error: Error) => void,
  { supervisionIntervalSeconds = 10 }: { supervisionIntervalSeconds?: number } = {},
): PgBoss {
  const target = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(target.protocol)) {
    throw new Error("A PostgreSQL connection is required for the worker.");
  }
  const queue = new PgBoss({
    connectionString,
    schema: "reglayer_jobs",
    migrate: false,
    createSchema: false,
    schedule: false,
    supervise: true,
    superviseIntervalSeconds: supervisionIntervalSeconds,
    monitorIntervalSeconds: supervisionIntervalSeconds,
    queueCacheIntervalSeconds: supervisionIntervalSeconds,
    max: 5,
    connectionTimeoutMillis: 5_000,
    application_name: "reglayer-worker",
  });
  queue.on("error", onError);
  return queue;
}

export async function enqueueDatabaseTask(queue: PgBoss, task: DatabaseTask, transaction: Db): Promise<string> {
  const payload = taskSchema.parse(task);
  const id = await queue.send(DATABASE_TASK_QUEUE, payload, {
    id: payload.operationId,
    singletonKey: payload.workspaceId,
    group: { id: payload.workspaceId },
    db: transaction,
  });
  if (!id) throw new Error("The operation is already queued; no new task was accepted.");
  return id;
}

export function workDatabaseTasks(
  queue: PgBoss,
  handler: (task: DatabaseTask, transaction: Db, signal: AbortSignal) => Promise<void>,
): Promise<string> {
  return queue.work(DATABASE_TASK_QUEUE, {
    transactional: true,
    batchSize: 1,
    localConcurrency: 2,
    pollingIntervalSeconds: 1,
  }, async (jobs, transaction) => {
    const job = jobs[0];
    job.signal.throwIfAborted();
    await handler(taskSchema.parse(job.data), transaction, job.signal);
    job.signal.throwIfAborted();
  });
}