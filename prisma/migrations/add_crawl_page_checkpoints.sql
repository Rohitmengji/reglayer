CREATE TABLE IF NOT EXISTS "crawl_page_checkpoints" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "scanId" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crawl_page_checkpoints_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "crawl_jobs" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "crawl_page_checkpoints_scanId_fkey"
    FOREIGN KEY ("scanId") REFERENCES "scans" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "crawl_page_checkpoints_scanId_key"
  ON "crawl_page_checkpoints" ("scanId");
CREATE INDEX IF NOT EXISTS "crawl_page_checkpoints_workspaceId_jobId_idx"
  ON "crawl_page_checkpoints" ("workspaceId", "jobId");