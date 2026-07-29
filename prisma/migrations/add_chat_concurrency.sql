-- Chat concurrency control + cross-tab generation lease
--
-- WHY: `POST /api/ai/conversations` saves by delete-all-and-recreate keyed on the
-- conversation id. Two tabs saving the same conversation silently clobbered one
-- another — last writer won, the loser's messages were gone, and nothing errored.
-- Separately, the generation lease lived only in browser memory, so it could not
-- prevent two tabs generating into the same conversation at once.
--
-- SAFETY: purely additive. Every column is nullable or defaulted, so existing rows
-- remain valid and older application code continues to work unchanged. No data is
-- read, moved, or deleted.
--
-- APPLY WITH:  psql "$DATABASE_URL" -f prisma/migrations/add_chat_concurrency.sql
--
-- Written by hand rather than via `prisma migrate dev` because the local migration
-- history is out of sync with the deployed database, and Prisma's remedy for that is
-- to RESET the schema — which would destroy production data.

ALTER TABLE "chat_conversations"
  ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "chat_conversations"
  ADD COLUMN IF NOT EXISTS "runOwner" TEXT;

ALTER TABLE "chat_conversations"
  ADD COLUMN IF NOT EXISTS "runExpires" TIMESTAMP(3);

-- Lets the sweeper find expired leases without scanning the table.
CREATE INDEX IF NOT EXISTS "chat_conversations_runExpires_idx"
  ON "chat_conversations" ("runExpires")
  WHERE "runExpires" IS NOT NULL;
