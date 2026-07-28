/**
 * RegLayer TypeScript SDK
 *
 * Official client library for the RegLayer API.
 * Provides typed methods for all v1 API endpoints.
 *
 * USAGE:
 *   import { RegLayer } from '@reglayer/sdk';
 *   const client = new RegLayer({ apiKey: 'rl_...' });
 *   const scan = await client.scans.create({ url: 'https://example.com' });
 *   const violations = await client.violations.list({ scanId: scan.id });
 *
 * INSPIRED BY:
 *   - Stripe SDK (clean, typed, ergonomic)
 *   - OpenAI SDK (streaming support, typed responses)
 *   - Vercel SDK (minimal, focused)
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RegLayerConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
}

export interface Scan {
  id: string;
  url: string;
  score: number | null;
  totalViolations: number;
  critical: number;
  serious: number;
  moderate: number;
  minor: number;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  createdAt: string;
}

export interface Violation {
  id: string;
  scanId: string;
  ruleId: string;
  impact: "critical" | "serious" | "moderate" | "minor";
  description: string;
  help: string;
  helpUrl: string;
  wcagCriteria: string[];
  selector: string;
  html: string;
  status: "open" | "fixed" | "dismissed" | "false_positive";
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  message: string;
  usage?: { inputTokens: number; outputTokens: number; cost: number };
}

export interface EmbedResponse {
  embeddings: number[][];
  usage: { tokens: number; cost: number };
}

export interface SearchResult {
  id: string;
  content: string;
  similarity: number;
  metadata: Record<string, unknown>;
}

export interface AgentRunResponse {
  runId: string;
  status: "completed" | "failed";
  result: string;
  durationMs: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// ── SDK Client ────────────────────────────────────────────────────────────────

export class RegLayer {
  private apiKey: string;
  private baseUrl: string;
  private timeout: number;

  public readonly scans: ScansAPI;
  public readonly violations: ViolationsAPI;
  public readonly chat: ChatAPI;
  public readonly agents: AgentsAPI;
  public readonly knowledge: KnowledgeAPI;
  public readonly embed: EmbedAPI;

  constructor(config: RegLayerConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? "https://reglayer.vercel.app").replace(/\/$/, "");
    this.timeout = config.timeout ?? 30000;

    this.scans = new ScansAPI(this);
    this.violations = new ViolationsAPI(this);
    this.chat = new ChatAPI(this);
    this.agents = new AgentsAPI(this);
    this.knowledge = new KnowledgeAPI(this);
    this.embed = new EmbedAPI(this);
  }

  /** Internal fetch wrapper with auth + error handling */
  async _request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}/api/v1${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": "reglayer-sdk/1.0.0",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: res.statusText }));
      throw new RegLayerError(
        (error as { error?: string }).error ?? `HTTP ${res.status}`,
        res.status,
        error,
      );
    }

    return res.json() as Promise<T>;
  }

  /** Stream a response (for chat) */
  async _stream(path: string, body: unknown): Promise<ReadableStream<string>> {
    const url = `${this.baseUrl}/api/v1${path}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": "reglayer-sdk/1.0.0",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!res.ok || !res.body) {
      const error = await res.json().catch(() => ({ error: res.statusText }));
      throw new RegLayerError(
        (error as { error?: string }).error ?? `HTTP ${res.status}`,
        res.status,
        error,
      );
    }

    return res.body.pipeThrough(new TextDecoderStream()) as unknown as ReadableStream<string>;
  }
}

// ── Error Class ───────────────────────────────────────────────────────────────

export class RegLayerError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "RegLayerError";
    this.status = status;
    this.body = body;
  }
}

// ── Resource APIs ─────────────────────────────────────────────────────────────

class ScansAPI {
  constructor(private client: RegLayer) {}

  /** Create a new scan */
  async create(params: { url: string; waitForCompletion?: boolean }): Promise<Scan> {
    return this.client._request<Scan>("POST", "/scans", params);
  }

  /** Get a scan by ID */
  async get(id: string): Promise<Scan> {
    return this.client._request<Scan>("GET", `/scans/${id}`);
  }

  /** List scans */
  async list(params?: { limit?: number; page?: number }): Promise<PaginatedResponse<Scan>> {
    const query = new URLSearchParams();
    if (params?.limit) query.set("limit", String(params.limit));
    if (params?.page) query.set("page", String(params.page));
    return this.client._request("GET", `/scans?${query.toString()}`);
  }
}

class ViolationsAPI {
  constructor(private client: RegLayer) {}

  /** List violations for a scan */
  async list(params: { scanId: string; impact?: string; limit?: number }): Promise<PaginatedResponse<Violation>> {
    const query = new URLSearchParams({ scanId: params.scanId });
    if (params.impact) query.set("impact", params.impact);
    if (params.limit) query.set("limit", String(params.limit));
    return this.client._request("GET", `/violations?${query.toString()}`);
  }

  /** Get a specific violation */
  async get(id: string): Promise<Violation> {
    return this.client._request<Violation>("GET", `/violations/${id}`);
  }
}

class ChatAPI {
  constructor(private client: RegLayer) {}

  /** Send a chat message and get a response */
  async send(params: { messages: ChatMessage[]; stream?: false }): Promise<ChatResponse>;
  async send(params: { messages: ChatMessage[]; stream: true }): Promise<ReadableStream<string>>;
  async send(params: { messages: ChatMessage[]; stream?: boolean }): Promise<ChatResponse | ReadableStream<string>> {
    if (params.stream) {
      return this.client._stream("/chat", { messages: params.messages });
    }
    return this.client._request<ChatResponse>("POST", "/chat", { messages: params.messages });
  }
}

class AgentsAPI {
  constructor(private client: RegLayer) {}

  /** Run an agent */
  async run(params: { agentSlug: string; task: string }): Promise<AgentRunResponse> {
    return this.client._request<AgentRunResponse>("POST", "/agents/run", params);
  }

  /** List available agents */
  async list(): Promise<{ agents: Array<{ slug: string; name: string; description: string }> }> {
    return this.client._request("GET", "/agents");
  }
}

class KnowledgeAPI {
  constructor(private client: RegLayer) {}

  /** Upload a document to the knowledge base */
  async upload(params: { title: string; content: string }): Promise<{ id: string; chunkCount: number }> {
    return this.client._request("POST", "/knowledge", params);
  }

  /** Search the knowledge base */
  async search(params: { query: string; limit?: number }): Promise<{ results: SearchResult[] }> {
    return this.client._request("POST", "/knowledge/search", params);
  }
}

class EmbedAPI {
  constructor(private client: RegLayer) {}

  /** Generate embeddings for text */
  async create(params: { input: string | string[] }): Promise<EmbedResponse> {
    return this.client._request<EmbedResponse>("POST", "/embed", params);
  }
}

// ── Default Export ────────────────────────────────────────────────────────────

export default RegLayer;
