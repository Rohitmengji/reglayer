/**
 * RegLayer — Model Selection
 *
 * Chooses WHICH model serves a request. Fallback and failover already work well and are
 * not touched here: `resolveModelChain` in the registry crosses providers on failure and
 * filters to configured ones, which is the right design.
 *
 * WHAT WAS BROKEN: selection. `routing/model-router.ts::routeToModel` scores complexity
 * and returns a tier — and the chat route then does `const modelId = fallbackModelId;`,
 * discarding it. The routed tier reaches telemetry and the lineage trace as a
 * `model_routing` step, but never reaches the model call. Two consequences:
 *
 *   - The "40-60% cost savings" the router documents are not being realised at all;
 *     every request goes to the same default model.
 *   - The audit trail records a routing decision the system did not act on. For a
 *     product whose output is compliance evidence, a lineage entry asserting something
 *     untrue is worse than no entry.
 *
 * ALSO: `MODEL_TIERS` is a second model table whose `provider` union is
 * `"openai" | "anthropic"` — it structurally cannot express Gemini or a local model,
 * and its `fast` and `standard` tiers are the same model. It is the same shape as the
 * `FALLBACK_CHAIN` that once pointed at a non-existent model id and was never executed.
 *
 * THIS MODULE READS THE REGISTRY AND NOTHING ELSE. No provider name appears in the
 * selection logic, so adding a provider — including a local one — is a registry entry
 * rather than a code change. That is the concrete form of "no vendor lock-in".
 */

import type { ModelConfig, ModelId } from "@/lib/ai/gateway/types";

export type RoutingObjective = "balanced" | "cost" | "latency" | "quality";

export interface SelectionRequest {
  /** 0-100 from `scoreComplexity`. Drives the minimum acceptable capability. */
  complexity: number;
  /** Hard requirements. A model that cannot do the job is never a saving. */
  needsVision?: boolean;
  needsJsonMode?: boolean;
  /** Tokens the request must fit in, including the reserved completion. */
  minContextWindow?: number;
  objective?: RoutingObjective;
  /**
   * Per-user or per-feature pin. Honoured only when the model is available AND meets
   * the hard requirements — a pin must never silently produce a broken request.
   */
  preferred?: ModelId;
}

export interface ModelSelection {
  modelId: ModelId;
  /** Why this model won. Recorded in lineage so the decision is auditable. */
  reason: string;
}

/**
 * Minimum capability for a given complexity.
 *
 * A floor rather than a bucket: the router then picks the CHEAPEST model clearing it,
 * so a new cheap-but-capable model is adopted automatically instead of requiring a tier
 * table to be rewritten.
 */
export function qualityFloorFor(complexity: number): number {
  if (complexity >= 60) return 10;
  if (complexity >= 30) return 8;
  return 1;
}

function meetsHardRequirements(model: ModelConfig, request: SelectionRequest): boolean {
  if (!model.isAvailable()) return false;
  if (request.needsVision && !model.supportsVision) return false;
  if (request.needsJsonMode && !model.supportsJsonMode) return false;
  if (request.minContextWindow && model.contextWindow < request.minContextWindow) return false;
  return true;
}

/** Blended price. Output tokens are weighted since they dominate chat spend. */
export function blendedCost(model: ModelConfig): number {
  return model.pricing.inputPerMillion * 0.25 + model.pricing.outputPerMillion * 0.75;
}

function compareFor(objective: RoutingObjective) {
  return (a: ModelConfig, b: ModelConfig): number => {
    switch (objective) {
      case "quality":
        return b.quality - a.quality || blendedCost(a) - blendedCost(b);
      case "latency":
        return a.avgLatencyMs - b.avgLatencyMs || blendedCost(a) - blendedCost(b);
      case "cost":
      case "balanced":
      default:
        // Cheapest first among models that already cleared the quality floor, so
        // "balanced" means "do not overpay for capability this request cannot use".
        return blendedCost(a) - blendedCost(b) || b.quality - a.quality;
    }
  };
}

/**
 * Select a model.
 *
 * `fallbackModelId` is returned whenever no candidate qualifies. Selection degrades to
 * the known-good default rather than throwing: a routing refinement must never be able
 * to take chat down.
 */
export function selectModel(
  request: SelectionRequest,
  catalogue: readonly ModelConfig[],
  fallbackModelId: ModelId,
): ModelSelection {
  const objective = request.objective ?? "balanced";

  if (request.preferred) {
    const pinned = catalogue.find((m) => m.id === request.preferred);
    if (pinned && meetsHardRequirements(pinned, request)) {
      return { modelId: pinned.id, reason: `pinned:${pinned.id}` };
    }
    // Deliberately falls through rather than failing: a stale per-user pin should
    // degrade to automatic selection, not break the user's chat.
  }

  const floor = qualityFloorFor(request.complexity);
  const eligible = catalogue
    .filter((model) => meetsHardRequirements(model, request))
    .filter((model) => model.quality >= floor);

  if (eligible.length === 0) {
    // Retry ignoring the quality floor: a capable-enough model is unavailable, and
    // answering with a weaker one beats not answering.
    const anyUsable = catalogue.filter((model) => meetsHardRequirements(model, request));
    if (anyUsable.length === 0) {
      return { modelId: fallbackModelId, reason: "no-candidate-available" };
    }
    const degraded = [...anyUsable].sort(compareFor("quality"))[0];
    return { modelId: degraded.id, reason: `degraded-below-floor:${floor}` };
  }

  const winner = [...eligible].sort(compareFor(objective))[0];
  return { modelId: winner.id, reason: `${objective}:floor-${floor}` };
}
