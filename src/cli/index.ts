#!/usr/bin/env node
/**
 * RegLayer CLI — Entry Point
 *
 * Usage:
 *   reglayer chat "How do I fix color contrast?"
 *   reglayer scan https://example.com
 *   reglayer agents list
 *   reglayer agents run compliance-auditor "Audit our checkout page"
 *   reglayer status
 *   reglayer deploy
 *   reglayer sdk generate typescript
 *   reglayer config set-key rl_abc123
 */

import { parseArgs } from "node:util";
import { c, saveConfig } from "./client.js";

const HELP = `
${c.bold("reglayer")} — AI-native accessibility compliance CLI

${c.bold("Commands:")}
  ${c.cyan("chat")} <message>                    Chat with RegLayer AI (streaming)
  ${c.cyan("scan")} <url>                        Run accessibility scan
  ${c.cyan("agents")} list                       List available agents
  ${c.cyan("agents")} run <slug> <task>           Run an agent
  ${c.cyan("status")}                            Health check
  ${c.cyan("sdk")} generate <language>            Generate SDK (typescript|python|go|java)
  ${c.cyan("deploy")}                            Deploy from reglayer.config.yaml
  ${c.cyan("config")} set-key <api-key>           Save API key
  ${c.cyan("config")} set-url <base-url>          Save base URL

${c.bold("Options:")}
  --api-key <key>                 Override API key
  --base-url <url>                Override base URL
  --help                          Show help

${c.bold("Environment:")}
  REGLAYER_API_KEY                API key (or use --api-key / config set-key)
  REGLAYER_URL                    Base URL (default: https://reglayer.app)

${c.bold("Examples:")}
  ${c.dim("$")} reglayer chat "What WCAG criteria does our site violate?"
  ${c.dim("$")} reglayer scan https://example.com
  ${c.dim("$")} reglayer agents run compliance-auditor "Audit checkout page for ADA"
  ${c.dim("$")} reglayer deploy
`;

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(HELP);
    process.exit(0);
  }

  const command = args[0];
  const subArgs = args.slice(1);

  // Parse global flags
  let apiKey: string | undefined;
  let baseUrl: string | undefined;
  const flagIdx = args.indexOf("--api-key");
  if (flagIdx !== -1 && args[flagIdx + 1]) apiKey = args[flagIdx + 1];
  const urlIdx = args.indexOf("--base-url");
  if (urlIdx !== -1 && args[urlIdx + 1]) baseUrl = args[urlIdx + 1];

  try {
    switch (command) {
      case "chat": {
        const { chatCommand } = await import("./commands/chat.js");
        await chatCommand(subArgs, { apiKey, baseUrl });
        break;
      }
      case "scan": {
        const { scanCommand } = await import("./commands/scan.js");
        await scanCommand(subArgs, { apiKey, baseUrl });
        break;
      }
      case "agents": {
        const { agentsCommand } = await import("./commands/agents.js");
        await agentsCommand(subArgs, { apiKey, baseUrl });
        break;
      }
      case "status": {
        const { statusCommand } = await import("./commands/status.js");
        await statusCommand({ apiKey, baseUrl });
        break;
      }
      case "sdk": {
        const { sdkCommand } = await import("./commands/sdk.js");
        await sdkCommand(subArgs);
        break;
      }
      case "deploy": {
        const { deployCommand } = await import("./commands/deploy.js");
        await deployCommand(subArgs, { apiKey, baseUrl });
        break;
      }
      case "config": {
        handleConfig(subArgs);
        break;
      }
      default:
        console.error(c.red(`Unknown command: ${command}`));
        console.error(c.dim("Run 'reglayer --help' for usage."));
        process.exit(1);
    }
  } catch (err) {
    console.error(c.red(`Error: ${err instanceof Error ? err.message : "Unknown error"}`));
    process.exit(1);
  }
}

function handleConfig(args: string[]) {
  const sub = args[0];
  const value = args[1];

  if (sub === "set-key" && value) {
    saveConfig({ ...loadConfigSafe(), apiKey: value });
    console.log(c.green("✓ API key saved to ~/.reglayer/config.json"));
  } else if (sub === "set-url" && value) {
    saveConfig({ ...loadConfigSafe(), baseUrl: value });
    console.log(c.green(`✓ Base URL set to ${value}`));
  } else {
    console.error(c.red("Usage: reglayer config set-key <key> | set-url <url>"));
  }
}

function loadConfigSafe(): Record<string, string> {
  try {
    const { loadConfig } = require("./client.js");
    return loadConfig();
  } catch {
    return {};
  }
}

main();
