/**
 * RegLayer CLI — HTTP Client
 *
 * Shared HTTP client for all CLI commands. Handles auth, streaming,
 * error formatting, and config loading.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

// ── ANSI Colors (no chalk dependency) ─────────────────────────────────────────

export const c = {
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  blue: (s: string) => `\x1b[34m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

// ── Config ────────────────────────────────────────────────────────────────────

interface CLIConfig {
  apiKey?: string;
  baseUrl?: string;
}

const CONFIG_DIR = join(homedir(), ".reglayer");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export function loadConfig(): CLIConfig {
  try {
    if (existsSync(CONFIG_FILE)) {
      return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
    }
  } catch { /* ignore */ }
  return {};
}

export function saveConfig(config: CLIConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// ── API Client ────────────────────────────────────────────────────────────────

export class APIClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(opts?: { apiKey?: string; baseUrl?: string }) {
    const config = loadConfig();
    this.apiKey = opts?.apiKey ?? process.env.REGLAYER_API_KEY ?? config.apiKey ?? "";
    this.baseUrl = opts?.baseUrl ?? process.env.REGLAYER_URL ?? config.baseUrl ?? "https://reglayer.app";

    if (!this.apiKey) {
      console.error(c.red("Error: No API key configured."));
      console.error(c.dim("Set REGLAYER_API_KEY env var, use --api-key flag, or run: reglayer config set-key <key>"));
      process.exit(1);
    }
  }

  private headers(): Record<string, string> {
    return {
      "Authorization": `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "reglayer-cli/1.0.0",
    };
  }

  /** Standard JSON request */
  async request<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      method,
      headers: this.headers(),
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
      throw new Error(err.error ?? `HTTP ${res.status}`);
    }

    return res.json() as Promise<T>;
  }

  /** Streaming request — yields text chunks to stdout */
  async stream(path: string, body: unknown): Promise<void> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
      throw new Error(err.error ?? `HTTP ${res.status}`);
    }

    if (!res.body) {
      const text = await res.text();
      process.stdout.write(text);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      process.stdout.write(decoder.decode(value, { stream: true }));
    }

    process.stdout.write("\n");
  }
}
