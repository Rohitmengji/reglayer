/**
 * RegLayer — Graph RAG (Knowledge Graph + Retrieval-Augmented Generation)
 *
 * WHY GRAPH RAG > VECTOR RAG:
 *   Vector search finds semantically SIMILAR content, but misses RELATIONSHIPS.
 *
 *   "Which WCAG criteria does our checkout page violate, and which regulation
 *    requires them?"
 *
 *   Vector search: returns violations with similar descriptions (maybe relevant)
 *   Graph RAG: traverses Site→Scan→Violation→WCAGCriterion→Regulation (exact path)
 *
 * ARCHITECTURE:
 *   1. Entity Extraction  — Extract entities from scans/docs/conversations
 *   2. Graph Construction — Build typed nodes + edges in PostgreSQL
 *   3. Graph Traversal    — Multi-hop relationship queries
 *   4. Graph + Vector Fusion — Combine structural + semantic results
 *   5. Context Building   — Format graph paths as LLM context
 *
 * ENTITY TYPES (RegLayer domain):
 *   site        — A monitored website (url, name)
 *   violation   — An accessibility issue (ruleId, impact, wcag)
 *   wcag        — A WCAG success criterion (number, level, principle)
 *   regulation  — A compliance standard (ADA, EAA, Section 508, EN 301 549)
 *   team_member — A user working on compliance
 *   policy      — A guard policy or compliance rule
 *   document    — An uploaded knowledge document
 *   scan        — A scan execution record
 *
 * EDGE TYPES (relationships):
 *   site ──owns──→ scan
 *   scan ──found──→ violation
 *   violation ──violates──→ wcag
 *   wcag ──required_by──→ regulation
 *   team_member ──manages──→ site
 *   team_member ──fixed──→ violation
 *   policy ──governs──→ site
 *   document ──references──→ wcag
 *
 * INSPIRED BY:
 *   - Microsoft GraphRAG (entity extraction → community summarization)
 *   - Neo4j + LangChain (graph-augmented retrieval)
 *   - Google Knowledge Graph (entity linking + relationship search)
 *   - Amazon Neptune (graph analytics for enterprise data)
 */

import "server-only";

import { prisma } from "@/lib/database/prisma";
import { embed } from "@/lib/ai/gateway";
import { Prisma } from "@/generated/prisma/client";

// ── Types ─────────────────────────────────────────────────────────────────────

export type EntityType =
  | "site" | "violation" | "wcag" | "regulation"
  | "team_member" | "policy" | "document" | "scan";

export type RelationType =
  | "owns" | "found" | "violates" | "required_by"
  | "manages" | "fixed" | "governs" | "references"
  | "part_of" | "member_of" | "related_to";

export interface GraphEntity {
  id: string;
  type: EntityType;
  name: string;
  properties: Record<string, unknown> | null;
}

export interface GraphEdge {
  id: string;
  relation: RelationType;
  weight: number;
  properties: Record<string, unknown> | null;
  from: GraphEntity;
  to: GraphEntity;
}

export interface GraphPath {
  entities: GraphEntity[];
  edges: GraphEdge[];
  /** Human-readable path description */
  description: string;
}

export interface GraphSearchResult {
  /** Entities matching the query */
  entities: GraphEntity[];
  /** Relationship paths connecting them */
  paths: GraphPath[];
  /** Formatted context for LLM injection */
  context: string;
}

// ── Entity Management ─────────────────────────────────────────────────────────

/**
 * Upsert an entity into the knowledge graph.
 * Uses (workspaceId, type, name) as the unique key.
 */
export async function upsertEntity(
  type: EntityType,
  name: string,
  opts?: {
    properties?: Record<string, unknown>;
    workspaceId?: string | null;
  },
): Promise<GraphEntity> {
  const wsId = opts?.workspaceId ?? null;

  const result = await prisma.knowledgeEntity.upsert({
    where: {
      workspaceId_type_name: {
        workspaceId: wsId ?? "",
        type,
        name,
      },
    },
    update: {
      properties: (opts?.properties as object) ?? undefined,
    },
    create: {
      type,
      name,
      properties: (opts?.properties as object) ?? undefined,
      workspaceId: wsId,
    },
  });

  return mapEntity(result);
}

/**
 * Create a directed edge between two entities.
 * Upserts on (fromId, toId, relation) to prevent duplicates.
 */
export async function upsertEdge(
  fromId: string,
  toId: string,
  relation: RelationType,
  opts?: { weight?: number; properties?: Record<string, unknown> },
): Promise<string> {
  const result = await prisma.knowledgeEdge.upsert({
    where: {
      fromId_toId_relation: { fromId, toId, relation },
    },
    update: {
      weight: opts?.weight ?? 1.0,
      properties: (opts?.properties as object) ?? undefined,
    },
    create: {
      fromId,
      toId,
      relation,
      weight: opts?.weight ?? 1.0,
      properties: (opts?.properties as object) ?? undefined,
    },
  });

  return result.id;
}

// ── Graph Construction from Scan Data ─────────────────────────────────────────

/**
 * Build knowledge graph from a completed scan.
 *
 * Extracts entities (site, scan, violations, WCAG criteria) and creates
 * the relationship edges between them. Called after scan completion.
 *
 * Graph structure per scan:
 *   Site ──owns──→ Scan ──found──→ Violation ──violates──→ WCAG Criterion
 */
export async function indexScan(
  scanId: string,
  workspaceId: string,
): Promise<{ entities: number; edges: number }> {
  const scan = await prisma.scan.findUnique({
    where: { id: scanId },
    include: { violations: { select: { id: true, ruleId: true, impact: true, description: true, wcagCriteria: true, help: true } } },
  });

  if (!scan) return { entities: 0, edges: 0 };

  let entityCount = 0;
  let edgeCount = 0;

  // 1. Site entity
  const siteEntity = await upsertEntity("site", scan.url, {
    workspaceId,
    properties: { url: scan.url, pageTitle: scan.pageTitle },
  });
  entityCount++;

  // 2. Scan entity
  const scanEntity = await upsertEntity("scan", `scan:${scanId}`, {
    workspaceId,
    properties: {
      scanId,
      score: scan.score,
      totalViolations: scan.totalViolations,
      date: scan.createdAt.toISOString(),
    },
  });
  entityCount++;

  // 3. Site ──owns──→ Scan
  await upsertEdge(siteEntity.id, scanEntity.id, "owns", {
    properties: { date: scan.createdAt.toISOString() },
  });
  edgeCount++;

  // 4. Process violations
  const wcagEntities = new Map<string, string>(); // criteria → entityId

  for (const v of scan.violations) {
    // Violation entity
    const violationEntity = await upsertEntity("violation", `${v.ruleId}:${scanId}`, {
      workspaceId,
      properties: {
        ruleId: v.ruleId,
        impact: v.impact,
        description: v.description.slice(0, 200),
        help: v.help.slice(0, 200),
      },
    });
    entityCount++;

    // Scan ──found──→ Violation
    await upsertEdge(scanEntity.id, violationEntity.id, "found", {
      weight: v.impact === "critical" ? 1.0 : v.impact === "serious" ? 0.8 : v.impact === "moderate" ? 0.5 : 0.3,
    });
    edgeCount++;

    // WCAG criterion entity + edge
    if (v.wcagCriteria) {
      let wcagEntityId = wcagEntities.get(v.wcagCriteria);
      if (!wcagEntityId) {
        const wcagEntity = await upsertEntity("wcag", `WCAG ${v.wcagCriteria}`, {
          workspaceId: null, // global entity
          properties: { criterion: v.wcagCriteria },
        });
        wcagEntityId = wcagEntity.id;
        wcagEntities.set(v.wcagCriteria, wcagEntityId);
        entityCount++;
      }

      // Violation ──violates──→ WCAG
      await upsertEdge(violationEntity.id, wcagEntityId, "violates");
      edgeCount++;
    }
  }

  return { entities: entityCount, edges: edgeCount };
}

// ── Graph Traversal ───────────────────────────────────────────────────────────

/**
 * Find entities by type and optional name pattern.
 */
export async function findEntities(
  type: EntityType,
  opts?: { workspaceId?: string; namePattern?: string; limit?: number },
): Promise<GraphEntity[]> {
  const results = await prisma.knowledgeEntity.findMany({
    where: {
      type,
      ...(opts?.workspaceId ? { workspaceId: opts.workspaceId } : {}),
      ...(opts?.namePattern ? { name: { contains: opts.namePattern, mode: "insensitive" as const } } : {}),
    },
    take: opts?.limit ?? 25,
    orderBy: { updatedAt: "desc" },
  });

  return results.map(mapEntity);
}

/**
 * Get all edges from/to an entity (1-hop neighborhood).
 */
export async function getNeighbors(
  entityId: string,
  opts?: { relation?: RelationType; direction?: "outgoing" | "incoming" | "both" },
): Promise<GraphEdge[]> {
  const direction = opts?.direction ?? "both";
  const relationFilter = opts?.relation ? { relation: opts.relation } : {};

  const edges: GraphEdge[] = [];

  if (direction === "outgoing" || direction === "both") {
    const outgoing = await prisma.knowledgeEdge.findMany({
      where: { fromId: entityId, ...relationFilter },
      include: {
        from: true,
        to: true,
      },
    });
    edges.push(...outgoing.map(mapEdge));
  }

  if (direction === "incoming" || direction === "both") {
    const incoming = await prisma.knowledgeEdge.findMany({
      where: { toId: entityId, ...relationFilter },
      include: {
        from: true,
        to: true,
      },
    });
    edges.push(...incoming.map(mapEdge));
  }

  return edges;
}

/**
 * Multi-hop traversal: find paths between two entity types.
 *
 * Example: "Which WCAG criteria does example.com violate?"
 *   startType: "site", startName: "example.com"
 *   endType: "wcag"
 *   maxHops: 3
 *
 * Traverses: Site → Scan → Violation → WCAG
 */
export async function findPaths(
  startId: string,
  endType: EntityType,
  opts?: { maxHops?: number; limit?: number },
): Promise<GraphPath[]> {
  const maxHops = opts?.maxHops ?? 3;
  const limit = opts?.limit ?? 10;

  // BFS traversal
  const paths: GraphPath[] = [];
  const queue: Array<{ entityId: string; path: GraphEntity[]; edges: GraphEdge[] }> = [];
  const visited = new Set<string>();

  // Seed with start entity
  const startEntity = await prisma.knowledgeEntity.findUnique({ where: { id: startId } });
  if (!startEntity) return [];

  queue.push({ entityId: startId, path: [mapEntity(startEntity)], edges: [] });
  visited.add(startId);

  while (queue.length > 0 && paths.length < limit) {
    const current = queue.shift()!;

    if (current.path.length > maxHops + 1) continue;

    // Check if we've reached the target type
    const lastEntity = current.path[current.path.length - 1];
    if (lastEntity.type === endType && current.path.length > 1) {
      paths.push({
        entities: current.path,
        edges: current.edges,
        description: current.path.map((e) => `${e.type}:${e.name}`).join(" → "),
      });
      continue; // Don't traverse further from target
    }

    // Explore neighbors
    const neighbors = await getNeighbors(current.entityId, { direction: "outgoing" });
    for (const edge of neighbors) {
      if (!visited.has(edge.to.id)) {
        visited.add(edge.to.id);
        queue.push({
          entityId: edge.to.id,
          path: [...current.path, edge.to],
          edges: [...current.edges, edge],
        });
      }
    }
  }

  return paths;
}

/**
 * Relationship search: find entities connected by a specific relation.
 *
 * Example: "What does site X violate?" → relation="violates", traverse from site
 */
export async function relationshipSearch(
  entityId: string,
  relation: RelationType,
  opts?: { depth?: number },
): Promise<GraphEntity[]> {
  const depth = opts?.depth ?? 2;
  const found: GraphEntity[] = [];
  const visited = new Set<string>([entityId]);
  let frontier = [entityId];

  for (let hop = 0; hop < depth; hop++) {
    const nextFrontier: string[] = [];

    for (const nodeId of frontier) {
      const edges = await prisma.knowledgeEdge.findMany({
        where: { fromId: nodeId, relation },
        include: { to: true },
        take: 20,
      });

      for (const edge of edges) {
        if (!visited.has(edge.to.id)) {
          visited.add(edge.to.id);
          found.push(mapEntity(edge.to));
          nextFrontier.push(edge.to.id);
        }
      }
    }

    frontier = nextFrontier;
    if (frontier.length === 0) break;
  }

  return found;
}

// ── Graph RAG Context Building ────────────────────────────────────────────────

/**
 * Build Graph RAG context for a user query.
 *
 * This is the main entry point for the RAG pipeline. Given a user question,
 * it identifies relevant entities, traverses relationships, and formats
 * the graph context for LLM injection.
 *
 * Flow:
 *   1. Extract entity references from the query (site names, rule IDs, WCAG criteria)
 *   2. Find matching entities in the graph
 *   3. Traverse relationships from those entities
 *   4. Format paths as structured LLM context
 */
export async function buildGraphContext(
  query: string,
  workspaceId: string,
): Promise<GraphSearchResult> {
  const entities: GraphEntity[] = [];
  const paths: GraphPath[] = [];

  // 1. Extract entity references from the query
  const refs = extractEntityReferences(query);

  // 2. Find entities for each reference
  for (const ref of refs) {
    const matches = await findEntities(ref.type, {
      workspaceId: ref.type === "wcag" || ref.type === "regulation" ? undefined : workspaceId,
      namePattern: ref.pattern,
      limit: 5,
    });
    entities.push(...matches);
  }

  // If no specific entities found, try a broader graph search
  if (entities.length === 0) {
    // Find recent violations for this workspace as starting points
    const recentViolations = await findEntities("violation", {
      workspaceId,
      limit: 5,
    });
    entities.push(...recentViolations);
  }

  // 3. Traverse relationships from found entities (2-hop)
  for (const entity of entities.slice(0, 5)) { // cap traversal to prevent explosion
    const entityPaths = await findPaths(entity.id, guessTargetType(query), { maxHops: 3, limit: 3 });
    paths.push(...entityPaths);
  }

  // 4. Build formatted context
  const context = formatGraphContext(entities, paths);

  return { entities, paths, context };
}

// ── Entity Extraction from Query ──────────────────────────────────────────────

interface EntityReference {
  type: EntityType;
  pattern: string;
}

/**
 * Extract entity references from a natural language query.
 * Fast heuristic extraction — no LLM call needed.
 */
export function extractEntityReferences(query: string): EntityReference[] {
  const refs: EntityReference[] = [];

  // WCAG criteria: "1.4.3", "SC 2.1.1", "WCAG 4.1.2"
  const wcagMatches = query.match(/(?:SC\s+|WCAG\s+)?(\d+\.\d+\.\d+)/g);
  if (wcagMatches) {
    for (const m of wcagMatches) {
      const num = m.match(/(\d+\.\d+\.\d+)/)?.[1];
      if (num) refs.push({ type: "wcag", pattern: num });
    }
  }

  // Rule IDs: "color-contrast", "aria-label", "image-alt"
  const ruleMatches = query.match(/\b([a-z]+-[a-z]+(?:-[a-z]+)*)\b/g);
  if (ruleMatches) {
    for (const rule of ruleMatches) {
      if (rule.length > 4) { // skip tiny matches like "in-a"
        refs.push({ type: "violation", pattern: rule });
      }
    }
  }

  // URLs: anything that looks like a domain
  const urlMatches = query.match(/(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+\.[a-zA-Z]{2,})/g);
  if (urlMatches) {
    for (const url of urlMatches) {
      refs.push({ type: "site", pattern: url });
    }
  }

  // Regulation names
  const regulationPatterns: Record<string, string> = {
    "ada": "ADA", "eaa": "EAA", "section 508": "Section 508",
    "en 301": "EN 301 549", "aoda": "AODA",
  };
  const lower = query.toLowerCase();
  for (const [pattern, name] of Object.entries(regulationPatterns)) {
    if (lower.includes(pattern)) {
      refs.push({ type: "regulation", pattern: name });
    }
  }

  return refs;
}

/**
 * Guess what type of entity the user is looking for based on their query.
 */
function guessTargetType(query: string): EntityType {
  const lower = query.toLowerCase();
  if (lower.includes("wcag") || lower.includes("criterion") || lower.includes("criteria")) return "wcag";
  if (lower.includes("regulation") || lower.includes("law") || lower.includes("compliance")) return "regulation";
  if (lower.includes("site") || lower.includes("page") || lower.includes("url")) return "site";
  if (lower.includes("who") || lower.includes("team") || lower.includes("member")) return "team_member";
  return "violation"; // default: most queries are about violations
}

// ── Context Formatting ────────────────────────────────────────────────────────

/**
 * Format graph data as structured text for LLM context injection.
 */
function formatGraphContext(entities: GraphEntity[], paths: GraphPath[]): string {
  if (entities.length === 0 && paths.length === 0) return "";

  const sections: string[] = [];

  if (entities.length > 0) {
    sections.push(
      "## Knowledge Graph — Relevant Entities\n" +
      entities.slice(0, 10).map((e) => {
        const props = e.properties ? ` (${Object.entries(e.properties).map(([k, v]) => `${k}: ${v}`).join(", ")})` : "";
        return `- **${e.type}**: ${e.name}${props}`;
      }).join("\n"),
    );
  }

  if (paths.length > 0) {
    sections.push(
      "## Knowledge Graph — Relationship Paths\n" +
      paths.slice(0, 5).map((p) => `- ${p.description}`).join("\n"),
    );
  }

  return sections.join("\n\n");
}

// ── Graph Statistics ──────────────────────────────────────────────────────────

/**
 * Get graph size stats for a workspace (dashboard display).
 */
export async function getGraphStats(workspaceId: string): Promise<{
  totalEntities: number;
  totalEdges: number;
  byType: Record<string, number>;
}> {
  const [entities, edges, typeCounts] = await Promise.all([
    prisma.knowledgeEntity.count({ where: { OR: [{ workspaceId }, { workspaceId: null }] } }),
    prisma.knowledgeEdge.count({
      where: { from: { OR: [{ workspaceId }, { workspaceId: null }] } },
    }),
    prisma.knowledgeEntity.groupBy({
      by: ["type"],
      where: { OR: [{ workspaceId }, { workspaceId: null }] },
      _count: true,
    }),
  ]);

  const byType: Record<string, number> = {};
  for (const tc of typeCounts) {
    byType[tc.type] = tc._count;
  }

  return { totalEntities: entities, totalEdges: edges, byType };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapEntity(row: {
  id: string; type: string; name: string; properties: unknown;
}): GraphEntity {
  return {
    id: row.id,
    type: row.type as EntityType,
    name: row.name,
    properties: row.properties as Record<string, unknown> | null,
  };
}

function mapEdge(row: {
  id: string; relation: string; weight: number; properties: unknown;
  from: { id: string; type: string; name: string; properties: unknown };
  to: { id: string; type: string; name: string; properties: unknown };
}): GraphEdge {
  return {
    id: row.id,
    relation: row.relation as RelationType,
    weight: row.weight,
    properties: row.properties as Record<string, unknown> | null,
    from: mapEntity(row.from),
    to: mapEntity(row.to),
  };
}
