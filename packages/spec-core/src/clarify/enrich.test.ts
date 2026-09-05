import { describe, it, expect } from 'vitest';
import type { ClarificationQuestion } from '../eval/runner';
import { questionViews, type ClarificationQuestionView } from './model';
import {
  CLARIFY_ENRICH_PROTOCOL,
  buildEnrichPrompt,
  parseEnrichment,
  applyEnrichment,
} from './enrich';

/**
 * §11 — the dedicated enrichment protocol (lco-clarify/enrich-v1): ONE
 * structured generation per clarification round turns the bundle's own
 * trade-off wording into full business-language outcome previews, bound to the
 * EXACT option/decision identity (no invented options, no invented decisions,
 * no invented requirements). Deterministic from the UI's perspective: previews
 * arrive with the question set, never per click/keystroke.
 */

const QUESTIONS: ClarificationQuestion[] = [
  {
    claimId: 'DEC-0004',
    question: 'If two customers try to complete the remaining quantity for the same fabric at the same time, what should the system do?',
    impact: 'high',
    alternatives: [
      { option: 'first confirmed order gets priority', rejected_because: 'the other customer sees an out-of-stock message' },
      { option: 'accept both and split the stock', rejected_because: 'risks selling more than available' },
    ],
  },
  {
    claimId: 'DEC-0007',
    question: 'Should orders require company approval before fulfillment?',
    impact: 'medium',
    alternatives: [{ option: 'yes, an approver confirms each order', rejected_because: 'customers wait for approval before fulfillment' }],
  },
];

function views(): ClarificationQuestionView[] {
  return questionViews(QUESTIONS, 1);
}

describe('buildEnrichPrompt', () => {
  it('carries the protocol identity, the intent, the verbatim questions/options, and the no-invention rules', () => {
    const prompt = buildEnrichPrompt('I need a B2B ordering platform for textile dealers.', views());
    expect(prompt).toContain(CLARIFY_ENRICH_PROTOCOL);
    expect(prompt).toContain('B2B ordering platform');
    expect(prompt).toContain('DEC-0004');
    expect(prompt).toContain('first confirmed order gets priority');
    expect(prompt).toContain('the other customer sees an out-of-stock message');
    // binding rules (§11): option identity is fixed; unknown consequences stay unknown
    expect(prompt).toContain('EXACTLY');
    expect(prompt.toLowerCase()).toContain('do not invent');
    // output contract: single JSON value
    expect(prompt).toContain('"items"');
  });
});

describe('parseEnrichment (identity-bound validation)', () => {
  const good = JSON.stringify({
    items: [
      {
        claimId: 'DEC-0004',
        context: 'Two dealers may want the last meters of the same fabric at the same moment.',
        options: [
          { option: 'first confirmed order gets priority', outcomePreview: 'The first confirmed order takes the remaining quantity; the second dealer immediately sees that the fabric is out of stock and cannot order it.' },
          { option: 'accept both and split the stock', outcomePreview: 'Both orders are accepted and the available quantity is divided between them; each dealer may receive less than they asked for.' },
        ],
        unknowns: ['How long an unconfirmed order may hold the remaining quantity'],
        dependsOn: [],
      },
      {
        claimId: 'DEC-0007',
        options: [
          { option: 'yes, an approver confirms each order', outcomePreview: 'Orders stay pending until an authorized user approves them; only then does fulfillment start.' },
        ],
        dependsOn: ['DEC-0004'],
      },
    ],
  });

  it('accepts a well-formed output and binds previews to the exact option strings', () => {
    const parsed = parseEnrichment(good, views());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const v04 = applyEnrichment(views(), parsed.enrichment).find((q) => q.claimId === 'DEC-0004')!;
    expect(v04.context).toContain('same moment');
    expect(v04.options[0]!.preview).toEqual({
      source: 'enriched',
      text: 'The first confirmed order takes the remaining quantity; the second dealer immediately sees that the fabric is out of stock and cannot order it.',
    });
    // untouched question keeps Layer-0 for options the output did not mention
    expect(v04.outcomeUnknowns).toEqual(['How long an unconfirmed order may hold the remaining quantity']);
    const v07 = applyEnrichment(views(), parsed.enrichment).find((q) => q.claimId === 'DEC-0007')!;
    expect(v07.dependsOn).toEqual(['DEC-0004']);
    expect(v07.options[0]!.preview.source).toBe('enriched');
  });

  it('rejects malformed JSON / non-schema output (degrade to Layer-0, never block answering)', () => {
    expect(!parseEnrichment('not json', views()).ok).toBe(true);
    expect(!parseEnrichment('{"items": []}', views()).ok).toBe(true);
    expect(!parseEnrichment('{"items": [{"claimId": "DEC-0004"}]}', views()).ok).toBe(true); // options missing entirely is fine? no: strict shape requires arrays
    expect(!parseEnrichment(JSON.stringify({ stuff: 1 }), views()).ok).toBe(true);
  });

  it('FAILS the whole output when a decision id is invented (fail-closed, no partial trust)', () => {
    const invented = JSON.stringify({ items: [{ claimId: 'DEC-0099', options: [] }] });
    const parsed = parseEnrichment(invented, views());
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toContain('DEC-0099');
  });

  it('drops a preview whose option string does not exactly match an offered option (keeps the rest)', () => {
    const partial = JSON.stringify({
      items: [
        {
          claimId: 'DEC-0004',
          options: [
            { option: 'first confirmed order gets priority', outcomePreview: 'Valid preview.' },
            { option: 'coin flip decides', outcomePreview: 'Invented option preview.' },
          ],
        },
      ],
    });
    const parsed = parseEnrichment(partial, views());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const v04 = applyEnrichment(views(), parsed.enrichment).find((q) => q.claimId === 'DEC-0004')!;
    expect(v04.options[0]!.preview.source).toBe('enriched');
    // the invented option never enters the question view — it cannot be selected
    expect(v04.options.some((o) => o.option === 'coin flip decides')).toBe(false);
  });

  it('drops dependsOn entries that are unknown decisions or the decision itself (noise degrades; identity fabrication does not)', () => {
    const bad = JSON.stringify({ items: [{ claimId: 'DEC-0004', options: [], dependsOn: ['DEC-0004'] }] });
    const self = parseEnrichment(bad, views());
    expect(self.ok).toBe(true); // self-dependency is dropped, not fatal
    if (self.ok) expect(self.enrichment.get('DEC-0004')!.dependsOn).toEqual([]);
    const unknown = JSON.stringify({ items: [{ claimId: 'DEC-0004', options: [], dependsOn: ['DEC-0042'] }] });
    const parsed = parseEnrichment(unknown, views());
    expect(parsed.ok).toBe(true); // unknown dep is dropped, not fatal
    if (parsed.ok) expect(parsed.enrichment.get('DEC-0004')!.dependsOn).toEqual([]);
  });

  it('enforces length caps on preview/context text', () => {
    const long = 'y'.repeat(1201);
    const bad = JSON.stringify({ items: [{ claimId: 'DEC-0004', options: [{ option: 'first confirmed order gets priority', outcomePreview: long }] }] });
    expect(!parseEnrichment(bad, views()).ok).toBe(true);
  });
});
