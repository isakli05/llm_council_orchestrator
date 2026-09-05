import { describe, it, expect } from 'vitest';
import type { ClarificationQuestion } from '../eval/runner';
import { parseAnswersFile } from '../eval/answers';
import {
  questionViews,
  attachStatuses,
  validateAnswer,
  answerToUserAnswer,
  serializeAnswerText,
  userAnswerFromPlainText,
  mergeRoundRecords,
  applyAnswersToRecords,
  invalidateDependents,
  MIN_CUSTOM_ANSWER_CHARS,
  type ClarificationAnswer,
  type ClarificationQuestionView,
} from './model';

/**
 * §3/§7/§8/§9/§10/§12/§13/§16 of the owner spec (2026-09-01) — the canonical
 * clarification domain: question views distilled from the runner's
 * ClarificationQuestion set (Layer-0 previews from the bundle's own words),
 * the structured answer contract shared by CLI and browser, deterministic
 * serialization into UserAnswerForPrompt, and the decision-record state
 * rules (new/answered/contradicted/stale + dependency invalidation).
 */

const QUESTIONS: ClarificationQuestion[] = [
  {
    claimId: 'DEC-0004',
    question:
      'If two customers try to complete the remaining quantity for the same fabric at the same time, what should the system do?',
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

describe('questionViews (§7 — richer structure, bundle-verbatim options)', () => {
  it('maps every question with its stable claimId, options, and a Layer-0 preview from the bundle trade-off', () => {
    const views = questionViews(QUESTIONS, 1);
    expect(views).toHaveLength(2);
    const first = views[0]!;
    expect(first.claimId).toBe('DEC-0004');
    expect(first.firstSeenRound).toBe(1);
    expect(first.status).toBe('open');
    expect(first.options).toHaveLength(2);
    // option text is VERBATIM (identity anchor — enrichment must match it exactly)
    expect(first.options[0]!.option).toBe('first confirmed order gets priority');
    // Layer-0 preview: the bundle's own rejected_because wording, no invention
    expect(first.options[0]!.preview).toEqual({
      source: 'bundle',
      text: 'the other customer sees an out-of-stock message',
    });
    // a question with no alternatives has no options — Other is the only path
    expect(views[1]!.options).toEqual([]);
    expect(views[1]!.dependsOn).toEqual([]);
  });

  it('attachStatuses overlays the record state without touching identity', () => {
    const views = questionViews(QUESTIONS, 1);
    const stamped = attachStatuses(views, new Map([['DEC-0004', { status: 'answered' }]]));
    expect(stamped[0]!.status).toBe('answered');
    expect(stamped[1]!.status).toBe('open');
  });
});

describe('validateAnswer (§8/§9/§10 — suggestions never forced, Other valid, empty rejected)', () => {
  const q = questionViews(QUESTIONS, 1)[0]!;
  const other = questionViews(QUESTIONS, 1)[1]!;

  it('accepts a suggested option', () => {
    const a: ClarificationAnswer = { decisionId: 'DEC-0004', kind: 'option', selectedOption: 'accept both and split the stock' };
    expect(validateAnswer(a, q)).toEqual({ ok: true, answer: a });
  });

  it('accepts option + additional explanation (both preserved)', () => {
    const a: ClarificationAnswer = {
      decisionId: 'DEC-0004',
      kind: 'option',
      selectedOption: 'accept both and split the stock',
      freeText: 'Existing dealers imported from our ERP should be exempt.',
    };
    expect(validateAnswer(a, q).ok).toBe(true);
  });

  it('accepts Other-only with meaningful custom text', () => {
    const a: ClarificationAnswer = {
      decisionId: 'DEC-0007',
      kind: 'other',
      freeText: 'The dealer should first enter their tax number; if it exists in Logo ERP they may enter immediately.',
    };
    expect(validateAnswer(a, other).ok).toBe(true);
  });

  it('rejects an empty/whitespace answer (no option, no meaningful text)', () => {
    expect(validateAnswer({ decisionId: 'DEC-0007', kind: 'other', freeText: '   ' }, other).ok).toBe(false);
    expect(validateAnswer({ decisionId: 'DEC-0007', kind: 'other' }, other).ok).toBe(false);
  });

  it(`rejects Other text under ${MIN_CUSTOM_ANSWER_CHARS} meaningful characters`, () => {
    expect(validateAnswer({ decisionId: 'DEC-0007', kind: 'other', freeText: 'too short' }, other).ok).toBe(false);
  });

  it('rejects an unknown option (must match an offered option exactly)', () => {
    const r = validateAnswer({ decisionId: 'DEC-0004', kind: 'option', selectedOption: 'coin flip' }, q);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('DEC-0004');
  });

  it('rejects option-kind without a selection and nonsense kinds/ids', () => {
    expect(validateAnswer({ decisionId: 'DEC-0004', kind: 'option' }, q).ok).toBe(false);
    expect(validateAnswer({ decisionId: 'REQ-0001', kind: 'other', freeText: 'some long enough answer text' }, other).ok).toBe(false);
  });

  it('rejects answers longer than the answers-channel ceiling (serialized form)', () => {
    const long = 'x'.repeat(4001);
    expect(validateAnswer({ decisionId: 'DEC-0007', kind: 'other', freeText: long }, other).ok).toBe(false);
  });
});

describe('serialization (§16 — user evidence never flattened, provenance preserved)', () => {
  it('option + text serializes BOTH facts deterministically', () => {
    const text = serializeAnswerText({
      decisionId: 'DEC-0004',
      kind: 'option',
      selectedOption: 'first confirmed order gets priority',
      freeText: 'Dealers imported from our ERP skip the queue.',
    });
    expect(text).toBe(
      'Selected: "first confirmed order gets priority". ' +
        'Additional instruction from the product owner: "Dealers imported from our ERP skip the queue."',
    );
  });

  it('option-only and Other-only forms', () => {
    expect(serializeAnswerText({ decisionId: 'DEC-0004', kind: 'option', selectedOption: 'accept both and split the stock' })).toBe(
      'Selected: "accept both and split the stock"',
    );
    expect(serializeAnswerText({ decisionId: 'DEC-0007', kind: 'other', freeText: '  Reserve stock only after approval.  ' })).toBe(
      'Reserve stock only after approval.',
    );
  });

  it('answerToUserAnswer produces the canonical evidence shape (hash + source)', () => {
    const ua = answerToUserAnswer(
      { decisionId: 'DEC-0004', kind: 'option', selectedOption: 'accept both and split the stock' },
      'clarify-web:s1/round2',
    );
    expect(ua.claimId).toBe('DEC-0004');
    expect(ua.source).toBe('clarify-web:s1/round2');
    expect(ua.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(ua.answer).toBe('Selected: "accept both and split the stock"');
  });

  it('plain-text answers (the --answers channel) map onto the same representation', () => {
    const parsed = parseAnswersFile('{"DEC-0004": "first confirmed order gets priority"}', 'answers:a.json');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const viaFile = parsed.answers[0]!;
    const viaModel = userAnswerFromPlainText('DEC-0004', 'first confirmed order gets priority', 'answers:a.json');
    // identical evidence: same claim, same verbatim text, same hash rule, same source semantics
    expect(viaModel.answer).toBe(viaFile.answer);
    expect(viaModel.hash).toBe(viaFile.hash);
  });

  it('the serialized form round-trips through parseAnswersFile (headless reproducibility)', () => {
    const ua = answerToUserAnswer(
      { decisionId: 'DEC-0007', kind: 'other', freeText: 'Reserve stock only after you approve the order.' },
      'clarify-web:s1/round1',
    );
    const file = JSON.stringify({ [ua.claimId]: ua.answer });
    const back = parseAnswersFile(file, 'replay.json');
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.answers[0]!.answer).toBe(ua.answer);
    expect(back.answers[0]!.hash).toBe(ua.hash);
  });
});

describe('decision records (§12/§13 — identity, contradiction, conditional staleness)', () => {
  it('mergeRoundRecords: first sighting creates an open record; later sighting of an ANSWERED id flags contradiction', () => {
    let records = mergeRoundRecords(new Map(), questionViews(QUESTIONS, 1), 1);
    expect(records.get('DEC-0004')).toMatchObject({ status: 'open', firstSeenRound: 1 });

    const answered = applyAnswersToRecords(
      records,
      [{ decisionId: 'DEC-0004', kind: 'option', selectedOption: 'accept both and split the stock' }],
      questionViews(QUESTIONS, 1),
      1,
    );
    expect(answered.ok).toBe(true);
    if (!answered.ok) return;
    expect(answered.records.get('DEC-0004')!.status).toBe('answered');

    // next round re-surfaces the SAME id → contradicted, never a silent re-ask
    const round2 = mergeRoundRecords(answered.records, questionViews(QUESTIONS, 2), 2);
    expect(round2.get('DEC-0004')!.status).toBe('contradicted');
    // a brand-new id stays open
    expect(round2.get('DEC-0007')!.status).toBe('open');
  });

  it('applyAnswersToRecords rejects an invalid answer set atomically (nothing stored)', () => {
    const views = questionViews(QUESTIONS, 1);
    const records = mergeRoundRecords(new Map(), views, 1);
    const bad = applyAnswersToRecords(
      records,
      [
        { decisionId: 'DEC-0004', kind: 'option', selectedOption: 'not an option' },
        { decisionId: 'DEC-0007', kind: 'other', freeText: 'Reserve stock only after approval.' },
      ],
      views,
      1,
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.error).toContain('DEC-0004');
      // atomic: the valid sibling was NOT stored either
      expect(records.get('DEC-0007')!.status).toBe('open');
    }
  });

  it('invalidateDependents marks stored answers stale when their dependency is re-answered (conditional questions)', () => {
    const views = questionViews(QUESTIONS, 1);
    const withDeps: ClarificationQuestionView[] = [
      { ...views[1]!, dependsOn: ['DEC-0004'] },
    ];
    let records = mergeRoundRecords(new Map(), views, 1);
    records = mergeRoundRecords(records, withDeps, 2);
    const applied = applyAnswersToRecords(
      records,
      [
        { decisionId: 'DEC-0004', kind: 'option', selectedOption: 'accept both and split the stock' },
        { decisionId: 'DEC-0007', kind: 'other', freeText: 'Only supervisors may approve after hours.' },
      ],
      [...views.slice(0, 1), withDeps[0]!],
      2,
    );
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    // the user now CHANGES the DEC-0004 answer → DEC-0007 (declared dependent) goes stale
    const stale = invalidateDependents(applied.records, 'DEC-0004');
    expect(stale.get('DEC-0007')!.status).toBe('stale');
    expect(stale.get('DEC-0004')!.status).toBe('answered'); // untouched by invalidation
  });
});
