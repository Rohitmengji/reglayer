import { createJobQueue, workDatabaseTasks } from "../../src/lib/jobs/queue.ts";

const connectionString = process.env.REGLAYER_TEST_DATABASE_URL;
if (!connectionString || !process.send) throw new Error("Only run this worker from the isolated integration suite.");
const target = new URL(connectionString);
if (target.hostname !== "127.0.0.1" || target.pathname !== "/reglayer_test" || target.search) {
  throw new Error("The test worker requires the disposable loopback database.");
}
const mode = process.argv[2];
if (!["hold", "complete", "fail"].includes(mode)) throw new Error("Invalid test worker mode");

const queue = createJobQueue(connectionString, () => {
  process.send?.({ type: "error" });
  process.exitCode = 1;
}, { supervisionIntervalSeconds: 1 });
let stopping;
function stop() {
  stopping ??= queue.stop({ graceful: true, timeout: 10_000 }).then(() => {
    if (process.connected) process.disconnect();
  });
  return stopping;
}
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
process.once("disconnect", stop);

try {
  await queue.start();
  await workDatabaseTasks(queue, async (task, transaction, signal) => {
    signal.throwIfAborted();
    await transaction.executeSql(
      "INSERT INTO queue_test_effects (id, workspace_id) VALUES ($1, $2)",
      [task.operationId, task.workspaceId],
    );
    process.send?.({ type: "write", operationId: task.operationId });
    if (mode === "hold") await new Promise(resolve => {
      process.once("message", () => resolve());
    });
    if (mode === "fail") throw new Error("Intentional integration failure");
    signal.throwIfAborted();
  });
  process.send?.({ type: "ready" });
} catch {
  process.send?.({ type: "error" });
  process.exitCode = 1;
  await stop();
}