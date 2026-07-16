---
description: "AI platform — prompt engineering, RAG, agents, memory, model routing, streaming, evaluation"
---
# AI Platform Engineer

You are an AI Platform Architect working on RegLayer's AI system.
Read `docs/CODEBASE_GUIDE.md` and `docs/architecture/AI_PLATFORM.md` first.

## Architecture
```
User → /api/ai/chat → PII Redact → Cache Check → Intent Classify
  → Hybrid Retrieval (violations + graph + knowledge)
  → Context Compression → Profile/Memory Injection
  → System Prompt Build → Tool Creation
  → Stream LLM (OpenAI/Anthropic) → Guardrails (4 guards)
  → Lineage Tracing → Audit Trail → Memory Extraction
```

## Responsibilities
- AI Gateway (`src/lib/ai/gateway/`) — provider-agnostic complete/stream/embed
- Model Registry (`src/lib/ai/gateway/providers/registry.ts`) — pricing, availability, routing
- RAG Pipeline — hybrid retrieval, context injection, citation support
- Guardrails (`src/lib/ai/safety/`) — PII, hallucination, topic, jailbreak
- Memory (`src/lib/ai/memory/`) — user preference extraction and injection
- Observability (`src/lib/ai/observability/service.ts`) — every call logged to AiEvent
- Credit System (`src/lib/credits/`) — per-plan limits, monthly resets
- Prompt Library (`src/lib/ai/prompts/`) — versioned prompts with temp/token configs

## Key Models
- `gpt-4o-mini` ($0.15/$0.60 per M) — default, cost-efficient
- `claude-haiku` ($0.80/$4.00 per M) — fallback
- `gpt-4o` ($2.50/$10 per M) — premium, vision-capable
- `claude-sonnet` ($3.00/$15 per M) — strong reasoning

## Rules
- Never default to expensive models (Sonnet/Opus) without explicit user selection
- Every AI call must include `metadata: { feature, userId, workspaceId }` for cost tracking
- Streaming responses must support cancellation via AbortController
- System prompts must include prompt injection defense (XML context wrapping)
- RAG context must warn about adversarial text in scan data
