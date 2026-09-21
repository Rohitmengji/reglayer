import { execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { devNull, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";

if (process.getuid?.() === 0) throw new Error("Run PostgreSQL tests as a non-root user; this runner will not create OS users.");
const walkthrough = process.argv.length === 3 && process.argv[2] === "--walkthrough";
if (process.argv.length > 2 && !walkthrough) throw new Error("This runner does not accept database URLs or command overrides.");

const root = fileURLToPath(new URL("../", import.meta.url));
const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "reglayer-postgres-"));
const port = await new Promise((resolve, reject) => {
  const reservation = createServer();
  reservation.once("error", reject);
  reservation.listen(0, "127.0.0.1", () => {
    const address = reservation.address();
    reservation.close(error => error ? reject(error) : resolve(address.port));
  });
});
const password = randomBytes(24).toString("hex");
const database = new EmbeddedPostgres({
  databaseDir: path.join(temporaryDirectory, "data"),
  user: "postgres",
  password,
  port,
  authMethod: "scram-sha-256",
  persistent: false,
  createPostgresUser: false,
  postgresFlags: ["-h", "127.0.0.1", "-k", temporaryDirectory],
  onLog: () => {},
  onError: () => {},
});
const connectionString = `postgresql://postgres:${password}@127.0.0.1:${port}/reglayer_test`;
const environment = Object.fromEntries(
  ["PATH", "HOME", "USER", "LOGNAME", "TMPDIR", "LANG", "LC_ALL", "SYSTEMROOT", "CI"].flatMap(
    name => process.env[name] === undefined ? [] : [[name, process.env[name]]]
  )
);
Object.assign(environment, {
  DATABASE_URL: connectionString,
  REGLAYER_TEST_DATABASE_URL: connectionString,
  DOTENV_CONFIG_PATH: devNull,
  NEXTAUTH_SECRET: "postgres-test-only-not-for-deployment",
  NEXTAUTH_URL: "http://localhost:3000",
  NEXT_TELEMETRY_DISABLED: "1",
  REGLAYER_BROWSER_WALKTHROUGH: walkthrough ? "1" : "0",
});

let started = false;
let client;
let child;
const abort = new AbortController();
const interrupt = () => {
  abort.abort();
  child?.kill("SIGTERM");
  process.exitCode = 130;
};
process.once("SIGINT", interrupt);
process.once("SIGTERM", interrupt);

try {
  await database.initialise();
  abort.signal.throwIfAborted();
  await database.start();
  started = true;
  abort.signal.throwIfAborted();
  await database.createDatabase("reglayer_test");
  await promisify(execFile)(process.execPath, [
    path.join(root, "node_modules/prisma/build/index.js"),
    "generate",
  ], { cwd: root, env: environment, maxBuffer: 10 * 1024 * 1024, timeout: 120_000, signal: abort.signal });
  client = new pg.Client({ connectionString });
  await client.connect();
  const { rows } = await client.query("SHOW server_version");
  console.log(`Disposable PostgreSQL ${rows[0].server_version}; crawl table uses generated Prisma model metadata.`);
  await client.end();
  client = undefined;
  abort.signal.throwIfAborted();

  const exitCode = await new Promise((resolve, reject) => {
    child = spawn(process.execPath, [
      path.join(root, "node_modules/vitest/vitest.mjs"), "run", "--config", "vitest.postgres.config.ts",
    ], { cwd: root, env: environment, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", code => resolve(code ?? 1));
  });
  process.exitCode = process.exitCode || exitCode;
} catch (error) {
  console.error(String(error.message ?? error).replaceAll(connectionString, "[test database]"));
  process.exitCode = process.exitCode || 1;
} finally {
  try {
    await client?.end();
    if (started) await database.stop();
    await rm(temporaryDirectory, { recursive: true, force: true });
    console.log("Disposable PostgreSQL stopped and its temporary data removed.");
  } catch {
    console.error("Failed to clean up disposable PostgreSQL.");
    process.exitCode = process.exitCode || 1;
  } finally {
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
    process.exit(process.exitCode || 0);
  }
}