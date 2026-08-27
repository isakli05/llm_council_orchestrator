import { z } from 'zod';
import { EvidenceIdSchema } from './common';

/**
 * EXPERIMENTAL, şema-only (PROD-005): derleyici v1'de legacy paketi pass-through
 * taşır — hiçbir dönüşüm/analiz semantiği YOKTUR; `generate`/`init` bu modu
 * SEÇEMEZ (yalnızca p-mini | p-standard). Legacy spec'in tek yolu elle yazılmış
 * JSON'dur; closure yalnızca `preserve_change_drop[].evidence` referanslarını
 * denetler.
 *
 * STRICT-WHEN-PRESENT: blok bundle'da VARSA tam olmalıdır (hem `as_is_summary`
 * hem en az bir `preserve_change_drop` girdisi). `{}` veya yarım paket şema
 * hatasıdır — "legacy paket yok" demenin tek yolu bloğu hiç yazmamaktır.
 * (Tightening, kasıtlı: önceki `.partial()` boş/anlamsız bir paketi şema-geçerli
 * yapıyordu — denetimin PROD-005 bulgusu tam olarak buydu.)
 */
export const LegacyPackageSchema = z
  .object({
    as_is_summary: z.string().min(1),
    preserve_change_drop: z
      .array(
        z
          .object({
            behavior: z.string().min(1),
            decision: z.enum(['preserve', 'change', 'drop']),
            rationale: z.string().min(1),
            evidence: z.array(EvidenceIdSchema),
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .describe(
    'EXPERIMENTAL schema-only legacy package (no transformation semantics; ' +
      'hand-authored JSON is the only path). Strict-when-present: if present it ' +
      "must be COMPLETE — an empty or partial block is a schema error; omit the " +
      'block entirely for a non-legacy spec',
  );
