import { randomUUID } from "node:crypto";
import { fork, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { Client } from "pg";
import { PgBoss } from "pg-boss";
import { createJobQueue, DATABASE_TASK_POLICY, DATABASE_TASK_QUEUE, enqueueDatabaseTask } from "../src/lib/jobs/queue";

const connectionString = process.env.REGLAYER_TEST_DATABASE_URL;
if (!connectionString) throw new Error("Use npm run test:postgres for isolated queue tests.");
const target = new URL(connectionString);
if (target.hostname !== "127.0.0.1" || target.pathname !== "/reglayer_test" || target.search) {
  throw new Error("Queue tests require the disposable loopback database.");
}

const client = new Client({ connectionString });
const errors: Error[] = [];
const queue = createJobQueue(connectionString, error => errors.push(error), { supervisionIntervalSeconds: 1 });
const workers: Array<{ process: ChildProcess; messages: Array<{ type: string; operationId?: string }>; exit: Promise<void> }> = [];
let workspaceId: string;

function startWorker(mode: "hold" | "complete" | "fail") {
  const child = fork(fileURLToPath(new URL("./fixtures/queue-worker.mjs", import.meta.url)), [mode], {
    execArgv: ["--experimental-strip-types"],
    env: { NODE_ENV: "test", PATH: process.env.PATH, HOME: process.env.HOME, REGLAYER_TEST_DATABASE_URL: connectionString },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  const messages: Array<{ type: string; operationId?: string }> = [];
  const worker = { process: child, messages, exit: new Promise<void>(resolve => child.once("close", () => resolve())) };
  let stderr = "";
  child.stderr?.on("data", chunk => { stderr = (stderr + chunk.toString()).slice(-4000); });
  child.stdout?.resume();
  child.on("message", message => messages.push(message as { type: string; operationId?: string }));
  child.on("error", () => messages.push({ type: "error" }));
  workers.push(worker);
  return {
    ...worker,
    async waitFor(type: string) {
      await expect.poll(() => {
        if (child.exitCode !== null || child.signalCode !== null || messages.some(message => message.type === "error")) {
          throw new Error(`Worker exited before ${type}: ${stderr.replaceAll(connectionString!, "[test database]")}`);
        }
        return messages.some(message => message.type === type);
      }, { timeout: 10_000 }).toBe(true);
    },
  };
}

async function enqueueRequest(tenantId = workspaceId) {
  const operationId = randomUUID();
  await client.query("BEGIN");
  try {
    await client.query("INSERT INTO queue_test_requests VALUES ($1, $2)", [operationId, tenantId]);
    const id = await enqueueDatabaseTask(queue, { version: 1, operationId, workspaceId: tenantId }, {
      executeSql: (text, values) => client.query(text, values),
    });
    await client.query("COMMIT");
    return id;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function jobState(id: string) {
  return (await queue.findJobs(DATABASE_TASK_QUEUE, { id }))[0];
}

beforeAll(async () => {
  await client.connect();
  const installer = new PgBoss({ connectionString, schema: "reglayer_jobs", supervise: false, schedule: false });
  installer.on("error", error => errors.push(error));
  try {
    await installer.start();
    const { retryDelayMax: _retryDelayMax, ...testPolicy } = DATABASE_TASK_POLICY;
    await installer.createQueue(DATABASE_TASK_QUEUE, {
      ...testPolicy,
      expireInSeconds: 5,
      retryLimit: 1,
      retryDelay: 0,
      retryBackoff: false,
    });
  } finally {
    await installer.stop();
  }
  await queue.start();
  await client.query("CREATE TABLE queue_test_requests (id uuid PRIMARY KEY, workspace_id text NOT NULL)");
  await client.query("CREATE TABLE queue_test_effects (id uuid PRIMARY KEY, workspace_id text NOT NULL)");
});

beforeEach(async () => {
  workspaceId = randomUUID();
  await queue.deleteAllJobs(DATABASE_TASK_QUEUE);
  await client.query("TRUNCATE queue_test_requests, queue_test_effects");
});

afterEach(async () => {
  for (const worker of workers.splice(0)) {
    if (worker.process.exitCode === null && worker.process.signalCode === null) worker.process.kill("SIGKILL");
    await worker.exit;
  }
});

afterAll(async () => {
  await queue.stop();
  await client.end();
  expect(errors).toEqual([]);
});

it("rolls back both a request and its task using the same PostgreSQL transaction", async () => {
  const operationId = randomUUID();
  await client.query("BEGIN");
  try {
    await client.query("INSERT INTO queue_test_requests VALUES ($1, $2)", [operationId, workspaceId]);
    await enqueueDatabaseTask(queue, { version: 1, operationId, workspaceId }, {
      executeSql: (text, values) => client.query(text, values),
    });
  } finally {
    await client.query("ROLLBACK");
  }
  expect((await client.query("SELECT id FROM queue_test_requests WHERE id = $1", [operationId])).rows).toEqual([]);
  expect(await queue.findJobs(DATABASE_TASK_QUEUE, { id: operationId })).toEqual([]);
});

it("keeps committed work until a separate worker connects and completes it atomically", async () => {
  const operationId = await enqueueRequest();
  expect((await jobState(operationId))?.state).toBe("created");
  expect((await client.query("SELECT * FROM queue_test_effects")).rows).toEqual([]);
  const worker = startWorker("complete");
  await worker.waitFor("ready");
  await expect.poll(async () => (await jobState(operationId))?.state, { timeout: 10_000 }).toBe("completed");
  expect((await client.query("SELECT id FROM queue_test_effects")).rows).toEqual([{ id: operationId }]);
  worker.process.kill("SIGTERM");
  await worker.exit;
  expect(worker.process.exitCode).toBe(0);
});

it("redelivers the same job after a worker is killed without committing partial effects", async () => {
  const operationId = await enqueueRequest();
  const first = startWorker("hold");
  await first.waitFor("write");
  expect((await jobState(operationId))?.state).toBe("active");
  expect((await client.query("SELECT * FROM queue_test_effects")).rows).toEqual([]);

  first.process.kill("SIGKILL");
  await first.exit;
  const replacement = startWorker("complete");
  await replacement.waitFor("ready");
  await expect.poll(async () => (await jobState(operationId))?.state, { timeout: 12_000 }).toBe("completed");

  expect(replacement.messages.filter(message => message.type === "write")).toEqual([{ type: "write", operationId }]);
  expect((await client.query("SELECT id FROM queue_test_effects")).rows).toEqual([{ id: operationId }]);
  expect((await jobState(operationId))?.retryCount).toBe(1);
}, 25_000);

it("stops retrying at the configured limit and rolls back each failed attempt", async () => {
  const operationId = await enqueueRequest();
  const worker = startWorker("fail");
  await worker.waitFor("ready");
  await expect.poll(async () => (await jobState(operationId))?.state, { timeout: 10_000 }).toBe("failed");
  expect(worker.messages.filter(message => message.type === "write")).toHaveLength(2);
  expect((await jobState(operationId))?.retryCount).toBe(1);
  expect((await client.query("SELECT * FROM queue_test_effects")).rows).toEqual([]);
});

it("rejects duplicate operation IDs while the original job is retained", async () => {
  const operationId = await enqueueRequest();
  await client.query("BEGIN");
  try {
    await expect(enqueueDatabaseTask(queue, { version: 1, operationId, workspaceId }, {
      executeSql: (text, values) => client.query(text, values),
    })).rejects.toThrow("already queued");
  } finally {
    await client.query("ROLLBACK");
  }
  expect(await queue.findJobs(DATABASE_TASK_QUEUE, { id: operationId })).toHaveLength(1);
});

it("bounds work per workspace across independent worker processes", async () => {
  const sameWorkspace = [
    await enqueueRequest(),
    await enqueueRequest(),
    await enqueueRequest(),
  ];
  const otherWorkspace = await enqueueRequest(randomUUID());
  const first = startWorker("hold");
  const second = startWorker("hold");
  await first.waitFor("ready");
  await second.waitFor("ready");
  await expect.poll(() => [...first.messages, ...second.messages].filter(message => message.type === "write").length,
    { timeout: 4_000 }).toBe(2);
  const jobs = await queue.findJobs(DATABASE_TASK_QUEUE);
  expect(jobs.filter(job => sameWorkspace.includes(job.id) && job.state === "active")).toHaveLength(1);
  expect(jobs.find(job => job.id === otherWorkspace)?.state).toBe("active");
  expect(jobs.filter(job => job.state === "created")).toHaveLength(2);
});

it("rolls back an in-flight transactional result when its job is cancelled", async () => {
  const operationId = await enqueueRequest();
  const worker = startWorker("hold");
  await worker.waitFor("write");
  await queue.cancel(DATABASE_TASK_QUEUE, operationId);
  worker.process.send({ type: "release" });
  worker.process.kill("SIGTERM");
  await worker.exit;
  expect((await jobState(operationId))?.state).toBe("cancelled");
  expect((await client.query("SELECT * FROM queue_test_effects")).rows).toEqual([]);
});