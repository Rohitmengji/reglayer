/**
 * RegLayer — Knowledge Connectors Service
 *
 * WHY: Enterprise teams don't want to manually upload docs. They want the AI
 *      to automatically ingest their GitHub repos, Notion wikis, and Confluence
 *      pages — and stay in sync when content changes.
 * WHAT: Connector framework: authenticate → fetch content → chunk → embed → index.
 * HOW: Each connector implements the KnowledgeConnector interface. Syncs on
 *      schedule or webhook trigger.
 *
 * CONNECTORS:
 *   - GitHub: Fetch markdown files from repos (README, docs/, wiki)
 *   - Notion: Fetch pages from a workspace via API
 *   - URL: Scrape and parse web pages
 */

import "server-only";

import { processDocument, createDocument } from "@/lib/ai/knowledge/service";
import { validateScanUrl, resolvesToInternalIp } from "@/lib/validations/ssrf";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ConnectorType = "github" | "notion" | "url" | "confluence";
export type SyncStatus = "idle" | "syncing" | "error" | "success";

export interface ConnectorConfig {
  type: ConnectorType;
  name: string;
  config: Record<string, string>; // type-specific: token, repo, page_id, etc.
  syncSchedule?: string; // cron expression
}

export interface SyncResult {
  connector: string;
  documentsProcessed: number;
  errors: string[];
  durationMs: number;
}

// ── GitHub Connector ──────────────────────────────────────────────────────────

/**
 * Fetch markdown/text files from a GitHub repository.
 * Supports: README, docs/ folder, wiki pages.
 */
export async function syncGitHub(opts: {
  owner: string;
  repo: string;
  token: string;
  branch?: string;
  paths?: string[]; // specific paths to fetch (default: auto-detect docs)
  workspaceId: string;
  userId: string;
}): Promise<SyncResult> {
  const start = Date.now();
  const errors: string[] = [];
  let docsProcessed = 0;
  const branch = opts.branch || "main";
  const baseUrl = `https://api.github.com/repos/${opts.owner}/${opts.repo}`;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "RegLayer-Knowledge-Connector",
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;

  // Determine which paths to fetch
  const pathsToFetch = opts.paths?.length
    ? opts.paths
    : ["README.md", "docs", "CONTRIBUTING.md", "ACCESSIBILITY.md"];

  for (const path of pathsToFetch) {
    try {
      const url = `${baseUrl}/contents/${encodeURIComponent(path)}?ref=${branch}`;
      const res = await fetch(url, { headers });

      if (!res.ok) {
        if (res.status !== 404) errors.push(`${path}: HTTP ${res.status}`);
        continue;
      }

      const data = await res.json();

      if (Array.isArray(data)) {
        // Directory — fetch each markdown file
        const mdFiles = data.filter((f: { name: string; type: string }) =>
          f.type === "file" && /\.(md|mdx|txt|rst)$/i.test(f.name)
        );

        for (const file of mdFiles.slice(0, 20)) { // max 20 files per dir
          try {
            const fileRes = await fetch(file.download_url, { headers });
            if (!fileRes.ok) continue;
            const content = await fileRes.text();
            if (content.trim().length < 50) continue; // skip near-empty files

            const doc = await createDocument({
              title: `${opts.repo}/${file.path}`,
              source: `github:${opts.owner}/${opts.repo}/${file.path}`,
              mimeType: "text/markdown",
              sizeBytes: new Blob([content]).size,
              workspaceId: opts.workspaceId,
              uploadedBy: opts.userId,
            });

            await processDocument(doc.id, content);
            docsProcessed++;
          } catch (err) {
            errors.push(`${file.path}: ${err instanceof Error ? err.message : "unknown"}`);
          }
        }
      } else if (data.type === "file" && data.download_url) {
        // Single file
        const fileRes = await fetch(data.download_url, { headers });
        if (!fileRes.ok) continue;
        const content = await fileRes.text();
        if (content.trim().length < 50) continue;

        const doc = await createDocument({
          title: `${opts.repo}/${path}`,
          source: `github:${opts.owner}/${opts.repo}/${path}`,
          mimeType: "text/markdown",
          sizeBytes: new Blob([content]).size,
          workspaceId: opts.workspaceId,
          uploadedBy: opts.userId,
        });

        await processDocument(doc.id, content);
        docsProcessed++;
      }
    } catch (err) {
      errors.push(`${path}: ${err instanceof Error ? err.message : "unknown"}`);
    }
  }

  return {
    connector: `github:${opts.owner}/${opts.repo}`,
    documentsProcessed: docsProcessed,
    errors,
    durationMs: Date.now() - start,
  };
}

// ── Notion Connector ──────────────────────────────────────────────────────────

/**
 * Fetch pages from a Notion workspace/database.
 * Requires: Notion integration token + page/database IDs.
 */
export async function syncNotion(opts: {
  token: string;
  pageIds?: string[]; // specific pages
  databaseId?: string; // or a database to list all pages from
  workspaceId: string;
  userId: string;
}): Promise<SyncResult> {
  const start = Date.now();
  const errors: string[] = [];
  let docsProcessed = 0;
  const headers = {
    Authorization: `Bearer ${opts.token}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
  };

  const pageIds: string[] = [...(opts.pageIds ?? [])];

  // If database ID provided, list all pages from it
  if (opts.databaseId) {
    try {
      const res = await fetch(`https://api.notion.com/v1/databases/${opts.databaseId}/query`, {
        method: "POST",
        headers,
        body: JSON.stringify({ page_size: 50 }),
      });
      if (res.ok) {
        const data = await res.json();
        for (const page of data.results ?? []) {
          pageIds.push(page.id);
        }
      } else {
        errors.push(`Database query failed: HTTP ${res.status}`);
      }
    } catch (err) {
      errors.push(`Database query error: ${err instanceof Error ? err.message : "unknown"}`);
    }
  }

  // Fetch each page's content
  for (const pageId of pageIds.slice(0, 30)) { // max 30 pages
    try {
      // Get page title
      const pageRes = await fetch(`https://api.notion.com/v1/pages/${pageId}`, { headers });
      if (!pageRes.ok) { errors.push(`Page ${pageId}: HTTP ${pageRes.status}`); continue; }
      const pageData = await pageRes.json();
      const title = extractNotionTitle(pageData) || `Notion Page ${pageId.slice(0, 8)}`;

      // Get blocks (content)
      const blocksRes = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children?page_size=100`, { headers });
      if (!blocksRes.ok) { errors.push(`Blocks ${pageId}: HTTP ${blocksRes.status}`); continue; }
      const blocksData = await blocksRes.json();
      const content = extractNotionText(blocksData.results ?? []);

      if (content.trim().length < 50) continue;

      const doc = await createDocument({
        title,
        source: `notion:${pageId}`,
        mimeType: "text/plain",
        sizeBytes: new Blob([content]).size,
        workspaceId: opts.workspaceId,
        uploadedBy: opts.userId,
      });

      await processDocument(doc.id, content);
      docsProcessed++;
    } catch (err) {
      errors.push(`Page ${pageId}: ${err instanceof Error ? err.message : "unknown"}`);
    }
  }

  return {
    connector: "notion",
    documentsProcessed: docsProcessed,
    errors,
    durationMs: Date.now() - start,
  };
}

// ── URL Connector ─────────────────────────────────────────────────────────────

/**
 * Fetch and parse web page content for the knowledge base.
 */
export async function syncURL(opts: {
  urls: string[];
  workspaceId: string;
  userId: string;
}): Promise<SyncResult> {
  const start = Date.now();
  const errors: string[] = [];
  let docsProcessed = 0;

  for (const url of opts.urls.slice(0, 10)) {
    try {
      // SSRF: the URL list is user-supplied and fetched server-side. Reject
      // literal internal IPs (validateScanUrl) AND public hostnames that
      // resolve to internal addresses (resolvesToInternalIp, fail-closed).
      const ssrfErr = validateScanUrl(url);
      if (ssrfErr) { errors.push(`${url}: ${ssrfErr}`); continue; }
      if (await resolvesToInternalIp(url)) {
        errors.push(`${url}: resolves to internal address (blocked)`);
        continue;
      }

      const res = await fetch(url, {
        headers: { "User-Agent": "RegLayer-Knowledge-Bot/1.0" },
        signal: AbortSignal.timeout(15000),
        redirect: "error",
      });
      if (!res.ok) { errors.push(`${url}: HTTP ${res.status}`); continue; }

      const html = await res.text();
      // Simple HTML to text extraction (strip tags)
      const content = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      if (content.length < 100) continue;

      const doc = await createDocument({
        title: new URL(url).hostname + new URL(url).pathname,
        source: `url:${url}`,
        mimeType: "text/html",
        sizeBytes: new Blob([content]).size,
        workspaceId: opts.workspaceId,
        uploadedBy: opts.userId,
      });

      await processDocument(doc.id, content.slice(0, 500_000)); // 500K char limit
      docsProcessed++;
    } catch (err) {
      errors.push(`${url}: ${err instanceof Error ? err.message : "unknown"}`);
    }
  }

  return {
    connector: "url",
    documentsProcessed: docsProcessed,
    errors,
    durationMs: Date.now() - start,
  };
}

// ── Notion Helpers ────────────────────────────────────────────────────────────

function extractNotionTitle(page: Record<string, unknown>): string {
  const props = page.properties as Record<string, unknown> | undefined;
  if (!props) return "";
  for (const val of Object.values(props)) {
    const prop = val as { type?: string; title?: Array<{ plain_text: string }> };
    if (prop.type === "title" && prop.title?.length) {
      return prop.title.map((t) => t.plain_text).join("");
    }
  }
  return "";
}

function extractNotionText(blocks: Array<Record<string, unknown>>): string {
  const parts: string[] = [];
  for (const block of blocks) {
    const type = block.type as string;
    const content = block[type] as { rich_text?: Array<{ plain_text: string }> } | undefined;
    if (content?.rich_text) {
      const text = content.rich_text.map((t) => t.plain_text).join("");
      if (text) parts.push(text);
    }
  }
  return parts.join("\n\n");
}
