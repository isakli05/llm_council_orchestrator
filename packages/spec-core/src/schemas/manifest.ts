import { z } from 'zod';
import { ComplexityProfileSchema, Sha256Schema, SpecStateSchema } from './common';

export const ManifestSchema = z.object({
  spec_schema: z.literal('lco-spec/1.0'),
  /** 1'den başlar, changeset ++ eder */
  spec_version: z.number().int().positive(),
  project: z.object({
    name: z.string().min(1),
    mode: z.enum(['greenfield', 'legacy']),
  }),
  complexity_profile: ComplexityProfileSchema,
  evidence_snapshot: z.object({
    pack_hash: Sha256Schema,
    collected_at: z.string().min(1),
  }),
  state: SpecStateSchema,
  council_run: z.object({
    run_id: z.string().min(1),
    config_fingerprint: z.string().min(1),
  }),
  /** görece yol -> 'sha256:...' */
  artifact_hashes: z.record(z.string()),
  unresolved_count: z.number().int().nonnegative(),
  blocking_count: z.number().int().nonnegative(),
  target_runtime: z.object({
    platform: z.string().min(1),
    stack: z.string().min(1),
  }),
  frozen_at: z.string().min(1).optional(),
});
export type Manifest = z.infer<typeof ManifestSchema>;
