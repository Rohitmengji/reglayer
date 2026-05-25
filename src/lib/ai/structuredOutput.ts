/**
 * ---------------------------------------------------------
 * RegLayer — AI Structured Output
 * ---------------------------------------------------------
 *
 * Purpose:
 * Type definitions and utilities for structured AI outputs.
 *
 * Why this exists:
 * AI responses must conform to strict schemas for
 * reliable integration with the compliance pipeline.
 * Unstructured AI output is not production-grade.
 *
 * Engineering Notes:
 * - All AI outputs must match these schemas.
 * - Validated with Zod before entering the system.
 * - AI is an augmentation layer, not a decision layer.
 * ---------------------------------------------------------
 */

import { z } from "zod";

export const aiExplanationSchema = z.object({
  summary: z.string().max(500),
  impact: z.string().max(300),
  recommendation: z.string().max(500),
  technicalDetail: z.string().max(1000).optional(),
  confidence: z.number().min(0).max(1),
});

export type AIExplanation = z.infer<typeof aiExplanationSchema>;

export const aiComplianceSummarySchema = z.object({
  overallAssessment: z.string().max(1000),
  topRisks: z.array(z.string()).max(5),
  recommendations: z.array(z.string()).max(5),
  regulatoryContext: z.string().max(500).optional(),
});

export type AIComplianceSummary = z.infer<typeof aiComplianceSummarySchema>;
