-- RegLayer — Upgrade vector index from IVFFlat to HNSW
-- 
-- WHY: HNSW (Hierarchical Navigable Small World) provides better recall at scale
-- compared to IVFFlat, without requiring periodic re-training as data grows.
-- At 10K+ violations, HNSW outperforms IVFFlat significantly.
--
-- WHEN TO RUN: After add_pgvector.sql, when violation count exceeds ~5K rows.
-- Run via: psql $DATABASE_URL -f prisma/migrations/add_hnsw_index.sql
--
-- NOTES:
-- - m=16: max connections per layer (higher = better recall, more memory)
-- - ef_construction=64: build-time search width (higher = better recall, slower build)
-- - This is a CREATE/DROP operation — zero-downtime since we create first, then drop old.

-- 1. Create the HNSW index (runs concurrently — doesn't lock the table)
CREATE INDEX CONCURRENTLY IF NOT EXISTS violations_embedding_hnsw_idx
ON violations
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- 2. Drop the old IVFFlat index (only after HNSW is ready)
DROP INDEX IF EXISTS violations_embedding_idx;

-- 3. Set default search ef for queries (higher = better recall, slower queries)
-- This can be tuned per-session: SET hnsw.ef_search = 100;
-- Default is 40, which provides ~95% recall for most workloads.
