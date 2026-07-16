/**
 * RegLayer — SDK Generator
 *
 * Auto-generates typed API client libraries from the OpenAPI specification.
 * Supports TypeScript, Python, Go, and Java.
 *
 * WHY: Developers integrating RegLayer's API shouldn't write HTTP calls manually.
 * A typed SDK with autocomplete, error handling, and auth built-in reduces
 * integration time from hours to minutes.
 *
 * HOW IT WORKS:
 *   1. Reads the OpenAPI 3.1 spec from /api/openapi
 *   2. Extracts operations, schemas, and parameters
 *   3. Generates idiomatic client code per language
 *   4. Includes auth, error handling, rate limit retry, and types
 *
 * INSPIRED BY:
 *   - Stripe SDK (gold standard for developer experience)
 *   - OpenAI SDK (typed client from OpenAPI spec)
 *   - Vercel AI SDK (TypeScript-first with streaming)
 *   - Twilio SDK (multi-language auto-generated)
 */

import "server-only";

// ── Types ─────────────────────────────────────────────────────────────────────

export type SDKLanguage = "typescript" | "python" | "go" | "java";

export interface SDKConfig {
  language: SDKLanguage;
  packageName?: string;
  version?: string;
  baseUrl?: string;
}

export interface GeneratedSDK {
  language: SDKLanguage;
  files: SDKFile[];
  packageName: string;
  version: string;
}

export interface SDKFile {
  path: string;
  content: string;
}

export interface OpenAPIOperation {
  operationId: string;
  method: string;
  path: string;
  summary: string;
  tags: string[];
  parameters: OpenAPIParam[];
  hasBody: boolean;
}

interface OpenAPIParam {
  name: string;
  location: "query" | "path" | "header";
  required: boolean;
  type: string;
}

// ── OpenAPI Parser ────────────────────────────────────────────────────────────

/**
 * Extract operations from an OpenAPI 3.1 spec.
 */
export function parseOpenAPISpec(spec: Record<string, unknown>): OpenAPIOperation[] {
  const operations: OpenAPIOperation[] = [];
  const paths = (spec.paths ?? {}) as Record<string, Record<string, unknown>>;

  for (const [path, methods] of Object.entries(paths)) {
    for (const [method, def] of Object.entries(methods)) {
      if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;

      const op = def as Record<string, unknown>;
      const rawParams = (op.parameters ?? []) as Record<string, unknown>[];
      const params: OpenAPIParam[] = rawParams.map((p) => ({
        name: p.name as string,
        location: p.in as "query" | "path" | "header",
        required: (p.required as boolean) ?? false,
        type: ((p.schema as Record<string, unknown>)?.type as string) ?? "string",
      }));

      const hasBody = !!op.requestBody;

      operations.push({
        operationId: (op.operationId ?? `${method}${path.replace(/[/{}/]/g, "_")}`) as string,
        method,
        path,
        summary: (op.summary ?? "") as string,
        tags: (op.tags ?? []) as string[],
        parameters: params,
        hasBody,
      });
    }
  }

  return operations;
}

// ── TypeScript Generator ──────────────────────────────────────────────────────

export function generateTypeScript(operations: OpenAPIOperation[], config: SDKConfig): SDKFile[] {
  const pkg = config.packageName ?? "@reglayer/sdk";
  const version = config.version ?? "1.0.0";
  const baseUrl = config.baseUrl ?? "https://reglayer.app";

  const methods = operations.map((op) => {
    const fnName = toCamelCase(op.operationId);
    const queryParams = op.parameters.filter((p) => p.location === "query");
    const paramParts: string[] = [];
    if (op.hasBody) paramParts.push("body: Record<string, unknown>");
    for (const p of queryParams) {
      paramParts.push(`${p.name}${p.required ? "" : "?"}: ${tsType(p.type)}`);
    }
    const paramStr = paramParts.length > 0 ? `params: { ${paramParts.join("; ")} }` : "";

    const queryBuild = queryParams.length > 0
      ? `\n    const query = new URLSearchParams();\n    ${queryParams.map((p) => `if (params.${p.name} !== undefined) query.set("${p.name}", String(params.${p.name}));`).join("\n    ")}\n    const qs = query.toString() ? \`?\${query}\` : "";`
      : '\n    const qs = "";';

    const fetchBody = op.hasBody ? `, body: JSON.stringify(params.body)` : "";
    const fetchMethod = op.method === "get" ? "" : `, method: "${op.method.toUpperCase()}"`;

    return `  /** ${op.summary} */
  async ${fnName}(${paramStr}): Promise<unknown> {${queryBuild}
    return this.request(\`${op.path}\${qs}\`, { headers: this.headers()${fetchMethod}${fetchBody} });
  }`;
  });

  const client = `/**
 * RegLayer TypeScript SDK v${version} — Auto-generated from OpenAPI spec
 *
 * Usage:
 *   import { RegLayerClient } from "${pkg}";
 *   const client = new RegLayerClient("rl_your_api_key");
 *   const scan = await client.createScan({ body: { url: "https://example.com" } });
 */

export class RegLayerClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, opts?: { baseUrl?: string }) {
    this.apiKey = apiKey;
    this.baseUrl = opts?.baseUrl ?? "${baseUrl}";
  }

  private headers(): Record<string, string> {
    return {
      "Authorization": \`Bearer \${this.apiKey}\`,
      "Content-Type": "application/json",
      "User-Agent": "${pkg}/${version}",
    };
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    const res = await fetch(\`\${this.baseUrl}\${path}\`, init);

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("Retry-After") ?? "5", 10);
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      return this.request(path, init);
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as Record<string, string>;
      throw new RegLayerError(res.status, body.error ?? res.statusText);
    }

    return res.json();
  }

${methods.join("\n\n")}
}

export class RegLayerError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "RegLayerError";
    this.status = status;
  }
}
`;

  return [
    { path: "src/index.ts", content: client },
    { path: "package.json", content: JSON.stringify({ name: pkg, version, main: "dist/index.js", types: "dist/index.d.ts", license: "MIT" }, null, 2) },
  ];
}

// ── Python Generator ──────────────────────────────────────────────────────────

export function generatePython(operations: OpenAPIOperation[], config: SDKConfig): SDKFile[] {
  const pkg = config.packageName ?? "reglayer";
  const version = config.version ?? "1.0.0";
  const baseUrl = config.baseUrl ?? "https://reglayer.app";

  const methods = operations.map((op) => {
    const fnName = toSnakeCase(op.operationId);
    const pyParams = ["self"];
    if (op.hasBody) pyParams.push("body: dict");
    for (const p of op.parameters.filter((p) => p.location === "query")) {
      pyParams.push(`${p.name}: ${pyType(p.type)} = None`);
    }

    const queryParams = op.parameters.filter((p) => p.location === "query");
    const queryBuild = queryParams.length > 0
      ? `\n        params = {${queryParams.map((p) => `"${p.name}": ${p.name}`).join(", ")}}\n        params = {k: v for k, v in params.items() if v is not None}`
      : "\n        params = {}";

    const bodyArg = op.hasBody ? ", json=body" : "";

    return `    def ${fnName}(${pyParams.join(", ")}) -> dict:
        """${op.summary}"""${queryBuild}
        return self._request("${op.method.toUpperCase()}", "${op.path}", params=params${bodyArg})`;
  });

  const client = `"""
RegLayer Python SDK v${version} — Auto-generated from OpenAPI spec

Usage:
    from ${pkg} import RegLayerClient
    client = RegLayerClient("rl_your_api_key")
    scan = client.create_scan(body={"url": "https://example.com"})
"""

import requests
import time


class RegLayerError(Exception):
    def __init__(self, status: int, message: str):
        self.status = status
        self.message = message
        super().__init__(f"[{status}] {message}")


class RegLayerClient:
    def __init__(self, api_key: str, base_url: str = "${baseUrl}"):
        self.api_key = api_key
        self.base_url = base_url
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "${pkg}/${version}",
        })

    def _request(self, method: str, path: str, params=None, json=None) -> dict:
        url = f"{self.base_url}{path}"
        resp = self.session.request(method, url, params=params, json=json)
        if resp.status_code == 429:
            retry = int(resp.headers.get("Retry-After", "5"))
            time.sleep(retry)
            return self._request(method, path, params=params, json=json)
        if not resp.ok:
            body = resp.json() if "json" in resp.headers.get("content-type", "") else {}
            raise RegLayerError(resp.status_code, body.get("error", resp.reason))
        return resp.json()

${methods.join("\n\n")}
`;

  return [
    { path: `${pkg}/client.py`, content: client },
    { path: `${pkg}/__init__.py`, content: `from .client import RegLayerClient, RegLayerError\n\n__version__ = "${version}"\n` },
    { path: "setup.py", content: `from setuptools import setup\nsetup(name="${pkg}", version="${version}", packages=["${pkg}"], install_requires=["requests>=2.28"])\n` },
  ];
}

// ── Go Generator ──────────────────────────────────────────────────────────────

export function generateGo(operations: OpenAPIOperation[], config: SDKConfig): SDKFile[] {
  const pkg = config.packageName ?? "reglayer";
  const version = config.version ?? "1.0.0";
  const baseUrl = config.baseUrl ?? "https://reglayer.app";

  const methods = operations.map((op) => {
    const fnName = toPascalCase(op.operationId);
    const bodyParam = op.hasBody ? ", body map[string]interface{}" : "";
    const reqBody = op.hasBody
      ? `\n\tjsonBody, _ := json.Marshal(body)\n\treq, err := http.NewRequest("${op.method.toUpperCase()}", c.baseURL+"${op.path}", bytes.NewReader(jsonBody))`
      : `\n\treq, err := http.NewRequest("${op.method.toUpperCase()}", c.baseURL+"${op.path}", nil)`;

    return `// ${fnName} — ${op.summary}
func (c *Client) ${fnName}(ctx context.Context${bodyParam}) (map[string]interface{}, error) {${reqBody}
\tif err != nil { return nil, err }
\treturn c.do(ctx, req)
}`;
  });

  const client = `// Package ${pkg} — RegLayer Go SDK v${version} (auto-generated)
package ${pkg}

import (
\t"bytes"
\t"context"
\t"encoding/json"
\t"fmt"
\t"io"
\t"net/http"
\t"time"
)

type Client struct {
\tapiKey  string
\tbaseURL string
\thttp    *http.Client
}

type Error struct { Status int; Message string }
func (e *Error) Error() string { return fmt.Sprintf("[%d] %s", e.Status, e.Message) }

func NewClient(apiKey string, opts ...func(*Client)) *Client {
\tc := &Client{apiKey: apiKey, baseURL: "${baseUrl}", http: &http.Client{Timeout: 90 * time.Second}}
\tfor _, o := range opts { o(c) }
\treturn c
}

func WithBaseURL(url string) func(*Client) { return func(c *Client) { c.baseURL = url } }

func (c *Client) do(ctx context.Context, req *http.Request) (map[string]interface{}, error) {
\treq = req.WithContext(ctx)
\treq.Header.Set("Authorization", "Bearer "+c.apiKey)
\treq.Header.Set("Content-Type", "application/json")
\tresp, err := c.http.Do(req)
\tif err != nil { return nil, err }
\tdefer resp.Body.Close()
\tbody, _ := io.ReadAll(resp.Body)
\tif resp.StatusCode >= 400 {
\t\tvar e map[string]string
\t\tjson.Unmarshal(body, &e)
\t\treturn nil, &Error{Status: resp.StatusCode, Message: e["error"]}
\t}
\tvar result map[string]interface{}
\tjson.Unmarshal(body, &result)
\treturn result, nil
}

${methods.join("\n\n")}
`;

  return [
    { path: "client.go", content: client },
    { path: "go.mod", content: `module github.com/reglayer/${pkg}\n\ngo 1.21\n` },
  ];
}

// ── Java Generator ────────────────────────────────────────────────────────────

export function generateJava(operations: OpenAPIOperation[], config: SDKConfig): SDKFile[] {
  const pkg = config.packageName ?? "com.reglayer.sdk";
  const version = config.version ?? "1.0.0";
  const baseUrl = config.baseUrl ?? "https://reglayer.app";
  const pkgPath = pkg.replace(/\./g, "/");

  const methods = operations.map((op) => {
    const fnName = toCamelCase(op.operationId);
    const bodyParam = op.hasBody ? "Map<String, Object> body" : "";
    const bodyArg = op.hasBody ? ", body" : "";

    return `    /** ${op.summary} */
    public Map<String, Object> ${fnName}(${bodyParam}) throws RegLayerException {
        return request("${op.method.toUpperCase()}", "${op.path}"${bodyArg});
    }`;
  });

  const client = `package ${pkg};

import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.Map;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * RegLayer Java SDK v${version} — Auto-generated from OpenAPI spec
 */
public class RegLayerClient {
    private final String apiKey;
    private final String baseUrl;
    private final HttpClient http;
    private final ObjectMapper mapper = new ObjectMapper();

    public RegLayerClient(String apiKey) { this(apiKey, "${baseUrl}"); }
    public RegLayerClient(String apiKey, String baseUrl) {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
        this.http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> request(String method, String path, Map<String, Object>... body) throws RegLayerException {
        try {
            var b = HttpRequest.newBuilder().uri(URI.create(baseUrl + path))
                .header("Authorization", "Bearer " + apiKey)
                .header("Content-Type", "application/json")
                .timeout(Duration.ofSeconds(90));
            if (body.length > 0) b.method(method, HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body[0])));
            else if ("GET".equals(method)) b.GET();
            else b.method(method, HttpRequest.BodyPublishers.noBody());
            var r = http.send(b.build(), HttpResponse.BodyHandlers.ofString());
            if (r.statusCode() >= 400) throw new RegLayerException(r.statusCode(), r.body());
            return mapper.readValue(r.body(), Map.class);
        } catch (RegLayerException e) { throw e; }
        catch (Exception e) { throw new RegLayerException(0, e.getMessage()); }
    }

${methods.join("\n\n")}
}
`;

  const exception = `package ${pkg};

public class RegLayerException extends Exception {
    public final int status;
    public RegLayerException(int status, String message) {
        super("[" + status + "] " + message);
        this.status = status;
    }
}
`;

  return [
    { path: `src/main/java/${pkgPath}/RegLayerClient.java`, content: client },
    { path: `src/main/java/${pkgPath}/RegLayerException.java`, content: exception },
  ];
}

// ── Main Entry Point ──────────────────────────────────────────────────────────

/**
 * Generate an SDK from the OpenAPI specification.
 */
export function generateSDK(spec: Record<string, unknown>, config: SDKConfig): GeneratedSDK {
  const operations = parseOpenAPISpec(spec);
  const generators: Record<SDKLanguage, (ops: OpenAPIOperation[], cfg: SDKConfig) => SDKFile[]> = {
    typescript: generateTypeScript,
    python: generatePython,
    go: generateGo,
    java: generateJava,
  };

  return {
    language: config.language,
    files: generators[config.language](operations, config),
    packageName: config.packageName ?? (config.language === "python" ? "reglayer" : "@reglayer/sdk"),
    version: config.version ?? "1.0.0",
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toCamelCase(s: string): string {
  return s.replace(/[-_](\w)/g, (_, c) => c.toUpperCase());
}

function toSnakeCase(s: string): string {
  return s.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "");
}

function toPascalCase(s: string): string {
  const c = toCamelCase(s);
  return c.charAt(0).toUpperCase() + c.slice(1);
}

function tsType(t: string): string {
  return ({ string: "string", integer: "number", number: "number", boolean: "boolean" } as Record<string, string>)[t] ?? "unknown";
}

function pyType(t: string): string {
  return ({ string: "str", integer: "int", number: "float", boolean: "bool" } as Record<string, string>)[t] ?? "any";
}
