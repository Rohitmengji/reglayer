/**
 * RegLayer — MCP HTTP Endpoint
 *
 * POST /api/mcp
 *
 * Handles JSON-RPC 2.0 requests from MCP clients (Claude Desktop, Cursor, etc.)
 * Implements the MCP protocol: list resources/tools/prompts, read, call.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { requireWorkspacePermission } from "@/lib/auth/api-guard";
import { rateLimit, RATE_LIMITS, rateLimitHeaders } from "@/lib/rate-limit";
import { logger } from "@/lib/telemetry/logger";
import { z } from "zod";
import {
  listResources,
  readResource,
  listTools,
  callTool,
  listPrompts,
  getPromptMessages,
  MCPInputError,
} from "@/lib/ai/mcp/server";

export const runtime = "nodejs";

const rpcSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string().max(200), z.number().finite()]).optional(),
  method: z.string().min(1).max(200),
  params: z.record(z.string(), z.unknown()).optional(),
});

function jsonRpcResponse(id: string | number, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id, result });
}

function jsonRpcError(id: string | number | null, code: number, message: string) {
  return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } });
}

export async function POST(request: NextRequest) {
  // Auth — MCP requires authentication
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonRpcError(null, -32700, "Parse error");
  }

  const parsed = rpcSchema.safeParse(body);
  if (!parsed.success) return jsonRpcError(null, -32600, "Invalid request");
  const { id, method, params } = parsed.data;

  try {
    const limit = await rateLimit(session.user.email, RATE_LIMITS.api, "mcp");
    if (!limit.success) return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: rateLimitHeaders(limit) });
    const permission = await requireWorkspacePermission("scans.view");
    if (!permission.ok) return permission.response;
    if (!permission.ctx.workspaceId) return NextResponse.json({ error: "Workspace is required" }, { status: 403 });
    const context = { workspaceId: permission.ctx.workspaceId };
    if (id === undefined) return new NextResponse(null, { status: 204 });

    switch (method) {
      // ── Discovery ───────────────────────────────────────────────────────
      case "initialize":
        return jsonRpcResponse(id, {
          protocolVersion: "2024-11-05",
          capabilities: {
            resources: { listChanged: false },
            tools: {},
            prompts: {},
          },
          serverInfo: {
            name: "reglayer-mcp",
            version: "1.0.0",
          },
        });

      // ── Resources ───────────────────────────────────────────────────────
      case "resources/list":
        return jsonRpcResponse(id, { resources: await listResources() });

      case "resources/read": {
        const { uri } = z.object({ uri: z.string().min(1).max(2048) }).parse(params);
        const content = await readResource(uri, context);
        return jsonRpcResponse(id, {
          contents: [{ uri, mimeType: "application/json", text: content }],
        });
      }

      // ── Tools ───────────────────────────────────────────────────────────
      case "tools/list":
        return jsonRpcResponse(id, { tools: listTools() });

      case "tools/call": {
        const { name, arguments: args } = z.object({ name: z.string().min(1).max(100), arguments: z.record(z.string(), z.unknown()).default({}) }).parse(params);
        const result = await callTool(name, args, context);
        return jsonRpcResponse(id, {
          content: [{ type: "text", text: result }],
        });
      }

      // ── Prompts ─────────────────────────────────────────────────────────
      case "prompts/list":
        return jsonRpcResponse(id, { prompts: listPrompts() });

      case "prompts/get": {
        const { name, arguments: args } = z.object({ name: z.string().min(1).max(100), arguments: z.record(z.string(), z.string().max(2048)).default({}) }).parse(params);
        const messages = getPromptMessages(name, args);
        return jsonRpcResponse(id, { messages });
      }

      default:
        return jsonRpcError(id, -32601, `Method not found: ${method}`);
    }
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof MCPInputError) return jsonRpcError(id ?? null, -32602, "Invalid parameters or resource unavailable");
    logger.error("MCP request failed", { method });
    return jsonRpcError(id ?? null, -32603, "Request could not be completed. Please try again.");
  }
}
