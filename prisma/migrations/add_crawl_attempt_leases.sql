CREATE TABLE IF NOT EXISTS "crawl_attempt_leases" (
  "jobId" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "generation" INTEGER NOT NULL DEFAULT 1 CHECK ("generation" > 0),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "crawl_attempt_leases_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "crawl_jobs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "crawl_attempt_leases_workspaceId_expiresAt_idx"
  ON "crawl_attempt_leases" ("workspaceId", "expiresAt");