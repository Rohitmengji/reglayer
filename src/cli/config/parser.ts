/**
 * RegLayer Config Parser — reads reglayer.config.yaml
 *
 * Uses a simple line-by-line YAML parser (no js-yaml dependency).
 * Supports the subset needed: top-level keys, arrays of objects, scalars.
 */

import { readFileSync, existsSync } from "fs";
import type { RegLayerConfig, AgentConfig, ScheduleConfig, KnowledgeConfig } from "./schema.js";

/**
 * Parse a reglayer.config.yaml file.
 * Uses JSON if .json extension, otherwise basic YAML parsing.
 */
export function parseConfigFile(path: string): RegLayerConfig {
  if (!existsSync(path)) {
    throw new Error(`Config file not found: ${path}`);
  }

  const content = readFileSync(path, "utf-8");

  if (path.endsWith(".json")) {
    return JSON.parse(content) as RegLayerConfig;
  }

  return parseSimpleYaml(content);
}

/**
 * Minimal YAML parser for RegLayer config format.
 * Handles: scalars, arrays of objects, multi-line strings (|).
 * Does NOT handle: anchors, aliases, flow style, complex nesting.
 */
export function parseSimpleYaml(content: string): RegLayerConfig {
  const result: Record<string, unknown> = {};
  const lines = content.split("\n");
  let currentSection = "";
  let items: Record<string, unknown>[] = [];
  let currentItem: Record<string, unknown> | null = null;

  function flushSection() {
    if (currentItem) items.push(currentItem);
    if (currentSection && items.length > 0) {
      result[currentSection] = items;
    }
    items = [];
    currentItem = null;
  }

  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const indent = line.length - line.trimStart().length;

    // Top-level key (no indent)
    if (indent === 0 && trimmed.includes(":")) {
      flushSection();
      const colonIdx = trimmed.indexOf(":");
      const key = trimmed.slice(0, colonIdx).trim();
      const value = trimmed.slice(colonIdx + 1).trim();

      if (value) {
        result[key] = parseScalar(value);
        currentSection = "";
      } else {
        currentSection = key;
      }
      continue;
    }

    // Array item start (  - key: value)
    if (trimmed.startsWith("- ") || (indent >= 2 && line.trimStart().startsWith("- "))) {
      if (currentItem) items.push(currentItem);
      currentItem = {};
      const itemContent = line.trimStart().slice(2).trim();
      if (itemContent.includes(":")) {
        const ci = itemContent.indexOf(":");
        const k = itemContent.slice(0, ci).trim();
        const v = itemContent.slice(ci + 1).trim();
        if (v) currentItem[k] = parseScalar(v);
      }
      continue;
    }

    // Object property within array item
    if (indent >= 4 && currentItem && trimmed.includes(":")) {
      const ci = trimmed.indexOf(":");
      const k = trimmed.slice(0, ci).trim();
      const v = trimmed.slice(ci + 1).trim();
      if (v) currentItem[k] = parseScalar(v);
    }
  }

  flushSection();
  return result as unknown as RegLayerConfig;
}

function parseScalar(value: string): unknown {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (/^\d+$/.test(value)) return parseInt(value, 10);
  if (/^\d+\.\d+$/.test(value)) return parseFloat(value);
  // Array syntax: [a, b, c]
  if (value.startsWith("[") && value.endsWith("]")) {
    return value.slice(1, -1).split(",").map((s) => s.trim()).filter(Boolean);
  }
  // Strip quotes
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}
