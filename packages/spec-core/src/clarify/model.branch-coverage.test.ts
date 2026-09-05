import { describe, it, expect } from 'vitest';
import type { ClarificationQuestion } from '../eval/runner';
import { MAX_ANSWER_CHARS } from '../eval/answers';
import {
  questionViews,
  validateAnswer,
  serializeAnswerText,
  mergeRoundRecords,
  applyAnswersToRecords,
  type ClarificationAnswer,
  type ClarificationQuestionView,
} from './model';

/**
 * Branch-coverage companions to model.test.ts: the validation-fallback and
 * record-lineage edges the happy-path suite never reaches — the impact guard
 * fallback, injected claim-id namespaces (L-03), answer-target mismatch, the
 * unknown-kind arm, the COMBINED-serialization ceiling, duplicate/empty
 * submissions, prior-record lineage on re-apply, and superseded resurfacing
 * (§13). Pure functions only: no clock, no I/O, fully deterministic.
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
    question: 'When a customer creates an order, should stock be reserved immediately or only after you approve the order?',
    impact: 'medium',
    alternatives: [],
  },
];

const open = (): ClarificationQuestionView[] => questionViews(QUESTIONS, 1);

describe('questionViews — the impact guard is a fallback, never a failure', () => {
  it("an impact string outside the UI union degrades to 'medium' (the guard exists for the type, not the runtime)", () => {
    const [view] = questionViews([{ ...QUESTIONS[0]!, impact: 'critical' }], 1);
    expect(view!.impact).toBe('medium');
  });

  it('a declared level passes through verbatim', () => {
    const [view] = open();
    expect(view!.impact).toBe('high');
  });
});

describe('validateAnswer — namespace, targeting, kind, and combined-length edges', () => {
  const q = open()[0]!;
  const other = open()[1]!;

  it('an injected claim-id namespace names itself in the refusal (L-03: the default keeps its historical wording)', () => {
    const legacy = /^LEG-\d{3}$/;
    const bad = validateAnswer(
      { decisionId: 'DEC-0004', kind: 'other', freeText: 'A long enough rule text for this answer.' },
      other,
      legacy,
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.error).toContain('recognized claim id');
      expect(bad.error).toContain('DEC-0004');
      expect(bad.error).not.toContain('DEC-NNNN'); // the greenfield wording must not leak into a named namespace
    }
    // the same shape validates once the id matches the injected namespace AND the question carries it
    const legacyView = { ...other, claimId: 'LEG-001' };
    expect(
      validateAnswer({ decisionId: 'LEG-001', kind: 'other', freeText: 'A long enough rule text for this answer.' }, legacyView, legacy).ok,
    ).toBe(true);
  });

  it('a well-formed id that targets a DIFFERENT question is refused with both ids named', () => {
    const r = validateAnswer(
      { decisionId: 'DEC-0004', kind: 'option', selectedOption: 'accept both and split the stock' },
      other,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('answer targets DEC-0004 but the question is DEC-0007');
  });

  it('an unknown kind is refused with the kind named (never guessed into a channel)', () => {
    const r = validateAnswer(
      { decisionId: 'DEC-0004', kind: 'maybe', freeText: 'x'.repeat(40) } as unknown as ClarificationAnswer,
      q,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("answer for DEC-0004 has an unknown kind 'maybe'");
  });

  it(`the ceiling binds the SERIALIZED form: option + a near-ceiling instruction is refused although the text alone fits ${MAX_ANSWER_CHARS}`, () => {
    const free = 'x'.repeat(MAX_ANSWER_CHARS - 10); // alone it fits the answers-channel ceiling...
    const answer: ClarificationAnswer = {
      decisionId: 'DEC-0004',
      kind: 'option',
      selectedOption: 'accept both and split the stock',
      freeText: free,
    };
    expect(serializeAnswerText(answer).length).toBeGreaterThan(MAX_ANSWER_CHARS); // combined wraps both facts
    const r = validateAnswer(answer, q);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('too long once the selected option and your instruction are combined');
    // ...and the same length of custom-only text stays valid (no wrapper overhead)
    expect(validateAnswer({ decisionId: 'DEC-0007', kind: 'other', freeText: free }, other).ok).toBe(true);
  });
});

describe('applyAnswersToRecords — submission-level refusals and record lineage', () => {
  it('a duplicate id in one submission is refused before anything is stored', () => {
    const r = applyAnswersToRecords(
      new Map(),
      [
        { decisionId: 'DEC-0004', kind: 'option', selectedOption: 'accept both and split the stock' },
        { decisionId: 'DEC-0004', kind: 'other', freeText: 'A second, conflicting rule for the same decision.' },
      ],
      open(),
      1,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('duplicate answer for DEC-0004 in one submission');
  });

  it('an empty submission is refused — answering is an explicit act', () => {
    const records = mergeRoundRecords(new Map(), open(), 1);
    const r = applyAnswersToRecords(records, [], open(), 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('the submission carries no answers');
    // and it stored nothing: the round-1 records are unchanged
    expect(r.ok === true || records.get('DEC-0004')!.status).toBe('open');
  });

  it('a first apply opens lineage at the CURRENT round and carries no dependency list', () => {
    const r = applyAnswersToRecords(
      new Map(),
      [{ decisionId: 'DEC-0004', kind: 'option', selectedOption: 'accept both and split the stock' }],
      open(),
      2,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const rec = r.records.get('DEC-0004')!;
    expect(rec).toMatchObject({ claimId: 'DEC-0004', status: 'answered', appliedRound: 2, firstSeenRound: 2 });
    expect('dependsOn' in rec).toBe(false); // no prior record → no dependency to preserve
  });

  it('a re-apply preserves first-seen lineage and stays dependency-free', () => {
    const first = applyAnswersToRecords(
      new Map(),
      [{ decisionId: 'DEC-0004', kind: 'option', selectedOption: 'accept both and split the stock' }],
      open(),
      1,
    );
    if (!first.ok) throw new Error('first apply must succeed');
    const second = applyAnswersToRecords(
      first.records,
      [{ decisionId: 'DEC-0004', kind: 'option', selectedOption: 'first confirmed order gets priority' }],
      open(),
      3,
    );
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    const rec = second.records.get('DEC-0004')!;
    expect(rec.firstSeenRound).toBe(1); // lineage is identity, not "when last answered"
    expect(rec.appliedRound).toBe(3);
    expect(rec.status).toBe('answered');
    expect('dependsOn' in rec).toBe(false);
  });

  it('an answered record KEEPS its declared dependencies through the apply (staleness reads them)', () => {
    const dependent: ClarificationQuestionView[] = [{ ...open()[1]!, dependsOn: ['DEC-0004'] }];
    const records = mergeRoundRecords(new Map(), dependent, 1);
    const r = applyAnswersToRecords(
      records,
      [{ decisionId: 'DEC-0007', kind: 'other', freeText: 'Reserve stock only after approval, never before.' }],
      dependent,
      1,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.records.get('DEC-0007')!.dependsOn).toEqual(['DEC-0004']);
  });
});

describe('mergeRoundRecords — a superseded decision that resurfaces reopens (§13)', () => {
  it('a moot (superseded) question sighted again is a real OPEN question, lineage preserved', () => {
    const seeded = new Map([
      ['DEC-0004', { claimId: 'DEC-0004', firstSeenRound: 1, status: 'superseded' as const, dependsOn: [] }],
    ]);
    const next = mergeRoundRecords(seeded, questionViews(QUESTIONS, 3), 3);
    const rec = next.get('DEC-0004')!;
    expect(rec.status).toBe('open'); // NOT still superseded: resurfacing means it matters again
    expect(rec.firstSeenRound).toBe(1);
    expect('answer' in rec).toBe(false); // a superseded record never carried user evidence
  });
});
