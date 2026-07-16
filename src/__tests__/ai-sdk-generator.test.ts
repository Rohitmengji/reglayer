/**
 * Tests for SDK Generator
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  parseOpenAPISpec,
  generateTypeScript,
  generatePython,
  generateGo,
  generateJava,
  generateSDK,
  type OpenAPIOperation,
} from "@/lib/ai/sdk/generator";

const MOCK_SPEC = {
  openapi: "3.1.0",
  info: { title: "Test API", version: "1.0.0" },
  paths: {
    "/api/scan": {
      post: {
        operationId: "createScan",
        tags: ["Scans"],
        summary: "Start an accessibility scan",
        requestBody: { content: { "application/json": { schema: { type: "object" } } } },
        responses: { "200": { description: "OK" } },
      },
    },
    "/api/scans": {
      get: {
        operationId: "listScans",
        tags: ["Scans"],
        summary: "List all scans",
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer" } },
          { name: "page", in: "query", schema: { type: "integer" } },
        ],
        responses: { "200": { description: "OK" } },
      },
    },
    "/api/gate": {
      post: {
        operationId: "runGate",
        tags: ["CI/CD"],
        summary: "Run CI/CD accessibility gate",
        requestBody: { content: { "application/json": { schema: { type: "object" } } } },
        responses: { "200": { description: "OK" }, "403": { description: "Forbidden" } },
      },
    },
  },
};

describe("SDK Generator", () => {
  describe("parseOpenAPISpec", () => {
    it("extracts operations from spec", () => {
      const ops = parseOpenAPISpec(MOCK_SPEC);
      expect(ops).toHaveLength(3);
      expect(ops.map((o) => o.operationId).sort()).toEqual(["createScan", "listScans", "runGate"]);
    });

    it("detects request body presence", () => {
      const ops = parseOpenAPISpec(MOCK_SPEC);
      expect(ops.find((o) => o.operationId === "createScan")?.hasBody).toBe(true);
      expect(ops.find((o) => o.operationId === "listScans")?.hasBody).toBe(false);
    });

    it("extracts query parameters", () => {
      const ops = parseOpenAPISpec(MOCK_SPEC);
      const listScans = ops.find((o) => o.operationId === "listScans");
      expect(listScans?.parameters).toHaveLength(2);
      expect(listScans?.parameters[0].name).toBe("limit");
    });

    it("extracts method and path", () => {
      const ops = parseOpenAPISpec(MOCK_SPEC);
      const scan = ops.find((o) => o.operationId === "createScan");
      expect(scan?.method).toBe("post");
      expect(scan?.path).toBe("/api/scan");
    });

    it("handles empty spec", () => {
      expect(parseOpenAPISpec({})).toHaveLength(0);
    });
  });

  describe("generateTypeScript", () => {
    it("generates client with all methods", () => {
      const ops = parseOpenAPISpec(MOCK_SPEC);
      const files = generateTypeScript(ops, { language: "typescript" });
      const client = files.find((f) => f.path === "src/index.ts")!;
      expect(client).toBeDefined();
      expect(client.content).toContain("class RegLayerClient");
      expect(client.content).toContain("createScan");
      expect(client.content).toContain("listScans");
      expect(client.content).toContain("runGate");
    });

    it("includes auth header", () => {
      const files = generateTypeScript(parseOpenAPISpec(MOCK_SPEC), { language: "typescript" });
      expect(files[0].content).toContain("Authorization");
      expect(files[0].content).toContain("Bearer");
    });

    it("includes rate limit retry", () => {
      const files = generateTypeScript(parseOpenAPISpec(MOCK_SPEC), { language: "typescript" });
      expect(files[0].content).toContain("429");
      expect(files[0].content).toContain("Retry-After");
    });

    it("includes error class", () => {
      const files = generateTypeScript(parseOpenAPISpec(MOCK_SPEC), { language: "typescript" });
      expect(files[0].content).toContain("RegLayerError");
    });

    it("generates package.json", () => {
      const files = generateTypeScript(parseOpenAPISpec(MOCK_SPEC), { language: "typescript", packageName: "@test/sdk" });
      const pkg = files.find((f) => f.path === "package.json");
      expect(pkg).toBeDefined();
      expect(pkg!.content).toContain("@test/sdk");
    });
  });

  describe("generatePython", () => {
    it("generates Python client", () => {
      const files = generatePython(parseOpenAPISpec(MOCK_SPEC), { language: "python" });
      const client = files.find((f) => f.path.endsWith("client.py"))!;
      expect(client.content).toContain("class RegLayerClient");
      expect(client.content).toContain("create_scan");
      expect(client.content).toContain("list_scans");
    });

    it("uses snake_case method names", () => {
      const files = generatePython(parseOpenAPISpec(MOCK_SPEC), { language: "python" });
      const client = files.find((f) => f.path.endsWith("client.py"))!;
      expect(client.content).toContain("run_gate");
      expect(client.content).not.toContain("runGate");
    });

    it("generates __init__.py", () => {
      const files = generatePython(parseOpenAPISpec(MOCK_SPEC), { language: "python" });
      expect(files.some((f) => f.path.endsWith("__init__.py"))).toBe(true);
    });

    it("generates setup.py", () => {
      const files = generatePython(parseOpenAPISpec(MOCK_SPEC), { language: "python" });
      expect(files.some((f) => f.path === "setup.py")).toBe(true);
    });
  });

  describe("generateGo", () => {
    it("generates Go client", () => {
      const files = generateGo(parseOpenAPISpec(MOCK_SPEC), { language: "go" });
      const client = files.find((f) => f.path === "client.go")!;
      expect(client.content).toContain("type Client struct");
      expect(client.content).toContain("CreateScan");
      expect(client.content).toContain("ListScans");
    });

    it("uses PascalCase method names", () => {
      const files = generateGo(parseOpenAPISpec(MOCK_SPEC), { language: "go" });
      expect(files[0].content).toContain("RunGate");
    });

    it("generates go.mod", () => {
      const files = generateGo(parseOpenAPISpec(MOCK_SPEC), { language: "go" });
      expect(files.some((f) => f.path === "go.mod")).toBe(true);
    });
  });

  describe("generateJava", () => {
    it("generates Java client", () => {
      const files = generateJava(parseOpenAPISpec(MOCK_SPEC), { language: "java" });
      const client = files.find((f) => f.path.endsWith("RegLayerClient.java"))!;
      expect(client.content).toContain("public class RegLayerClient");
      expect(client.content).toContain("createScan");
    });

    it("generates exception class", () => {
      const files = generateJava(parseOpenAPISpec(MOCK_SPEC), { language: "java" });
      expect(files.some((f) => f.path.endsWith("RegLayerException.java"))).toBe(true);
    });
  });

  describe("generateSDK (unified)", () => {
    it("generates TypeScript SDK", () => {
      const sdk = generateSDK(MOCK_SPEC, { language: "typescript" });
      expect(sdk.language).toBe("typescript");
      expect(sdk.files.length).toBeGreaterThan(0);
    });

    it("generates Python SDK", () => {
      const sdk = generateSDK(MOCK_SPEC, { language: "python" });
      expect(sdk.language).toBe("python");
      expect(sdk.packageName).toBe("reglayer");
    });

    it("generates Go SDK", () => {
      const sdk = generateSDK(MOCK_SPEC, { language: "go" });
      expect(sdk.files.some((f) => f.path.endsWith(".go"))).toBe(true);
    });

    it("generates Java SDK", () => {
      const sdk = generateSDK(MOCK_SPEC, { language: "java" });
      expect(sdk.files.some((f) => f.path.endsWith(".java"))).toBe(true);
    });

    it("respects custom package name", () => {
      const sdk = generateSDK(MOCK_SPEC, { language: "typescript", packageName: "@acme/a11y" });
      expect(sdk.packageName).toBe("@acme/a11y");
    });
  });
});
