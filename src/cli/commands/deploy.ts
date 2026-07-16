/** reglayer deploy — Deploy from reglayer.config.yaml */
import { existsSync } from "fs";
import { join } from "path";
import { APIClient, c } from "../client.js";
import { parseConfigFile } from "../config/parser.js";
import { plan, apply, formatPlan } from "../config/reconciler.js";

const CONFIG_NAMES = ["reglayer.config.yaml", "reglayer.config.yml", "reglayer.config.json"];

export async function deployCommand(args: string[], opts: { apiKey?: string; baseUrl?: string }) {
  // Find config file
  let configPath = args.find((a) => !a.startsWith("--"));
  if (!configPath) {
    configPath = CONFIG_NAMES.find((name) => existsSync(join(process.cwd(), name)));
    if (!configPath) {
      console.error(c.red("No config file found. Create reglayer.config.yaml or specify path."));
      process.exit(1);
    }
    configPath = join(process.cwd(), configPath);
  }

  console.log(c.dim(`Loading ${configPath}...`));
  const config = parseConfigFile(configPath);

  const client = new APIClient(opts);

  // Plan
  const actions = await plan(config, client);
  console.log(formatPlan(actions));

  if (actions.length === 0) return;

  // Auto-apply (add --dry-run flag to skip)
  if (args.includes("--dry-run")) {
    console.log(c.dim("Dry run — no changes applied."));
    return;
  }

  console.log(c.bold("Applying...\n"));
  const result = await apply(config, client);
  console.log(`\n${c.green(`✓ ${result.success} deployed`)}${result.failed > 0 ? `, ${c.red(`${result.failed} failed`)}` : ""}`);
}
