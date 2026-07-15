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
import {
  listResources,
  readResource,
  listTools,
  callTool,
  listPrompts,
  getPromptMessages,
} from "@/lib/ai/mcp/server";

export const runtime = "nodejs";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

function jsonRpcResponse(id: string | number, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id, result });
}

function jsonRpcError(id: string | number, code: number, message: string) {
  return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } });
}

export async function POST(request: NextRequest) {
  // Auth — MCP requires authentication
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: JsonRpcRequest;
  try {
    body = await request.json() as JsonRpcRequest;
  } catch {
    return jsonRpcError(0, -32700, "Parse error");
  }

  if (body.jsonrpc !== "2.0" || !body.method) {
    return jsonRpcError(body.id ?? 0, -32600, "Invalid request");
  }

  const { id, method, params } = body;

  try {
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
        const uri = (params as { uri?: string })?.uri;
        if (!uri) return jsonRpcError(id, -32602, "Missing uri parameter");
        const content = await readResource(uri);
        return jsonRpcResponse(id, {
          contents: [{ uri, mimeType: "application/json", text: content }],
        });
      }

      // ── Tools ───────────────────────────────────────────────────────────
      case "tools/list":
        return jsonRpcResponse(id, { tools: listTools() });

      case "tools/call": {
        const toolName = (params as { name?: string })?.name;
        const toolArgs = (params as { arguments?: Record<string, unknown> })?.arguments ?? {};
        if (!toolName) return jsonRpcError(id, -32602, "Missing tool name");
        const result = await callTool(toolName, toolArgs);
        return jsonRpcResponse(id, {
          content: [{ type: "text", text: result }],
        });
      }

      // ── Prompts ─────────────────────────────────────────────────────────
      case "prompts/list":
        return jsonRpcResponse(id, { prompts: listPrompts() });

      case "prompts/get": {
        const promptName = (params as { name?: string })?.name;
        const promptArgs = (params as { arguments?: Record<string, string> })?.arguments ?? {};
        if (!promptName) return jsonRpcError(id, -32602, "Missing prompt name");
        const messages = getPromptMessages(promptName, promptArgs);
        return jsonRpcResponse(id, { messages });
      }

      default:
        return jsonRpcError(id, -32601, `Method not found: ${method}`);
    }
  } catch (error) {
    return jsonRpcError(id, -32603, error instanceof Error ? error.message : "Internal error");
  }
}
