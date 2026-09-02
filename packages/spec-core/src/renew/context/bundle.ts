/**
 * ContextBundle — the deterministic, provenance-carrying context contract
 * (audit 16 §C context row, 20 §2.5). Every item records WHERE it came from
 * (graph / file-read / derived); slice text is always POST-REDACTION (the
 * original bytes never persist here). This is the seam a future semantic
 * provider would slot into — V1 has exactly one deterministic implementation.
 */
import { z } from 'zod';

export const ContextItemSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('node'),
      node_id: z.string(),
      label: z.string().optional(),
      source_file: z.string().optional(),
      source_location: z.string().optional(),
      community: z.number().optional(),
      provenance: z.literal('graph'),
    })
    .strict(),
  z
    .object({
      kind: z.literal('edge'),
      source: z.string(),
      target: z.string(),
      relation: z.string().optional(),
      confidence: z.string().optional(),
      provenance: z.literal('graph'),
    })
    .strict(),
  z
    .object({
      kind: z.literal('file_slice'),
      path: z.string(),
      start_line: z.number().int().positive(),
      end_line: z.number().int().positive(),
      text: z.string(),
      /** Whole-file canonical hash from the snapshot manifest — the anchor
       * handle the recovery prompt exposes and the AnchorVerifier recomputes. */
      content_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
      redactions: z.number().int().nonnegative(),
      /** TRUST KERNEL (S3-H-01): identity of the EXACT supplied material —
       *  hash over the slice text as supplied and the file's true line count.
       *  Context records are built from these; citations may never cover
       *  bytes outside [start_line, end_line]. */
      slice_text_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/).optional(),
      file_line_count: z.number().int().positive().optional(),
      /** The node whose location selected this slice (bound at supply). */
      node_id: z.string().optional(),
      provenance: z.literal('file-read'),
    })
    .strict(),
  z
    .object({
      kind: z.literal('structural_fact'),
      text: z.string(),
      node_id: z.string().optional(),
      provenance: z.literal('derived'),
    })
    .strict(),
]);

export const ContextBundleSchema = z
  .object({
    /** The scope this bundle was assembled for (echoed for provenance). */
    scope: z.record(z.unknown()),
    items: z.array(ContextItemSchema),
    truncated: z.boolean(),
    total_chars: z.number().int().nonnegative(),
    warnings: z.array(z.string()),
    /**
     * H-03: true when the scope claims source-grounded recovery but NO
     * anchorable file slice could fit the budget — an empty-anchored
     * "validated success" is forbidden downstream (the pipeline blocks).
     */
    insufficient_context: z.boolean().optional(),
  })
  .strict();

export type ContextItem = z.infer<typeof ContextItemSchema>;
export type ContextBundle = z.infer<typeof ContextBundleSchema>;

export interface ContextLimits {
  maxItems: number;
  maxTotalChars: number;
  maxFileSliceChars: number;
  maxSliceLines: number;
  maxSliceFiles: number;
}

/** Bounded, task-specific context — never whole-repository dumps. */
export const RENEW_CONTEXT_LIMITS: ContextLimits = {
  maxItems: 200,
  maxTotalChars: 200_000,
  maxFileSliceChars: 8_000,
  maxSliceLines: 200,
  maxSliceFiles: 12,
};
