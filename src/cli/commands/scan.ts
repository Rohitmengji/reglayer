/** reglayer scan <url> — Run accessibility scan */
import { APIClient, c } from "../client.js";

export async function scanCommand(args: string[], opts: { apiKey?: string; baseUrl?: string }) {
  const url = args.find((a) => !a.startsWith("--"));
  if (!url) {
    console.error(c.red("Usage: reglayer scan <url>"));
    process.exit(1);
  }

  const client = new APIClient(opts);
  console.error(c.dim(`Scanning ${url}...`));

  const result = await client.request<{
    scan: { id: string; url: string; summary: { score: number; totalViolations: number; critical: number; serious: number } };
  }>("POST", "/api/scan", { url });

  const s = result.scan;
  const scoreColor = s.summary.score >= 90 ? c.green : s.summary.score >= 70 ? c.yellow : c.red;

  console.log(`\n${c.bold("Scan Complete")}`);
  console.log(`  URL:        ${s.url}`);
  console.log(`  Score:      ${scoreColor(String(s.summary.score))}`);
  console.log(`  Violations: ${s.summary.totalViolations} (${c.red(String(s.summary.critical))} critical, ${c.yellow(String(s.summary.serious))} serious)`);
  console.log(`  Scan ID:    ${c.dim(s.id)}`);
}
