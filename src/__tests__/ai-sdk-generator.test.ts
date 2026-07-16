import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { parseOpenAPISpec, generateSDK } from "@/lib/ai/sdk/generator";

const MOCK_SPEC = {
  openapi: "3.1.0",
  paths: {
    "/api/scan": { post: { operationId: "createScan", tags: ["Scans"], summary: "Start scan", requestBody: { content: { "application/json": { schema: { type: "object" } } } }, responses: { "200": { description: "OK" } } } },
    "/api/scans": { get: { operationId: "listScans", tags: ["Scans"], summary: "List scans", parameters: [{ name: "limit", in: "query", schema: { type: "integer" } }], responses: { "200": { description: "OK" } } } },
    "/api/gate": { post: { operationId: "runGate", tags: ["CI/CD"], summary: "Run gate", requestBody: { content: { "application/json": { schema: { type: "object" } } } }, responses: { "200": { description: "OK" } } } },
    "/api/search": { query: { operationId: "searchViolations", tags: ["Search"], summary: "Search violations", parameters: [{ name: "q", in: "query", schema: { type: "string" } }], responses: { "200": { description: "OK" } } } },
  },
};

describe("SDK Generator", () => {
  it("parses operations including query method", () => {
    const ops = parseOpenAPISpec(MOCK_SPEC);
    expect(ops).toHaveLength(4);
    expect(ops.map((o) => o.operationId).sort()).toEqual(["createScan", "listScans", "runGate", "searchViolations"]);
    expect(ops.find((o) => o.operationId === "searchViolations")?.method).toBe("query");
  });

  it("detects request body", () => {
    const ops = parseOpenAPISpec(MOCK_SPEC);
    expect(ops.find((o) => o.operationId === "createScan")?.hasBody).toBe(true);
    expect(ops.find((o) => o.operationId === "listScans")?.hasBody).toBe(false);
  });

  it("extracts query parameters", () => {
    const ops = parseOpenAPISpec(MOCK_SPEC);
    expect(ops.find((o) => o.operationId === "listScans")?.parameters).toHaveLength(1);
  });

  it("handles empty spec", () => { expect(parseOpenAPISpec({})).toHaveLength(0); });

  it("generates TypeScript SDK", () => {
    const sdk = generateSDK(MOCK_SPEC, { language: "typescript" });
    expect(sdk.files.some((f) => f.content.includes("createScan"))).toBe(true);
    expect(sdk.files.some((f) => f.content.includes("searchViolations"))).toBe(true);
    expect(sdk.files.some((f) => f.content.includes("RegLayerError"))).toBe(true);
    expect(sdk.files.some((f) => f.content.includes("429"))).toBe(true);
  });

  it("generates Python SDK with snake_case", () => {
    const sdk = generateSDK(MOCK_SPEC, { language: "python" });
    expect(sdk.files.some((f) => f.content.includes("create_scan"))).toBe(true);
    expect(sdk.files.some((f) => f.content.includes("search_violations"))).toBe(true);
  });

  it("generates Go SDK with PascalCase", () => {
    const sdk = generateSDK(MOCK_SPEC, { language: "go" });
    expect(sdk.files.some((f) => f.content.includes("CreateScan"))).toBe(true);
    expect(sdk.files.some((f) => f.content.includes("SearchViolations"))).toBe(true);
  });

  it("generates Java SDK", () => {
    const sdk = generateSDK(MOCK_SPEC, { language: "java" });
    expect(sdk.files.some((f) => f.path.endsWith(".java"))).toBe(true);
    expect(sdk.files.some((f) => f.content.includes("createScan"))).toBe(true);
  });

  it("respects custom package name", () => {
    const sdk = generateSDK(MOCK_SPEC, { language: "typescript", packageName: "@acme/a11y" });
    expect(sdk.packageName).toBe("@acme/a11y");
  });
});
