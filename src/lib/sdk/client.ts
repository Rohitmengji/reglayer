/**
 * RegLayer TypeScript SDK
 *
 * Usage:
 *   import { RegLayer } from "@reglayer/sdk";
 *   const rl = new RegLayer("rl_your_api_key");
 *   const response = await rl.chat("Is this WCAG compliant?");
 *   const scan = await rl.scan("https://example.com");
 *
 * This SDK wraps the RegLayer v1 API with type-safe methods.
 * All methods return typed responses and handle errors consistently.
 */

export interface RegLayerConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatResponse {
  content: string;
  model: string;
  tokens: number;
  costUsd: number;
  traceId: string;
}

export interface SearchResult {
  chunkId: string;
  content: string;
  similarity: number;
  documentTitle: string;
}

export interface AgentInfo {
  slug: string;
  name: string;
  description: string;
  category: string;
  model: string;
}

export interface AgentRunResult {
  output: string;
  conversationId: string;
  turns: number;
  status: string;
}

export interface WorkflowResult {
  workflowId: string;
  runId: string;
  status: string;
  completedSteps: string[];
  data: Record<string, unknown>;
}

export class RegLayerError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
    this.name = "RegLayerError";
  }
}

export class RegLayer {
  private apiKey: string;
  private baseUrl: string;
  private timeout: number;

  constructor(config: string | RegLayerConfig) {
    if (typeof config === "string") {
      this.apiKey = config;
      this.baseUrl = "https://reglayer.vercel.app";
      this.timeout = 60_000;
    } else {
      this.apiKey = config.apiKey;
      this.baseUrl = config.baseUrl ?? "https://reglayer.vercel.app";
      this.timeout = config.timeout ?? 60_000;
    }
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          ...options.headers,
        },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new RegLayerError(
          body.error ?? `Request failed with status ${res.status}`,
          res.status,
          body.code,
        );
      }

      return res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  // ── Chat ────────────────────────────────────────────────────────────────

  /** Send a chat message and get a complete response. */
  async chat(message: string, options?: { messages?: ChatMessage[] }): Promise<ChatResponse> {
    const messages = options?.messages ?? [{ role: "user" as const, content: message }];
    if (!options?.messages) {
      // Single message mode
    }

    const res = await fetch(`${this.baseUrl}/api/v1/chat`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new RegLayerError(body.error ?? "Chat failed", res.status);
    }

    // Read the streaming response fully
    const text = await res.text();
    const traceId = res.headers.get("x-trace-id") ?? "";
    const model = res.headers.get("x-model") ?? "unknown";
    const tokens = parseInt(res.headers.get("x-tokens") ?? "0", 10);
    const costUsd = parseFloat(res.headers.get("x-cost-usd") ?? "0");

    return { content: text, model, tokens, costUsd, traceId };
  }

  // ── Search ──────────────────────────────────────────────────────────────

  /** Semantic search over the workspace knowledge base. */
  async search(query: string, options?: { limit?: number }): Promise<SearchResult[]> {
    const data = await this.request<{ results: SearchResult[] }>("/api/v1/search", {
      method: "POST",
      body: JSON.stringify({ query, limit: options?.limit ?? 10 }),
    });
    return data.results;
  }

  // ── Agents ──────────────────────────────────────────────────────────────

  /** List available AI agents. */
  async listAgents(category?: string): Promise<AgentInfo[]> {
    const params = category ? `?category=${encodeURIComponent(category)}` : "";
    const data = await this.request<{ agents: AgentInfo[] }>(`/api/v1/agents${params}`);
    return data.agents;
  }

  /** Run an AI agent with a task. */
  async runAgent(agentSlug: string, task: string): Promise<AgentRunResult> {
    return this.request<AgentRunResult>("/api/v1/agents", {
      method: "POST",
      body: JSON.stringify({ agentSlug, task }),
    });
  }

  // ── Workflows ───────────────────────────────────────────────────────────

  /** Execute a workflow. */
  async runWorkflow(workflowId: string, input?: Record<string, unknown>): Promise<WorkflowResult> {
    return this.request<WorkflowResult>("/api/v1/workflow", {
      method: "POST",
      body: JSON.stringify({ workflowId, input }),
    });
  }

  // ── Embeddings ──────────────────────────────────────────────────────────

  /** Generate embeddings for text. */
  async embed(input: string | string[]): Promise<{ embeddings: number[][]; tokens: number }> {
    return this.request("/api/v1/embed", {
      method: "POST",
      body: JSON.stringify({ input }),
    });
  }
}

// Default export for convenience
export default RegLayer;
