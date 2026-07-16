/** reglayer agents list | run <slug> <task> */
import { APIClient, c } from "../client.js";

export async function agentsCommand(args: string[], opts: { apiKey?: string; baseUrl?: string }) {
  const sub = args[0];

  if (sub === "list") {
    const client = new APIClient(opts);
    const result = await client.request<{ agents: { slug: string; name: string; description: string; category: string }[] }>("GET", "/api/ai/agents");

    console.log(`\n${c.bold("Available Agents")}\n`);
    for (const agent of result.agents) {
      console.log(`  ${c.cyan(agent.slug.padEnd(25))} ${agent.name}`);
      console.log(`  ${" ".repeat(25)} ${c.dim(agent.description)}`);
      console.log();
    }
    return;
  }

  if (sub === "run") {
    const slug = args[1];
    const task = args.slice(2).filter((a) => !a.startsWith("--")).join(" ");

    if (!slug || !task) {
      console.error(c.red("Usage: reglayer agents run <slug> <task>"));
      process.exit(1);
    }

    const client = new APIClient(opts);
    console.error(c.dim(`Running agent ${slug}...`));

    const result = await client.request<{
      conversation: { messages: { role: string; content: string; fromAgentSlug: string | null }[] };
    }>("POST", "/api/ai/agents/run", { agentSlug: slug, task });

    const agentMsgs = result.conversation.messages.filter((m) => m.role === "AGENT");
    for (const msg of agentMsgs) {
      if (msg.fromAgentSlug) console.log(c.cyan(`[${msg.fromAgentSlug}]`));
      console.log(msg.content);
      console.log();
    }
    return;
  }

  console.error(c.red("Usage: reglayer agents list | run <slug> <task>"));
  process.exit(1);
}
