import { z } from 'zod';
import { stripJsonFences } from '../eval/runner';
import type { ClarificationQuestionView } from './model';

/**
 * The clarification ENRICHMENT protocol (owner spec 2026-09-01 §11) — a NEW,
 * attributable lineage: `lco-clarify/enrich-v1`.
 *
 * Why a dedicated protocol instead of touching generation prompts: the
 * historical generation templates are frozen (v3, PROD-003 corpus lock) or
 * already-published lineages (v4); adding outcome previews THERE would change
 * every run's output semantics and break reproducibility. Enrichment instead
 * runs once per clarification ROUND, over the blocked round's OWN validated
 * questions, and its output is PRESENTATION metadata only — never user
 * evidence, never persisted into spec artifacts. A failed or malformed
 * enrichment degrades to the Layer-0 bundle previews; it can never block
 * answering.
 *
 * Identity binding is the core integrity rule: an enriched preview is adopted
 * ONLY for an EXACT option-string match on a question that exists in this
 * round; a decision id outside the round rejects the WHOLE output (an
 * invented decision means the output cannot be trusted); an invented option
 * string is dropped (that option keeps its Layer-0 preview).
 */

export const CLARIFY_ENRICH_PROTOCOL = 'lco-clarify/enrich-v1';

/** Length ceilings for enrichment text (presentation, not evidence). */
export const MAX_PREVIEW_CHARS = 1200;
export const MAX_CONTEXT_CHARS = 600;
export const MAX_UNKNOWN_CHARS = 400;

const DEC_ID = /^DEC-\d{4}$/;

const EnrichedItemSchema = z
  .object({
    claimId: z.string().regex(DEC_ID),
    context: z.string().trim().min(1).max(MAX_CONTEXT_CHARS).optional(),
    options: z
      .array(
        z
          .object({
            option: z.string().min(1),
            outcomePreview: z.string().trim().min(1).max(MAX_PREVIEW_CHARS),
          })
          .strict(),
      )
      .max(8),
    unknowns: z.array(z.string().trim().min(1).max(MAX_UNKNOWN_CHARS)).max(5).optional(),
    dependsOn: z.array(z.string().regex(DEC_ID)).max(5).optional(),
  })
  .strict();

const EnrichOutputSchema = z
  .object({ items: z.array(EnrichedItemSchema).min(1).max(50) })
  .strict();

/** Validated enrichment for one decision. */
export interface DecisionEnrichment {
  context?: string;
  /** Preview by EXACT option string (only offered options can appear here). */
  options: Map<string, string>;
  unknowns?: string[];
  /** Dependencies that reference known decisions of this round (self excluded). */
  dependsOn: string[];
}

export type EnrichParseResult =
  | { ok: true; enrichment: Map<string, DecisionEnrichment> }
  | { ok: false; reason: string };

/**
 * Build the one-per-round enrichment prompt. Grounding rules are explicit:
 * describe only consequences supported by the decision's own alternatives
 * wording, the question, and the intent; anything else stays an honest
 * unknown. Option identity is echoed back EXACTLY — previews cannot be
 * attached to invented options.
 */
export function buildEnrichPrompt(intent: string, questions: ClarificationQuestionView[]): string {
  const items = questions.map((q) =>
    [
      `- decision ${q.claimId}:`,
      `  question: ${q.question}`,
      q.options.length > 0
        ? `  options (echo the option string back EXACTLY as given):\n${q.options
            .map((o) => `    - "${o.option}" (recorded trade-off: ${o.preview.text})`)
            .join('\n')}`
        : '  options: none — the user will answer in their own words',
    ].join('\n'),
  );
  return [
    `ROLE: You enrich clarification questions for a product owner. Protocol: ${CLARIFY_ENRICH_PROTOCOL}.`,
    'For each decision below, write the business-language CONSEQUENCE the product owner would see if they chose each suggested option: what the application and its workflows will do then, in the owner\'s vocabulary (who can do what, and what happens next).',
    'USER INTENT (verbatim):',
    '"""',
    intent,
    '"""',
    'DECISIONS:',
    ...items,
    [
      'RULES (binding):',
      '- Ground every preview ONLY in this decision\'s own options and recorded trade-offs, the question, and the user intent. Do NOT invent additional requirements, behaviors, limits, or integrations anything else implies.',
      '- If a consequence is genuinely unknown from this material, do not guess it: list it under unknowns instead (plain language, e.g. "how long the stock is held for the first order").',
      '- Echo each option string back EXACTLY as given — a preview is attached to an option by exact text match; renamed or invented options are discarded.',
      '- Only the decisions listed above exist; do not enrich, add, or merge others.',
      '- dependsOn: list other decision ids from this set whose ANSWER changes what this question means; never the decision itself.',
      '- context: at most a short sentence situating the question for the owner (what business situation raises it).',
    ].join('\n'),
    'OUTPUT CONTRACT: output ONLY a single JSON value — {"items":[{"claimId":"DEC-NNNN","context":string?,"options":[{"option":string,"outcomePreview":string}],"unknowns":string[]?,"dependsOn":string[]?}]}. No prose, no fences.',
  ].join('\n');
}

/**
 * Parse + validate an enrichment completion against the round's questions.
 * Fail-closed on invented decisions; per-option exact-match adoption;
 * unknown/self dependencies are dropped.
 */
export function parseEnrichment(text: string, questions: ClarificationQuestionView[]): EnrichParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(stripJsonFences(text));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `enrichment output is not valid JSON (${msg}) — keeping bundle previews` };
  }
  const parsed = EnrichOutputSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      reason: `enrichment output failed schema validation (${first?.path.join('.') ?? '<root>'}: ${first?.message ?? 'unknown'}) — keeping bundle previews`,
    };
  }

  const known = new Map(questions.map((q) => [q.claimId, q]));
  const enrichment = new Map<string, DecisionEnrichment>();
  for (const item of parsed.data.items) {
    const question = known.get(item.claimId);
    if (question === undefined) {
      return {
        ok: false,
        reason: `enrichment output invents decision '${item.claimId}' (not in this round's questions) — the whole output is discarded, keeping bundle previews`,
      };
    }
    const options = new Map<string, string>();
    for (const o of item.options) {
      if (question.options.some((qo) => qo.option === o.option)) {
        options.set(o.option, o.outcomePreview);
      }
      // invented option strings are dropped silently-by-rule (the question
      // view is never extended; that option keeps its Layer-0 preview)
    }
    const dependsOn = (item.dependsOn ?? []).filter(
      (id) => id !== item.claimId && known.has(id),
    );
    enrichment.set(item.claimId, {
      ...(item.context !== undefined ? { context: item.context } : {}),
      options,
      ...(item.unknowns !== undefined && item.unknowns.length > 0 ? { unknowns: item.unknowns } : {}),
      dependsOn,
    });
  }
  return { ok: true, enrichment };
}

/**
 * Apply validated enrichment to question views: exact-match options get
 * Layer-1 previews; context/unknowns/dependsOn attach per decision. Views are
 * copied, never mutated; questions without enrichment pass through unchanged.
 */
export function applyEnrichment(
  views: ClarificationQuestionView[],
  enrichment: Map<string, DecisionEnrichment>,
): ClarificationQuestionView[] {
  return views.map((v) => {
    const e = enrichment.get(v.claimId);
    if (e === undefined) return v;
    return {
      ...v,
      ...(e.context !== undefined ? { context: e.context } : {}),
      options: v.options.map((o) => {
        const preview = e.options.get(o.option);
        return preview === undefined ? o : { option: o.option, preview: { source: 'enriched' as const, text: preview } };
      }),
      ...(e.unknowns !== undefined ? { outcomeUnknowns: e.unknowns } : {}),
      dependsOn: e.dependsOn,
    };
  });
}
