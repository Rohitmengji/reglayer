/**
 * ---------------------------------------------------------
 * RegLayer — Validation Schemas
 * ---------------------------------------------------------
 *
 * Purpose:
 * Zod schemas for runtime validation at system boundaries.
 *
 * Why this exists:
 * TypeScript types vanish at runtime. Zod schemas validate
 * incoming data at API boundaries, ensuring data integrity
 * before it enters the processing pipeline.
 *
 * Engineering Notes:
 * - Every API endpoint MUST validate input with these schemas.
 * - Schemas are the single source of truth for data shape.
 * - Types can be inferred from schemas using z.infer<>.
 * ---------------------------------------------------------
 */

import { z } from "zod";

export const scanRequestSchema = z.object({
  url: z
    .string()
    .url("Must be a valid URL")
    .refine(
      (url) => url.startsWith("http://") || url.startsWith("https://"),
      "URL must start with http:// or https://"
    ),
  options: z
    .object({
      includeScreenshot: z.boolean().optional(),
      waitForSelector: z.string().optional(),
      timeout: z.number().min(1000).max(60000).optional(),
      tags: z.array(z.string()).optional(),
    })
    .optional(),
});

export type ValidatedScanRequest = z.infer<typeof scanRequestSchema>;
