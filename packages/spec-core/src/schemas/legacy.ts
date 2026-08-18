import { z } from 'zod';
import { IdSchema } from './common';

/**
 * Şema-only; compiler v1'de pass-through.
 * p-legacy profilinde zorunlu kılan kural lint'te DEĞİL — şema optional; derive edilir.
 */
export const LegacyPackageSchema = z
  .object({
    as_is_summary: z.string().min(1),
    preserve_change_drop: z
      .array(
        z.object({
          behavior: z.string().min(1),
          decision: z.enum(['preserve', 'change', 'drop']),
          rationale: z.string().min(1),
          evidence: z.array(IdSchema),
        }),
      )
      .min(1),
  })
  .partial();
