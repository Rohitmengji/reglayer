/** reglayer chat "question" — Streaming AI chat */
import { APIClient, c } from "../client.js";

export async function chatCommand(args: string[], opts: { apiKey?: string; baseUrl?: string }) {
  const message = args.filter((a) => !a.startsWith("--")).join(" ");
  if (!message) {
    console.error(c.red("Usage: reglayer chat <message>"));
    process.exit(1);
  }

  const client = new APIClient(opts);
  console.error(c.dim("Thinking..."));
  await client.stream("/api/ai/chat", {
    messages: [{ role: "user", content: message }],
  });
}
