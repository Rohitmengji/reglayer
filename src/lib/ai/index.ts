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

// ── Graph RAG ─────────────────────────────────────────────────────────────────
export { upsertEntity, upsertEdge, indexScan, findEntities, getNeighbors, findPaths, relationshipSearch, buildGraphContext, extractEntityReferences, getGraphStats } from "./graph/service";
export type { GraphEntity, GraphEdge, GraphPath, GraphSearchResult, EntityType, RelationType } from "./graph/service";

// ── Query Planner ─────────────────────────────────────────────────────────────
export { classifyIntent, generatePlan, executePlan, topologicalSort, buildSynthesisContext } from "./planner/engine";
export type { QueryIntent, QueryPlan, PlanStep, StepResult, PlanExecutionResult, StepExecutors, DataSource } from "./planner/engine";

// ── Context Compression ───────────────────────────────────────────────────────
export { compressContext, scoreRelevance, scoreChunks, deduplicateChunks, estimateTokens, buildDistillationPrompt } from "./compression/engine";
export type { ContextChunk, CompressionOptions, CompressionResult } from "./compression/engine";

// ── Context Cache ─────────────────────────────────────────────────────────────
export { cacheLookup, cacheStore, exactLookup, exactStore, semanticLookup, semanticStore, embeddingLookup, embeddingStore, invalidateUserCache, invalidateWorkspaceCache, getPromptCacheHint, getCacheStats, cosineSimilarity, generateCacheKey } from "./cache/context-cache";
export type { CacheLookupResult, CacheStats, CacheLayer, PromptCacheHint } from "./cache/context-cache";

// ── Retrieval Pipeline ────────────────────────────────────────────────────────
export { optimizedRetrieve, autoPreset, FAST_PRESET, BALANCED_PRESET, THOROUGH_PRESET } from "./retrieval/pipeline";
export type { RetrievalConfig, RetrievalResult, PipelineStage } from "./retrieval/pipeline";

// ── Agent Marketplace ─────────────────────────────────────────────────────────
export { createBlueprint, getBlueprint, listBlueprints, updateBlueprint, deleteBlueprint, seedSystemAgents } from "./marketplace/registry";
export type { AgentBlueprint } from "./marketplace/registry";

// ── Agent-to-Agent (A2A) Protocol ─────────────────────────────────────────────
export { startConversation, runTurn, executeHandoff, runConversation, getConversation, listConversations, detectHandoff } from "./a2a/protocol";
export type { A2AMessage, Conversation, HandoffRequest, MessageRole } from "./a2a/protocol";

// ── Agent Scheduler ───────────────────────────────────────────────────────────
export { createSchedule, listSchedules, toggleSchedule, deleteSchedule, getDueAgentSchedules, executeScheduledRun, fireAgentEvent, getRunHistory, resolveTemplate as resolveScheduleTemplate } from "./scheduler/service";
export type { AgentScheduleEntry, ScheduleRunEntry } from "./scheduler/service";

// ── Autonomous Agent Presets ──────────────────────────────────────────────────
export { installPresets, getAvailablePresets, AUTONOMOUS_PRESETS } from "./scheduler/presets";
export type { AutonomousPreset } from "./scheduler/presets";

// ── Workspace Memory (AI Operating System) ────────────────────────────────────
export { resolveWorkspaceContext, INVALIDATION_EVENTS } from "./workspace/context";
export type { WorkspaceContext, WorkspaceResources } from "./workspace/context";

// ── Semantic User Profile ─────────────────────────────────────────────────────
export { getProfile, updateProfile, trackUsage, inferPreferences, formatProfileForPrompt } from "./profile/service";
export type { SemanticProfile } from "./profile/service";

// ── Long-Term Learning ────────────────────────────────────────────────────────
export { recordFeedback, analyzeFeedback, proposeImprovement, listProposals, applyImprovement, rejectImprovement, runLearningCycle, getLearningOverview } from "./learning/service";
export type { FeedbackInput, FeedbackAnalysis, ImprovementProposal } from "./learning/service";

// ── SDK Generator ─────────────────────────────────────────────────────────────
export { generateSDK, parseOpenAPISpec } from "./sdk/generator";
export type { SDKLanguage, SDKConfig, GeneratedSDK, SDKFile } from "./sdk/generator";

// ── Data Lineage ──────────────────────────────────────────────────────────────
export { LineageBuilder, formatLineageChain, traceToHeaders } from "./lineage/tracker";
export type { LineageTrace, LineageStage, LineageSummary } from "./lineage/tracker";

// ── Audit Trail ───────────────────────────────────────────────────────────────
export { recordAuditEntry, queryAuditTrail, getAuditStats, purgeExpiredEntries, eraseUserData, exportAuditTrail } from "./audit/trail";
export type { AuditEntryInput, AuditEntry, AuditQueryOpts } from "./audit/trail";

// ── Compliance Framework ──────────────────────────────────────────────────────
export { seedControls, runAutomatedChecks, generateComplianceReport, getComplianceOverview, FRAMEWORK_CONTROLS } from "./compliance/framework";
export type { Framework, ComplianceControl, ComplianceReport, ControlStatus } from "./compliance/framework";

// ── Data Residency ────────────────────────────────────────────────────────────
export { resolveRegion, getRegionalEndpoint, evaluateResidency, setWorkspaceRegion, getAvailableRegions, isValidRegion, REGIONS } from "./residency/engine";
export type { DataRegion, RegionConfig, ResidencyContext } from "./residency/engine";

// ── Self-Reflection ───────────────────────────────────────────────────────────
export { reflect, quickScore, getCritiqueDimensions } from "./reflection/engine";
export type { ReflectionConfig, ReflectionResult, CritiqueResult, CritiqueDimension } from "./reflection/engine";

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
