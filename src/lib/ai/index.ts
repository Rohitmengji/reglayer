/**
 * RegLayer — AI Platform Index
 *
 * Single import point for the entire AI platform.
 * Documents the complete architecture and provides re-exports.
 *
 * ARCHITECTURE OVERVIEW:
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │                        AI PLATFORM LAYERS                           │
 * ├─────────────────────────────────────────────────────────────────────┤
 * │                                                                     │
 * │  API Layer           /api/ai/chat, /api/ai/search, /api/ai/agents  │
 * │                      /api/ai/workflow, /api/ai/usage, /api/mcp     │
 * │                                                                     │
 * │  Orchestration       agents/ (multi-agent), workflows/ (state      │
 * │                      machine), builder (no-code templates)          │
 * │                                                                     │
 * │  Intelligence        rag/ (retrieval-augmented generation),         │
 * │                      vector/ (semantic search), tools/ (actions)    │
 * │                                                                     │
 * │  Foundation          gateway/ (routing, streaming, cost tracking),  │
 * │                      prompts/ (versioned registry), providers/      │
 * │                      (OpenAI, Anthropic adapters)                   │
 * │                                                                     │
 * │  Infrastructure      observability/ (event persistence, metrics),   │
 * │                      hardening/ (circuit breaker, PII, cache),      │
 * │                      features/ (feature flags, plan gating)         │
 * │                                                                     │
 * │  External            mcp/ (Model Context Protocol server)           │
 * │                                                                     │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * PHASES COMPLETED:
 *   1. AI Gateway (multi-provider routing)
 *   2. Streaming Chat (real-time responses)
 *   3. Prompt Management (versioned registry)
 *   4. Embeddings & Vector DB (pgvector)
 *   5. RAG Pipeline (context-aware chat)
 *   6. Tool Calling (LLM executes actions)
 *   7. LangGraph Workflows (state machine)
 *   8. Multi-Agent Orchestration (planner → specialists)
 *   9. MCP Server (external AI client access)
 *  10. Evaluation & Observability (cost tracking)
 *  11. Workflow Builder (no-code templates)
 *  12. Production Hardening (circuit breaker, PII, cache)
 *  13. Feature Flags (plan-based gating)
 *  14. Architecture Documentation (this file)
 */

// ── Gateway (Foundation) ──────────────────────────────────────────────────────
export { complete, stream, embed, isAIAvailable, getDefaultModelId, onGatewayEvent } from "./gateway";
export type { CompletionRequest, CompletionResponse, EmbedRequest, EmbedResponse, Message, ModelId } from "./gateway/types";

// ── Prompts ───────────────────────────────────────────────────────────────────
export { getPrompt, buildMessages, getAllPrompts } from "./prompts/registry";
export { resolveTemplate } from "./prompts/resolver";

// ── Vector Search ─────────────────────────────────────────────────────────────
export { searchViolations, embedViolation, embedScanViolations } from "./vector/search";

// ── Hybrid Search ─────────────────────────────────────────────────────────────
export { hybridSearch, multiQuerySearch, generateMultiQueries, rewriteQuery } from "./search/hybrid";
export type { HybridSearchResult, HybridSearchOptions } from "./search/hybrid";

// ── RAG ───────────────────────────────────────────────────────────────────────
export { buildRAGContext, buildRAGMessages } from "./rag/service";

// ── Tools ─────────────────────────────────────────────────────────────────────
export { createChatTools } from "./tools/definitions";
export type { ToolContext } from "./tools/definitions";

// ── Agents ────────────────────────────────────────────────────────────────────
export { orchestrate } from "./agents/orchestrator";
export { getAgent } from "./agents/definitions";

// ── Workflows ─────────────────────────────────────────────────────────────────
export { runWorkflow } from "./workflows/runner";
export { getWorkflow, getAllWorkflows } from "./workflows/registry";
export { compileWorkflow } from "./workflows/builder";

// ── MCP ───────────────────────────────────────────────────────────────────────
export { listResources, readResource, listTools, callTool, listPrompts, getPromptMessages } from "./mcp/server";

// ── Observability ─────────────────────────────────────────────────────────────
export { getUsageSummary, getCostByFeature, getDailyUsage } from "./observability/service";

// ── Hardening ─────────────────────────────────────────────────────────────────
export { isCircuitOpen, recordSuccess, recordFailure, containsPII, sanitizeForLLM, getCachedResponse, setCachedResponse } from "./hardening";

// ── Guardrails ────────────────────────────────────────────────────────────────
export { runGuardrails, CHAT_GUARDS, STRUCTURED_GUARDS, RAG_GUARDS } from "./guardrails";
export type { GuardResult, GuardContext, GuardPipelineResult, GuardFn } from "./guardrails";

// ── Memory ────────────────────────────────────────────────────────────────────
export { getMemories, setMemory, deleteMemory, clearAllMemories, listUserMemories, extractMemories, formatMemoriesForPrompt } from "./memory/service";
export type { MemoryEntry, MemoryContext, MemoryScope } from "./memory/service";

// ── Human Approval Workflows ──────────────────────────────────────────────────
export { createApprovalRequest, listPendingApprovals, getApprovalRequest, approveRequest, rejectRequest, markPublished, countPending } from "./approval/service";
export type { ApprovalRequestEntry, ApprovalType, ApprovalStatus } from "./approval/service";

// ── Knowledge Management ──────────────────────────────────────────────────────
export { createDocument, listDocuments, deleteDocument, processDocument, searchKnowledge, chunkText } from "./knowledge/service";
export type { KnowledgeDocumentEntry, KnowledgeSearchResult } from "./knowledge/service";

// ── AI Experiments ────────────────────────────────────────────────────────────
export { createExperiment, listExperiments, getExperiment, startExperiment, pauseExperiment, completeExperiment, resolveVariant, recordTrial, analyzeResults } from "./experiments/service";
export type { ExperimentEntry, VariantConfig, ExperimentStatus } from "./experiments/service";

// ── Feature Flags ─────────────────────────────────────────────────────────────
export { isAIFeatureEnabled, getAllAIFeatures, getEnabledFeatures } from "./features/flags";
