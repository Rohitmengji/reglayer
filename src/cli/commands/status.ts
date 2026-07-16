/** reglayer status — Health check */
import { c } from "../client.js";

export async function statusCommand(opts: { apiKey?: string; baseUrl?: string }) {
  const baseUrl = opts.baseUrl ?? process.env.REGLAYER_URL ?? "https://reglayer.app";

  try {
    const res = await fetch(`${baseUrl}/api/health`);
    if (res.ok) {
      const data = await res.json() as Record<string, unknown>;
      console.log(`${c.green("✓")} RegLayer is ${c.green("healthy")}`);
      console.log(`  URL:     ${baseUrl}`);
      console.log(`  Status:  ${data.status ?? "ok"}`);
      if (data.version) console.log(`  Version: ${data.version}`);
    } else {
      console.log(`${c.red("✗")} RegLayer returned ${res.status}`);
    }
  } catch (err) {
    console.log(`${c.red("✗")} Cannot reach ${baseUrl}`);
    console.log(c.dim(`  ${err instanceof Error ? err.message : "Connection failed"}`));
  }
}
