/**
 * RegLayer — Agency Validation Schemas
 *
 * WHY: Runtime validation at API boundaries for agency operations.
 * WHAT: Zod schemas for all agency-related API inputs.
 */

import { z } from "zod";

const hexColorRegex = /^#[0-9a-fA-F]{6}$/;
const slugRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

export const createAgencySchema = z.object({
  name: z.string().min(2).max(100),
  slug: z
    .string()
    .min(3)
    .max(40)
    .regex(slugRegex, "Slug must be lowercase alphanumeric with hyphens"),
  brandName: z.string().min(2).max(100),
  primaryColor: z.string().regex(hexColorRegex, "Must be a valid hex color").default("#6366f1"),
  accentColor: z.string().regex(hexColorRegex, "Must be a valid hex color").default("#4f46e5"),
  supportEmail: z.string().email().optional(),
  customDomain: z.string().min(4).max(253).optional(),
});

export const updateBrandingSchema = z.object({
  brandName: z.string().min(2).max(100).optional(),
  primaryColor: z.string().regex(hexColorRegex, "Must be a valid hex color").optional(),
  accentColor: z.string().regex(hexColorRegex, "Must be a valid hex color").optional(),
  supportEmail: z.string().email().nullable().optional(),
  logoUrl: z.string().url().nullable().optional(),
  faviconUrl: z.string().url().nullable().optional(),
});

export const addClientSchema = z.object({
  clientName: z.string().min(2).max(100),
  contactEmail: z.string().email(),
  workspaceName: z.string().min(2).max(100).optional(),
});

export const generateApiKeySchema = z.object({
  label: z.string().min(2).max(50),
  expiresAt: z.string().datetime().optional(),
});
