/**
 * RegLayer — OpenAPI 3.1 Specification Endpoint
 *
 * WHY: Developers and tools (Postman, Insomnia, SDK generators) need a machine-readable API spec.
 * WHAT: Serves the complete OpenAPI 3.1 JSON specification for all RegLayer public endpoints.
 * HOW: Returns a static JSON document with proper CORS headers for cross-origin tooling.
 */

import { NextResponse } from "next/server";

const OPENAPI_SPEC = {
  openapi: "3.1.0",
  info: {
    title: "RegLayer API",
    version: "1.0.0",
    description:
      "Enterprise accessibility compliance scanning API. Scan websites for WCAG violations, manage compliance workflows, and integrate into CI/CD pipelines.",
    contact: {
      name: "RegLayer Support",
      url: "https://reglayer.app/contact",
      email: "support@reglayer.app",
    },
    license: {
      name: "Proprietary",
    },
  },
  servers: [
    { url: "https://reglayer.app", description: "Production" },
    { url: "http://localhost:3000", description: "Local Development" },
  ],
  security: [{ BearerAuth: [] }, { SessionCookie: [] }],
  tags: [
    { name: "Scans", description: "Accessibility scan operations" },
    { name: "Crawls", description: "Multi-page site crawl operations" },
    { name: "Violations", description: "Violation management and tracking" },
    { name: "Reports", description: "PDF and data exports" },
    { name: "Auth Configs", description: "Saved authentication configurations for behind-login scanning" },
    { name: "Compliance", description: "Compliance frameworks and VPAT generation" },
    { name: "Integrations", description: "Third-party integrations (GitHub, Slack, etc.)" },
    { name: "Admin", description: "Administrative operations" },
    { name: "Agency", description: "White-label agency management" },
    { name: "Monitoring", description: "Scheduled monitoring and alerts" },
  ],
  paths: {
    "/api/scan": {
      post: {
        operationId: "createScan",
        tags: ["Scans"],
        summary: "Start an accessibility scan",
        description:
          "Initiates an accessibility scan on the specified URL. Returns scan results including violations, score, and compliance data. Supports authenticated scanning via auth configs.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ScanRequest" },
              examples: {
                basic: {
                  summary: "Basic scan",
                  value: { url: "https://example.com" },
                },
                withOptions: {
                  summary: "Scan with WCAG standard and wait",
                  value: {
                    url: "https://example.com/dashboard",
                    options: {
                      standard: "wcag21aa",
                      waitForSelector: "#main-content",
                    },
                  },
                },
                authenticated: {
                  summary: "Scan with saved auth config",
                  value: {
                    url: "https://app.example.com/settings",
                    options: { authConfigId: "cfg_abc123" },
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Scan completed successfully",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ScanResponse" },
              },
            },
          },
          "400": {
            description: "Invalid request (bad URL, SSRF blocked, validation error)",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "401": {
            description: "Authentication required or auth config failed",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "429": {
            description: "Rate limit exceeded (5 scans/minute)",
            headers: {
              "X-RateLimit-Limit": { schema: { type: "integer" }, description: "Requests allowed per window" },
              "X-RateLimit-Remaining": { schema: { type: "integer" }, description: "Requests remaining" },
              "X-RateLimit-Reset": { schema: { type: "integer" }, description: "Unix timestamp when window resets" },
            },
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },
    "/api/scans": {
      get: {
        operationId: "listScans",
        tags: ["Scans"],
        summary: "List all scans",
        description: "Returns paginated list of all scans for the authenticated user's workspace.",
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 20, maximum: 100 } },
          { name: "url", in: "query", schema: { type: "string" }, description: "Filter by scanned URL" },
        ],
        responses: {
          "200": {
            description: "Paginated scan list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    scans: { type: "array", items: { $ref: "#/components/schemas/ScanSummary" } },
                    total: { type: "integer" },
                    page: { type: "integer" },
                    limit: { type: "integer" },
                  },
                },
              },
            },
          },
          "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/scans/{id}": {
      get: {
        operationId: "getScan",
        tags: ["Scans"],
        summary: "Get scan details",
        description: "Returns full scan results including violations, compliance report, and metadata.",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" }, description: "Scan ID (e.g. scan_abc123)" },
        ],
        responses: {
          "200": {
            description: "Full scan details",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ScanResponse" } } },
          },
          "404": { description: "Scan not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/scans/{id}/export": {
      get: {
        operationId: "exportScan",
        tags: ["Reports"],
        summary: "Export scan violations",
        description: "Export violations from a scan in CSV or JSON format.",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "format", in: "query", schema: { type: "string", enum: ["csv", "json", "xlsx"], default: "json" } },
        ],
        responses: {
          "200": {
            description: "Export data",
            content: {
              "text/csv": { schema: { type: "string" } },
              "application/json": { schema: { type: "object" } },
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { schema: { type: "string", format: "binary" } },
            },
          },
        },
      },
    },
    "/api/crawl": {
      post: {
        operationId: "startCrawl",
        tags: ["Crawls"],
        summary: "Start a multi-page site crawl",
        description: "Crawls a website up to maxPages, scanning each page for accessibility violations.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CrawlRequest" },
            },
          },
        },
        responses: {
          "200": { description: "Crawl results", content: { "application/json": { schema: { type: "object" } } } },
          "429": { description: "Rate limit (3 crawls/minute)" },
        },
      },
    },
    "/api/violations": {
      get: {
        operationId: "listViolations",
        tags: ["Violations"],
        summary: "List all violations across scans",
        description: "Aggregated view of all violations in the workspace with filtering and pagination.",
        parameters: [
          { name: "impact", in: "query", schema: { type: "string", enum: ["critical", "serious", "moderate", "minor"] } },
          { name: "status", in: "query", schema: { type: "string", enum: ["open", "fixed", "ignored", "in_progress"] } },
          { name: "ruleId", in: "query", schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Violations list", content: { "application/json": { schema: { type: "object" } } } },
        },
      },
    },
    "/api/violations/status": {
      patch: {
        operationId: "updateViolationStatus",
        tags: ["Violations"],
        summary: "Update violation status",
        description: "Change the status of a violation (e.g., mark as fixed, ignored, in-progress).",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["violationId", "status"],
                properties: {
                  violationId: { type: "string" },
                  status: { type: "string", enum: ["open", "fixed", "ignored", "in_progress"] },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Status updated" },
        },
      },
    },
    "/api/a11y/contrast": {
      post: {
        operationId: "analyzeContrast",
        tags: ["Accessibility"],
        summary: "Analyze WCAG color contrast + suggest an accessible fix",
        description:
          "Returns the contrast ratio and AA/AAA pass flags for a foreground/background pair. When it fails the requested level, returns the nearest HUE-PRESERVING color that passes — or, when no color can satisfy the target against that background, the highest-contrast fallback (flagged meetsTarget=false).",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["foreground", "background"],
                properties: {
                  foreground: { type: "string", description: "#rgb, #rrggbb, bare hex, or rgb()/rgba()" },
                  background: { type: "string", description: "#rgb, #rrggbb, bare hex, or rgb()/rgba()" },
                  level: { type: "string", enum: ["AA", "AAA"], default: "AA" },
                  largeText: { type: "boolean", default: false },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Contrast report + optional hue-preserving fix suggestion", content: { "application/json": { schema: { type: "object" } } } },
          "400": { description: "Unparseable color or invalid input" },
        },
      },
    },
    "/api/auth-configs": {
      get: {
        operationId: "listAuthConfigs",
        tags: ["Auth Configs"],
        summary: "List saved auth configurations",
        description: "Returns metadata for all saved auth configs. Credentials are never returned.",
        responses: {
          "200": {
            description: "Auth configs list (metadata only, no credentials)",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    configs: {
                      type: "array",
                      items: { $ref: "#/components/schemas/AuthConfigMeta" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        operationId: "createAuthConfig",
        tags: ["Auth Configs"],
        summary: "Save a new auth configuration",
        description: "Saves an encrypted auth configuration for reuse across scans. Credentials are encrypted at rest with AES-256-GCM.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AuthConfigCreate" },
              examples: {
                formLogin: {
                  summary: "Form-based login",
                  value: {
                    name: "Staging App Login",
                    domain: "staging.myapp.com",
                    config: {
                      method: "form",
                      loginUrl: "https://staging.myapp.com/login",
                      usernameSelector: "#email",
                      passwordSelector: "#password",
                      submitSelector: "button[type=submit]",
                      username: "test@company.com",
                      password: "password123",
                      successIndicator: ".dashboard",
                    },
                  },
                },
                cookies: {
                  summary: "Cookie injection (OAuth/SSO)",
                  value: {
                    name: "SSO Session",
                    domain: "app.company.com",
                    config: {
                      method: "cookies",
                      cookies: [
                        { name: "session_token", value: "abc...", domain: ".company.com", path: "/" },
                      ],
                    },
                  },
                },
                bearer: {
                  summary: "Bearer token",
                  value: {
                    name: "API Token Auth",
                    config: {
                      method: "headers",
                      headers: [{ name: "Authorization", value: "Bearer eyJ..." }],
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Auth config created" },
          "409": { description: "Duplicate name in workspace" },
        },
      },
    },
    "/api/auth-configs/{id}": {
      delete: {
        operationId: "deleteAuthConfig",
        tags: ["Auth Configs"],
        summary: "Delete a saved auth configuration",
        description: "Permanently removes a saved auth config and its encrypted credentials.",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Deleted" },
          "404": { description: "Not found" },
        },
      },
    },
    "/api/auth-configs/{id}/test": {
      post: {
        operationId: "testAuthConfig",
        tags: ["Auth Configs"],
        summary: "Test an auth config against a URL",
        description: "Decrypts saved credentials, launches a browser, applies authentication, and verifies the page loads successfully. Does NOT run a scan.",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["testUrl"],
                properties: {
                  testUrl: { type: "string", format: "uri", description: "URL to navigate to after authentication" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Auth test result", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" } } } } } },
          "401": { description: "Authentication failed" },
        },
      },
    },
    "/api/schedules": {
      get: {
        operationId: "listSchedules",
        tags: ["Monitoring"],
        summary: "List scheduled scans",
        description: "Returns all scheduled monitoring jobs for the workspace.",
        responses: { "200": { description: "Schedules list" } },
      },
      post: {
        operationId: "createSchedule",
        tags: ["Monitoring"],
        summary: "Create a scheduled scan",
        description: "Set up recurring accessibility scans on a cron schedule.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object" } } },
        },
        responses: { "201": { description: "Schedule created" } },
      },
    },
    "/api/integrations": {
      get: {
        operationId: "listIntegrations",
        tags: ["Integrations"],
        summary: "List configured integrations",
        responses: { "200": { description: "Integrations list" } },
      },
    },
    "/api/agency": {
      get: {
        operationId: "listAgencies",
        tags: ["Agency"],
        summary: "List agencies (master admin: all; user: own)",
        responses: { "200": { description: "Agencies list" } },
      },
      post: {
        operationId: "createAgency",
        tags: ["Agency"],
        summary: "Create a new agency (master admin only)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AgencyCreate" },
            },
          },
        },
        responses: {
          "201": { description: "Agency created" },
          "403": { description: "Not authorized (master admin required)" },
        },
      },
    },
    "/api/dashboard/stats": {
      get: {
        operationId: "getDashboardStats",
        tags: ["Reports"],
        summary: "Get dashboard statistics",
        description: "Returns aggregated stats: total scans, average score, violations count, sites monitored, trends.",
        responses: {
          "200": {
            description: "Dashboard statistics",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/DashboardStats" },
              },
            },
          },
        },
      },
    },
    "/api/health": {
      get: {
        operationId: "healthCheck",
        tags: ["Admin"],
        summary: "Health check",
        description: "Returns service health status. No authentication required.",
        security: [],
        responses: {
          "200": {
            description: "Service healthy",
            content: { "application/json": { schema: { type: "object", properties: { status: { type: "string", enum: ["ok"] }, timestamp: { type: "string", format: "date-time" } } } } },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "JWT token from NextAuth.js session or API key",
      },
      SessionCookie: {
        type: "apiKey",
        in: "cookie",
        name: "next-auth.session-token",
        description: "Session cookie from browser authentication",
      },
    },
    schemas: {
      Error: {
        type: "object",
        required: ["error"],
        properties: {
          error: { type: "string", description: "Human-readable error message" },
          message: { type: "string", description: "Technical error details" },
          code: { type: "string", description: "Machine-readable error code" },
          details: { type: "object", description: "Validation error details" },
        },
      },
      ScanRequest: {
        type: "object",
        required: ["url"],
        properties: {
          url: { type: "string", format: "uri", description: "URL to scan (must be publicly accessible or use auth config)" },
          options: {
            type: "object",
            properties: {
              standard: { type: "string", enum: ["wcag2a", "wcag21aa", "wcag22aa", "en301549", "section508"], default: "wcag21aa" },
              waitForSelector: { type: "string", description: "CSS selector to wait for before scanning (for SPAs)" },
              authConfigId: { type: "string", description: "ID of saved auth config for behind-login pages" },
              includeScreenshot: { type: "boolean", default: true },
            },
          },
        },
      },
      ScanResponse: {
        type: "object",
        properties: {
          scan: { $ref: "#/components/schemas/ScanResult" },
          compliance: { $ref: "#/components/schemas/ComplianceReport" },
        },
      },
      ScanResult: {
        type: "object",
        properties: {
          id: { type: "string", description: "Unique scan ID" },
          url: { type: "string", format: "uri" },
          score: { type: "number", minimum: 0, maximum: 100 },
          status: { type: "string", enum: ["completed", "failed"] },
          violations: { type: "array", items: { $ref: "#/components/schemas/Violation" } },
          passes: { type: "integer" },
          incomplete: { type: "integer" },
          inapplicable: { type: "integer" },
          screenshotUrl: { type: "string", format: "uri", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          duration: { type: "integer", description: "Scan duration in milliseconds" },
        },
      },
      ScanSummary: {
        type: "object",
        properties: {
          id: { type: "string" },
          url: { type: "string" },
          score: { type: "number" },
          violationCount: { type: "integer" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      Violation: {
        type: "object",
        properties: {
          id: { type: "string" },
          ruleId: { type: "string", description: "axe-core rule ID (e.g. color-contrast)" },
          impact: { type: "string", enum: ["critical", "serious", "moderate", "minor"] },
          description: { type: "string" },
          help: { type: "string" },
          helpUrl: { type: "string", format: "uri" },
          wcagCriteria: { type: "string", description: "WCAG success criterion (e.g. 1.4.3)" },
          wcagLevel: { type: "string", enum: ["A", "AA", "AAA"] },
          selector: { type: "string", description: "CSS selector of the affected element" },
          html: { type: "string", description: "Affected HTML snippet" },
          tags: { type: "array", items: { type: "string" } },
        },
      },
      ComplianceReport: {
        type: "object",
        properties: {
          standard: { type: "string" },
          level: { type: "string" },
          score: { type: "number" },
          conformanceLevel: { type: "string", enum: ["conformant", "partially_conformant", "non_conformant"] },
          criteria: { type: "object", additionalProperties: { type: "string", enum: ["pass", "fail", "not_applicable"] } },
        },
      },
      CrawlRequest: {
        type: "object",
        required: ["url"],
        properties: {
          url: { type: "string", format: "uri" },
          maxPages: { type: "integer", default: 20, maximum: 100 },
          standard: { type: "string", default: "wcag21aa" },
        },
      },
      AuthConfigMeta: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          domain: { type: "string", nullable: true },
          method: { type: "string", enum: ["form", "cookies", "basic", "headers"] },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      AuthConfigCreate: {
        type: "object",
        required: ["name", "config"],
        properties: {
          name: { type: "string", maxLength: 100 },
          domain: { type: "string", description: "Domain this config applies to (optional)" },
          config: {
            type: "object",
            required: ["method"],
            properties: {
              method: { type: "string", enum: ["form", "cookies", "basic", "headers"] },
            },
            description: "Full auth configuration (encrypted at rest)",
          },
        },
      },
      AgencyCreate: {
        type: "object",
        required: ["name", "slug", "brandName", "primaryColor", "accentColor"],
        properties: {
          name: { type: "string" },
          slug: { type: "string", pattern: "^[a-z0-9-]+$" },
          brandName: { type: "string" },
          primaryColor: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
          accentColor: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
        },
      },
      DashboardStats: {
        type: "object",
        properties: {
          totalScans: { type: "integer" },
          avgScore: { type: "number" },
          totalViolations: { type: "integer" },
          sitesMonitored: { type: "integer" },
          trend: { type: "number", description: "Score trend (positive = improving)" },
          recentScans: { type: "array", items: { $ref: "#/components/schemas/ScanSummary" } },
          topViolations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                ruleId: { type: "string" },
                impact: { type: "string" },
                count: { type: "integer" },
              },
            },
          },
        },
      },
    },
  },
} as const;

export async function GET() {
  return NextResponse.json(OPENAPI_SPEC, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
