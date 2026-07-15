-- RegLayer — Enable pgvector extension and add vector columns
-- This migration adds semantic search capability to violations.
--
-- HOW TO RUN:
-- Connect to your Neon database and execute this script.
-- Neon supports pgvector out of the box — no installation needed.
--
-- Run via: psql $DATABASE_URL -f prisma/migrations/add_pgvector.sql
-- Or paste into the Neon SQL Editor.

-- 1. Enable the pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Add the embedding column to violations
ALTER TABLE violations
ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- 3. Create an index for fast similarity search
-- IVFFlat is good for <1M vectors. For larger datasets, use HNSW.
-- lists = sqrt(row_count) is the recommended starting point.
-- With ~10K violations, lists=100 is appropriate.
CREATE INDEX IF NOT EXISTS violations_embedding_idx
ON violations
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- 4. Verify
SELECT 'pgvector extension enabled' AS status
WHERE EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector');
