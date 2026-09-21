import { afterAll, beforeAll, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { mkdtemp, mkdir, copyFile, cp, rm, readFile } from "node:fs/promises";
import { constants, existsSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import bcrypt from "bcryptjs";
import { PDFParse } from "pdf-parse";
import prismaSdk from "@prisma/internals";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { createCrawlSchema } from "./fixtures/crawl-schema";

const connectionString = process.env.REGLAYER_TEST_DATABASE_URL;
if (!connectionString || process.env.REGLAYER_BROWSER_WALKTHROUGH !== "1") throw new Error("Run node scripts/test-postgres.mjs --walkthrough.");
const target = new URL(connectionString);
if (target.hostname !== "127.0.0.1" || target.pathname !== "/reglayer_test" || target.search) throw new Error("Disposable database required.");
const root = process.cwd();
const client = new Client({ connectionString });
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 3 }) });
const artifacts = path.join(root, "visual-audit/real-user-walkthrough");
let temporary = "";
let app: ChildProcess | undefined;
let browser: Browser | undefined;
let origin: string;
let logs = "";
const testEmail = "walkthrough@example.test";
const testPassword = "Local-Walkthrough-Only-2026";

beforeAll(async () => {
  await client.connect();
  const { datamodel } = await prismaSdk.getDMMF({ datamodel: await readFile(path.join(root, "prisma/schema.prisma"), "utf8") });
  await createCrawlSchema(client, datamodel.models.map(model => model.name));
  const user = await prisma.user.create({ data: { name: "Walkthrough Customer", email: testEmail, passwordHash: await bcrypt.hash(testPassword, 10), plan: "ENTERPRISE" } });
  const workspace = await prisma.workspace.create({ data: { name: "Isolated Customer", slug: "browser-walkthrough", plan: "ENTERPRISE" } });
  await prisma.workspaceMember.create({ data: { userId: user.id, workspaceId: workspace.id, role: "OWNER" } });
  const viewer = await prisma.user.create({ data: { name: "Read Only Customer", email: "viewer@example.test", passwordHash: await bcrypt.hash(testPassword, 10), plan: "ENTERPRISE" } });
  await prisma.workspaceMember.create({ data: { userId: viewer.id, workspaceId: workspace.id, role: "VIEWER" } });
  const otherWorkspace = await prisma.workspace.create({ data: { name: "Secondary Review", slug: "browser-other-tenant", plan: "ENTERPRISE" } });
  const outsider = await prisma.user.create({ data: { name: "Separate Customer", email: "outsider@example.test", passwordHash: await bcrypt.hash(testPassword, 10), plan: "ENTERPRISE" } });
  await prisma.workspaceMember.create({ data: { userId: outsider.id, workspaceId: otherWorkspace.id, role: "OWNER" } });
  await prisma.workspaceMember.create({ data: { userId: user.id, workspaceId: otherWorkspace.id, role: "VIEWER" } });
  const port = await new Promise<number>((resolve, reject) => {
    const server = createServer(); server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("No local port"));
      server.close(error => error ? reject(error) : resolve(address.port));
    });
  });
  origin = `http://127.0.0.1:${port}`;
  temporary = await mkdtemp(path.join(tmpdir(), "reglayer-user-test-"));
  const files = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" }).split("\0").filter(Boolean);
  for (const file of files) {
    if (path.basename(file).startsWith(".env") || !existsSync(path.join(root, file))) continue;
    await mkdir(path.dirname(path.join(temporary, file)), { recursive: true });
    await copyFile(path.join(root, file), path.join(temporary, file), constants.COPYFILE_FICLONE);
  }
  for (const directory of ["node_modules", "src/generated"]) {
    await cp(path.join(root, directory), path.join(temporary, directory), { recursive: true, mode: constants.COPYFILE_FICLONE, verbatimSymlinks: true });
  }
  await mkdir(artifacts, { recursive: true });
  const env: NodeJS.ProcessEnv = { NODE_ENV: "development" };
  for (const key of ["PATH", "HOME", "TMPDIR", "LANG"]) if (process.env[key]) env[key] = process.env[key];
  Object.assign(env, { DATABASE_URL: connectionString, NEXTAUTH_SECRET: "isolated-browser-walkthrough-not-for-production", NEXTAUTH_URL: origin, NEXT_PUBLIC_APP_URL: origin, NEXT_TELEMETRY_DISABLED: "1", CRAWL_PAGE_CHECKPOINTS_ENABLED: "false", SMTP_HOST: "127.0.0.1", SMTP_PORT: "9", SMTP_USER: "isolated", SMTP_PASS: "isolated", EMAIL_FROM: "noreply@example.test" });
  app = spawn(process.execPath, [path.join(temporary, "node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: temporary, env, stdio: ["ignore", "pipe", "pipe"] });
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Isolated application did not become ready")), 60_000);
    const capture = (chunk: Buffer) => { logs = (logs + chunk.toString()).slice(-16_000); if (logs.includes("Ready in")) { clearTimeout(timeout); resolve(); } };
    app!.stdout!.on("data", capture); app!.stderr!.on("data", capture);
    app!.once("error", error => { clearTimeout(timeout); reject(error); });
    app!.once("exit", () => { clearTimeout(timeout); reject(new Error("Isolated application exited")); });
  });
  browser = await chromium.launch({ headless: true });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  if (app && app.exitCode === null && app.signalCode === null) {
    const exited = new Promise<void>(resolve => app!.once("close", () => resolve()));
    app.kill("SIGTERM");
    await exited;
  }
  await prisma.$disconnect();
  await client.end();
  if (temporary) await rm(temporary, { recursive: true, force: true });
}, 30_000);

it("signs in through the real UI, submits a real scan and verifies the saved result", async () => {
  const context = await browser!.newContext({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: { "x-forwarded-for": "192.0.2.10" } });
  context.setDefaultTimeout(20_000);
  const page = await context.newPage();
  const failedSaves: number[] = [];
  let featureRequests = 0;
  let workspaceRequests = 0;
  page.on("request", request => {
    if (request.method() !== "GET") return;
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/workspace/features") featureRequests++;
    if (pathname === "/api/workspaces") workspaceRequests++;
  });
  page.on("response", response => {
    if (new URL(response.url()).pathname === "/api/ai/conversations" && response.request().method() === "POST" && response.status() >= 400) failedSaves.push(response.status());
  });
  try {
    await page.goto(`${origin}/auth/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.getByRole("button", { name: "Essential Only", exact: true }).click();
    await page.getByRole("textbox", { name: "Email", exact: true }).fill(testEmail);
    await page.getByLabel("Password", { exact: true }).fill(testPassword);
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
    await page.waitForURL("**/dashboard", { timeout: 40_000 });
    await page.getByRole("button", { name: /Legal \/ Compliance/ }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.screenshot({ path: path.join(artifacts, "first-run-onboarding.png") });
    await page.getByRole("button", { name: "Start Using RegLayer", exact: true }).click();
    const input = page.getByRole("textbox", { name: "Website URL to scan for accessibility compliance" });
    await input.waitFor({ timeout: 30_000 });
    await input.fill("https://example.com");
    expect(featureRequests).toBe(1);
    expect(workspaceRequests).toBe(1);
    console.log("VERIFIED: first authenticated dashboard shares one feature request and one workspace-list request.");
    const response = page.waitForResponse(response => new URL(response.url()).pathname === "/api/scan" && response.request().method() === "POST", { timeout: 90_000 });
    void response.catch(() => {});
    await page.getByRole("button", { name: "Scan", exact: true }).click();
    const completed = await response;
    const body = await completed.json();
    expect(completed.status(), JSON.stringify(body)).toBe(200);
    expect(body.scan.status).toBe("completed");
    expect(await prisma.scan.findUnique({ where: { id: body.scan.id } })).toMatchObject({ status: "COMPLETED", url: "https://example.com" });
    await page.waitForURL(`${origin}/scans/${body.scan.id}`, { timeout: 20_000 });
    await page.getByRole("button", { name: "Export PDF", exact: true }).waitFor({ timeout: 20_000 });
    await page.screenshot({ path: path.join(artifacts, "real-scan-results.png"), fullPage: true });
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 30_000 }),
      page.getByRole("button", { name: "Export PDF", exact: true }).click(),
    ]);
    const pdf = path.join(artifacts, "real-scan-report.pdf");
    await download.saveAs(pdf);
    expect((await readFile(pdf)).subarray(0, 5).toString()).toBe("%PDF-");
    const parser = new PDFParse({ data: await readFile(pdf) });
    try {
      const report = await parser.getText();
      expect(report.text).toContain("example.com");
      expect(report.text.replace(/\s+/g, " ")).toContain("Not a WCAG conformance certification");
      expect(report.text).toContain("Automated accessibility score");
      expect(report.text).not.toMatch(/Compliance Score:|Overall Compliance:/);
      console.log("PDF assessment wording:", report.text.split("\n").filter(line => /compliance|conform|manual|certif/i.test(line)).slice(0, 12).join(" | "));
    } finally { await parser.destroy(); }
    await page.getByRole("link", { name: "Fix these issues", exact: true }).click();
    await page.getByRole("button", { name: "Change status", exact: true }).first().click();
    await page.getByRole("option", { name: "In Progress", exact: true }).click();
    await expect.poll(() => prisma.violation.count({ where: { scanId: body.scan.id, status: "IN_PROGRESS" } }), { timeout: 10_000 }).toBe(1);
    await page.getByRole("button", { name: "Open AI Chat", exact: true }).click();
    await page.getByRole("textbox", { name: "Chat message input", exact: true }).fill("What should I fix first in this scan?");
    const aiResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/ai/chat" && response.request().method() === "POST", { timeout: 60_000 });
    void aiResponse.catch(() => {});
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    const ai = await aiResponse;
    expect(ai.status()).toBe(503);
    await expect.poll(() => page.getByRole("complementary", { name: "AI Chat Assistant" }).innerText(), { timeout: 15_000 }).toMatch(/unavailable|failed|error|unable|try again|went wrong|not configured|retry/i);
    await page.screenshot({ path: path.join(artifacts, "real-ai-unavailable.png") });
    await page.getByRole("button", { name: "Close chat panel", exact: true }).click();
    await page.goto(`${origin}/compliance?tab=vpat`);
    await page.getByRole("textbox", { name: "Product Name", exact: true }).fill("Customer Portal");
    await page.getByRole("textbox", { name: "Vendor Name", exact: true }).fill("Example Company");
    const draftResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/compliance/vpat" && response.request().method() === "POST", { timeout: 30_000 });
    void draftResponse.catch(() => {});
    await page.getByRole("button", { name: "Generate draft", exact: true }).click();
    const generated = await draftResponse;
    const draft = await generated.json();
    expect(generated.status(), JSON.stringify(draft)).toBe(200);
    expect(draft.criteria.length).toBeGreaterThan(0);
    await page.getByRole("button", { name: "Download HTML", exact: true }).waitFor();
    await page.screenshot({ path: path.join(artifacts, "real-vpat-draft.png"), fullPage: true });
    const [draftDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download HTML", exact: true }).click(),
    ]);
    const draftFile = path.join(artifacts, "real-vpat-draft.html");
    await draftDownload.saveAs(draftFile);
    expect(await readFile(draftFile, "utf8")).toContain("Customer Portal");
    expect(await readFile(draftFile, "utf8")).toContain("Draft for qualified review.");
    await page.goto(`${origin}/scans/${body.scan.id}`);
    await page.getByRole("button", { name: "Export PDF", exact: true }).waitFor();
    expect(failedSaves).toEqual([]);
    console.log("VERIFIED: real VPAT draft generation/download; conformance labels:", [...new Set(draft.criteria.map((criterion: { conformance: string }) => criterion.conformance))].join(", "));
    console.log(`VERIFIED: real PDF download and violation status write; AI request made, HTTP ${ai.status()}; provider output quality NOT VERIFIED (no model keys configured).`);
    console.log("VERIFIED: real UI login -> actual API/browser scan -> PostgreSQL row -> results UI; no mocked API responses.");
  } catch (error) {
    await page.screenshot({ path: path.join(artifacts, "real-workflow-failure.png"), fullPage: true }).catch(() => {});
    console.error(logs.replaceAll(connectionString, "[isolated database]").slice(-6000));
    throw error;
  } finally { await context.close(); }
}, 180_000);

it("uses a fresh mobile viewer session and rejects a scan without creating data", async () => {
  const context = await browser!.newContext({ viewport: { width: 390, height: 844 }, extraHTTPHeaders: { "x-forwarded-for": "192.0.2.11" } });
  context.setDefaultTimeout(20_000);
  const page = await context.newPage();
  try {
    await page.goto(`${origin}/auth/login`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Essential Only", exact: true }).click();
    await page.getByRole("textbox", { name: "Email", exact: true }).fill("viewer@example.test");
    await page.getByLabel("Password", { exact: true }).fill(testPassword);
    const onboardingResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/onboarding/status" && response.status() === 200);
    void onboardingResponse.catch(() => {});
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
    await page.waitForURL("**/dashboard");
    const onboarding = await (await onboardingResponse).json();
    if (!onboarding.persona && onboarding.totalScans < 3) await page.getByRole("button", { name: "Skip for now", exact: true }).click();
    const count = await prisma.scan.count();
    const restriction = page.getByText("Your role in this workspace does not allow new scans. Ask a workspace owner or administrator for scanning access.", { exact: true });
    await restriction.waitFor({ state: "visible" });
    expect(await page.getByRole("button", { name: "Scan", exact: true }).isDisabled()).toBe(true);
    const response = await context.request.post(`${origin}/api/scan`, { data: { url: "https://example.com" }, headers: { origin } });
    expect(response.status()).toBe(403);
    expect(await prisma.scan.count()).toBe(count);
    await restriction.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(artifacts, "real-viewer-denied-mobile.png") });
    console.log("VERIFIED: fresh mobile VIEWER login; real scan authorization rejects with no new scan.");
  } catch (error) {
    await page.screenshot({ path: path.join(artifacts, "real-viewer-failure.png"), fullPage: true }).catch(() => {});
    throw error;
  } finally { await context.close(); }
}, 60_000);

it("isolates scan evidence, drafts, status writes and activity from a separate tenant", async () => {
  const context = await browser!.newContext({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: { "x-forwarded-for": "192.0.2.12" } });
  context.setDefaultTimeout(20_000);
  const page = await context.newPage();
  try {
    const workspace = await prisma.workspace.findUniqueOrThrow({ where: { slug: "browser-walkthrough" } });
    const scan = await prisma.scan.findFirstOrThrow({ where: { workspaceId: workspace.id } });
    const violation = await prisma.violation.findFirstOrThrow({ where: { scanId: scan.id } });
    await page.goto(`${origin}/auth/login`);
    await page.getByRole("button", { name: "Essential Only", exact: true }).click();
    await page.getByRole("textbox", { name: "Email", exact: true }).fill("outsider@example.test");
    await page.getByLabel("Password", { exact: true }).fill(testPassword);
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
    await page.waitForURL("**/dashboard");
    await page.getByRole("button", { name: "Skip for now", exact: true }).click();

    for (const endpoint of [`/api/scans/${scan.id}`, `/api/scans/${scan.id}/wcag-matrix`, `/api/scans/${scan.id}/manual-summary`, `/api/violations?scanId=${scan.id}`]) {
      const response = await context.request.get(`${origin}${endpoint}`);
      expect([403, 404], endpoint).toContain(response.status());
      expect(await response.text()).not.toContain("Example Domain");
    }
    const draft = await context.request.post(`${origin}/api/compliance/vpat`, { headers: { origin }, data: { scanId: scan.id, productName: "Forbidden draft", vendorName: "Other tenant", standard: "WCAG21-AA", format: "json" } });
    expect([403, 404]).toContain(draft.status());
    const update = await context.request.patch(`${origin}/api/violations/status`, { headers: { origin }, data: { violationId: violation.id, status: "FIXED" } });
    expect([403, 404]).toContain(update.status());
    expect((await prisma.violation.findUniqueOrThrow({ where: { id: violation.id } })).status).toBe(violation.status);
    const switchResponse = await context.request.post(`${origin}/api/workspaces`, { headers: { origin }, data: { workspaceId: workspace.id } });
    expect(switchResponse.status()).toBe(403);
    expect(switchResponse.headers()["set-cookie"]).toBeUndefined();
    const history = await context.request.get(`${origin}/api/scans`);
    expect(history.status()).toBe(200);
    expect((await history.json()).scans).toEqual([]);
    const activity = await context.request.get(`${origin}/api/audit-log`);
    expect(activity.status()).toBe(200);
    expect((await activity.json()).logs).toEqual([]);
    console.log("VERIFIED: separate tenant cannot read scan details, matrix, manual summary or findings; cannot export its VPAT, change its violation, or switch into its workspace; history and activity remain scoped.");
  } finally { await context.close(); }
}, 60_000);

it("changes scan capabilities when the owner switches into a viewer workspace and back", async () => {
  const context = await browser!.newContext({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: { "x-forwarded-for": "192.0.2.13" } });
  context.setDefaultTimeout(20_000);
  const page = await context.newPage();
  try {
    await page.goto(`${origin}/auth/login`);
    await page.getByRole("button", { name: "Essential Only", exact: true }).click();
    await page.getByRole("textbox", { name: "Email", exact: true }).fill(testEmail);
    await page.getByLabel("Password", { exact: true }).fill(testPassword);
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
    await page.waitForURL("**/dashboard");
    await page.getByRole("button", { name: "Workspace: Isolated Customer", exact: true }).click();
    page.once("dialog", dialog => dialog.accept());
    await page.getByText("Secondary Review", { exact: true }).click();
    await page.getByRole("button", { name: "Workspace: Secondary Review", exact: true }).waitFor();
    await page.getByText("Your role in this workspace does not allow new scans. Ask a workspace owner or administrator for scanning access.", { exact: true }).waitFor();
    expect(await page.getByRole("button", { name: "Scan", exact: true }).isDisabled()).toBe(true);
    const denied = await context.request.post(`${origin}/api/scan`, { data: { url: "https://example.com" }, headers: { origin } });
    expect(denied.status()).toBe(403);
    await page.getByRole("button", { name: "Workspace: Secondary Review", exact: true }).click();
    page.once("dialog", dialog => dialog.accept());
    await page.getByText("Isolated Customer", { exact: true }).click();
    await page.getByRole("button", { name: "Workspace: Isolated Customer", exact: true }).waitFor();
    await expect.poll(() => page.getByRole("textbox", { name: "Website URL to scan for accessibility compliance" }).isEnabled()).toBe(true);
    console.log("VERIFIED: real workspace switch changes OWNER to VIEWER capabilities and back; server denies the viewer workspace scan.");
  } finally { await context.close(); }
}, 60_000);