/** reglayer sdk generate <language> — Generate SDK files locally */
import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { c } from "../client.js";

export async function sdkCommand(args: string[]) {
  const sub = args[0];
  if (sub !== "generate") {
    console.error(c.red("Usage: reglayer sdk generate <typescript|python|go|java>"));
    process.exit(1);
  }

  const language = args[1] as "typescript" | "python" | "go" | "java";
  if (!["typescript", "python", "go", "java"].includes(language)) {
    console.error(c.red("Supported languages: typescript, python, go, java"));
    process.exit(1);
  }

  // Fetch OpenAPI spec
  const baseUrl = process.env.REGLAYER_URL ?? "https://reglayer.app";
  console.error(c.dim(`Fetching OpenAPI spec from ${baseUrl}/api/openapi...`));

  const res = await fetch(`${baseUrl}/api/openapi`);
  if (!res.ok) {
    console.error(c.red("Failed to fetch OpenAPI spec"));
    process.exit(1);
  }

  const spec = await res.json() as Record<string, unknown>;

  // Dynamic import to avoid pulling server-only code
  const { generateSDK } = await import("../../lib/ai/sdk/generator.js");
  const sdk = generateSDK(spec, { language });

  // Write files
  const outDir = join(process.cwd(), `reglayer-sdk-${language}`);
  for (const file of sdk.files) {
    const fullPath = join(outDir, file.path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, file.content);
    console.log(`  ${c.green("✓")} ${file.path}`);
  }

  console.log(`\n${c.bold("SDK generated")} → ${c.cyan(outDir)}`);
  console.log(c.dim(`  Package: ${sdk.packageName} v${sdk.version}`));
}
