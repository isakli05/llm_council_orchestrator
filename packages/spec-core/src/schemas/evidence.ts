import { z } from 'zod';
import { EvidenceIdSchema, Sha256Schema } from './common';
import { INPUT_CEILINGS as C } from './limits';

/**
 * A verified code anchor (Legacy Renewal V1): the payload binding an evidence
 * item to a specific file state in the analyzed repository.
 *
 * CANONICAL HASH CONTRACT: `content_hash` is sha256 over the file's RAW bytes
 * at capture time — no newline normalization, no encoding transformation. Any
 * byte difference (including line endings) is staleness. Line numbers are
 * provenance only; verification is whole-file.
 */
export const CodeAnchorPayloadSchema = z
  .object({
    /** Graphify node id, when the anchor originates from a graph node. */
    node_id: z.string().min(1).max(500).optional(),
    /** Repo-relative POSIX path (forward slashes, no .. / no absolute). */
    path: z.string().min(1).max(C.charsFilePath, 'anchor path exceeds the length ceiling (input ceiling)'),
    content_hash: Sha256Schema,
    start_line: z.number().int().positive().optional(),
    end_line: z.number().int().positive().optional(),
  })
  .strict()
  .refine((a) => a.end_line === undefined || a.start_line === undefined || a.end_line >= a.start_line, {
    message: 'anchor end_line must be >= start_line',
  });

const evidenceCommon = {
  id: EvidenceIdSchema,
  source: z.string().min(1).max(C.charsFilePath, 'evidence source exceeds the length ceiling (input ceiling)'),
  hash: Sha256Schema,
};

/**
 * Evidence items (renewal-extended). Two strict shapes in a union:
 *
 *   - kind 'code_anchor' REQUIRES an `anchor` payload, and `hash` MUST equal
 *     `anchor.content_hash` (one canonical whole-file hash — the AnchorVerifier
 *     recomputes it from source; it never trusts the stored value);
 *   - every pre-existing kind accepts NO anchor (strictness forbids the key),
 *     so existing bundles are unaffected — backward compatible by construction.
 */
export const EvidenceItemSchema = z.union([
  z
    .object({
      ...evidenceCommon,
      kind: z.literal('code_anchor'),
      anchor: CodeAnchorPayloadSchema,
    })
    .strict()
    .refine((item) => item.hash === item.anchor.content_hash, {
      message: "kind 'code_anchor' requires hash === anchor.content_hash (the canonical whole-file hash)",
    }),
  z
    .object({
      ...evidenceCommon,
      kind: z.enum(['user_input', 'code', 'runtime', 'doc', 'constraint']),
    })
    .strict(),
]);
